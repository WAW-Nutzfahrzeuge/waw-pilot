import { EmailMessage } from "@/src/modules/email/domain/entities/email-message";
import { EmailAttachment } from "@/src/modules/email/domain/entities/email-attachment";
import { EmailRecipientService } from "@/src/modules/email/domain/services/email-recipient.service";
import { EmailAttachmentPolicy, emailAttachmentLimits } from "@/src/modules/email/domain/policies/email-attachment-policy";
import {
    EmailAlreadySentError,
    EmailProviderUnavailableError,
} from "@/src/modules/email/domain/errors/email-errors";
import type { SendEmailCommand } from "@/src/modules/email/application/commands/send-email.command";
import type { EmailMessageDto } from "@/src/modules/email/application/dto/email.dto";
import type {
    EmailAttachmentReaderPort,
    ResolvedEmailAttachment,
} from "@/src/modules/email/application/ports/email-attachment-reader.port";
import type { EmailAuditPort } from "@/src/modules/email/application/ports/email-audit.port";
import type { EmailProviderPort } from "@/src/modules/email/application/ports/email-provider.port";
import type { EmailRepositoryPort } from "@/src/modules/email/application/ports/email-repository.port";
import type { EmailActivityPort } from "@/src/modules/email/application/ports/email-activity.port";

export class SendEmailUseCase {
    private readonly recipientService = new EmailRecipientService();
    private readonly attachmentPolicy = new EmailAttachmentPolicy();

    constructor(
        private readonly repository: EmailRepositoryPort,
        private readonly attachmentReader: EmailAttachmentReaderPort,
        private readonly provider: EmailProviderPort,
        private readonly audit: EmailAuditPort,
        private readonly activity: EmailActivityPort,
    ) {}

    async execute(command: SendEmailCommand): Promise<EmailMessageDto> {
        const existingEmail = await this.repository.findByIdempotencyKey({
            companyId: command.companyId,
            idempotencyKey: command.idempotencyKey,
        });

        if (existingEmail?.status === "SENT" || existingEmail?.status === "DELIVERED") {
            return existingEmail;
        }

        if (existingEmail?.status === "SENDING") {
            throw new EmailAlreadySentError(
                "Diese E-Mail wird bereits verarbeitet. Bitte prüfe die Versandhistorie.",
            );
        }

        const recipients = this.recipientService.createUniqueRecipients([
            ...command.toRecipients.map((recipient) => ({ ...recipient, kind: "to" as const })),
            ...(command.ccRecipients ?? []).map((recipient) => ({
                ...recipient,
                kind: "cc" as const,
            })),
            ...(command.bccRecipients ?? []).map((recipient) => ({
                ...recipient,
                kind: "bcc" as const,
            })),
        ]);

        const resolvedAttachments: ResolvedEmailAttachment[] = [];
        for (const attachment of command.documentAttachments ?? []) {
            resolvedAttachments.push(
                await this.attachmentReader.readDocumentAttachment({
                    companyId: command.companyId,
                    documentId: attachment.documentId,
                    documentVersionId: attachment.documentVersionId,
                    attachmentType: attachment.attachmentType ?? "document",
                }),
            );
        }
        for (const attachment of command.resolvedAttachments ?? []) {
            resolvedAttachments.push({
                documentId: "",
                documentVersionId: null,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                fileSizeBytes: attachment.fileSizeBytes,
                content: attachment.content,
                attachmentType: attachment.attachmentType ?? "file",
            });
        }

        const domainAttachments = resolvedAttachments.map((attachment) =>
            EmailAttachment.create(
                {
                    documentId: attachment.documentId,
                    documentVersionId: attachment.documentVersionId,
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    fileSizeBytes: attachment.fileSizeBytes,
                    attachmentType: attachment.attachmentType,
                },
                emailAttachmentLimits.maxFileSizeBytes,
            ),
        );

        this.attachmentPolicy.assertWithinTotalLimit(domainAttachments);

        const message = new EmailMessage({
            companyId: command.companyId,
            contextType: command.contextType,
            contextId: command.contextId ?? null,
            subject: command.subject,
            bodyHtml: command.bodyHtml,
            bodyText: command.bodyText ?? null,
            recipients,
            attachments: domainAttachments,
            status: "DRAFT",
        });
        message.validateBeforeSend();
        message.assertTransition("READY_TO_SEND");

        const persistedEmail = existingEmail?.status === "FAILED"
            ? await this.repository.claimFailedMessageForRetry({
                companyId: command.companyId,
                emailId: existingEmail.id,
                actorId: command.actorId,
            })
            : await this.repository.createSendingMessage({
                ...command,
                status: "SENDING",
                attachments: resolvedAttachments.map((attachment, index) => ({
                    documentId: attachment.documentId.length > 0 ? attachment.documentId : null,
                    documentVersionId: attachment.documentVersionId,
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType,
                    fileSizeBytes: attachment.fileSizeBytes,
                    attachmentType: attachment.attachmentType,
                    sortOrder: index,
                })),
            });

        if (!persistedEmail) {
            throw new EmailAlreadySentError(
                "Diese E-Mail wird bereits verarbeitet. Bitte prüfe die Versandhistorie.",
            );
        }

        await this.audit.record({
            companyId: command.companyId,
            emailId: persistedEmail.id,
            action: "SEND_STARTED",
            newValues: {
                contextType: command.contextType,
                contextId: command.contextId ?? null,
                templateKey: command.templateKey ?? null,
                subject: command.subject,
                attachmentCount: resolvedAttachments.length,
            },
            actorId: command.actorId,
        });

        try {
            const providerResult = await this.provider.send({
                from: `${command.senderName} <${command.senderEmail}>`,
                replyTo: command.replyToEmail ?? null,
                to: recipients
                    .filter((recipient) => recipient.kind === "to")
                    .map((recipient) => recipient.email.value),
                cc: recipients
                    .filter((recipient) => recipient.kind === "cc")
                    .map((recipient) => recipient.email.value),
                bcc: recipients
                    .filter((recipient) => recipient.kind === "bcc")
                    .map((recipient) => recipient.email.value),
                subject: command.subject,
                text: command.bodyText ?? command.bodyHtml.replace(/<[^>]+>/g, " "),
                html: command.bodyHtml,
                attachments: resolvedAttachments.map((attachment) => ({
                    filename: attachment.fileName,
                    content: attachment.content,
                    contentType: attachment.mimeType,
                })),
                idempotencyKey: command.idempotencyKey,
            });

            await this.repository.markSent({
                companyId: command.companyId,
                emailId: persistedEmail.id,
                providerMessageId: providerResult.providerMessageId,
                providerResponse: providerResult.providerResponse,
            });
            await this.repository.createDeliveryAttempt({
                companyId: command.companyId,
                emailId: persistedEmail.id,
                provider: "resend",
                status: "SENT",
                providerMessageId: providerResult.providerMessageId,
                providerResponse: providerResult.providerResponse,
                actorId: command.actorId,
            });
            await this.audit.record({
                companyId: command.companyId,
                emailId: persistedEmail.id,
                action: "SENT",
                newValues: {
                    providerMessageId: providerResult.providerMessageId,
                },
                actorId: command.actorId,
            });
            await this.activity.record({
                action: `E-Mail ${persistedEmail.emailReference} an ${recipients
                    .filter((recipient) => recipient.kind === "to")
                    .map((recipient) => recipient.email.value)
                    .join(", ")} gesendet`,
                entityType: "email",
                entityId: persistedEmail.id,
            });

            return {
                ...persistedEmail,
                status: "SENT",
                sentAt: new Date().toISOString(),
                failedAt: null,
                failureMessage: null,
            };
        } catch (error) {
            const messageText =
                error instanceof Error
                    ? error.message
                    : "Der E-Mail-Provider ist nicht erreichbar.";

            await this.repository.markFailed({
                companyId: command.companyId,
                emailId: persistedEmail.id,
                failureCode: "PROVIDER_ERROR",
                failureMessage: messageText,
            });
            await this.repository.createDeliveryAttempt({
                companyId: command.companyId,
                emailId: persistedEmail.id,
                provider: "resend",
                status: "FAILED",
                providerMessageId: null,
                providerResponse: null,
                failureCode: "PROVIDER_ERROR",
                failureMessage: messageText,
                actorId: command.actorId,
            });
            await this.audit.record({
                companyId: command.companyId,
                emailId: persistedEmail.id,
                action: "FAILED",
                newValues: { failureCode: "PROVIDER_ERROR" },
                actorId: command.actorId,
            });

            throw new EmailProviderUnavailableError(messageText);
        }
    }
}
