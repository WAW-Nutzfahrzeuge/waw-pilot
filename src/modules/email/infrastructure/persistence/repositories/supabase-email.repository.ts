import type { SupabaseClient } from "@supabase/supabase-js";

import type {
    EmailAttachmentDto,
    EmailListItemDto,
    EmailMessageDto,
    EmailRecipientDto,
} from "@/src/modules/email/application/dto/email.dto";
import type { GetEmailDetailQuery } from "@/src/modules/email/application/queries/get-email-detail.query";
import type { SearchEmailsQuery } from "@/src/modules/email/application/queries/search-emails.query";
import type {
    CreateEmailMessageInput,
    EmailRepositoryPort,
} from "@/src/modules/email/application/ports/email-repository.port";
import type { EmailContextType } from "@/src/modules/email/domain/constants/email-context";
import type { EmailSendStatus } from "@/src/modules/email/domain/constants/email-status";

type JsonRecipient = {
    email?: unknown;
    name?: unknown;
};

type EmailAttachmentRow = {
    id: string;
    document_id: string | null;
    document_version_id: string | null;
    file_name: string;
    mime_type: string;
    file_size_bytes: number | string;
    attachment_type: string;
};

type EmailMessageRow = {
    id: string;
    email_reference: string;
    context_type: string;
    context_id: string | null;
    template_key: string | null;
    sender_name: string;
    sender_email: string;
    to_recipients: unknown;
    cc_recipients: unknown;
    bcc_recipients: unknown;
    subject: string;
    body_html: string;
    body_text: string | null;
    status: string;
    provider: string;
    sent_at: string | null;
    failed_at: string | null;
    failure_message: string | null;
    retry_count: number | null;
    created_at: string;
    email_attachments?: EmailAttachmentRow[] | null;
};

type SupabaseErrorLike = {
    code?: string;
    message: string;
};

const baseEmailSelect = `
  id,
  email_reference,
  context_type,
  context_id,
  template_key,
  sender_name,
  sender_email,
  to_recipients,
  cc_recipients,
  bcc_recipients,
  subject,
  body_html,
  body_text,
  status,
  provider,
  sent_at,
  failed_at,
  failure_message,
  retry_count,
  created_at
`;

const emailSelect = `
  ${baseEmailSelect},
  email_attachments (
    id,
    document_id,
    document_version_id,
    file_name,
    mime_type,
    file_size_bytes,
    attachment_type
  )
`;

function isMissingEmailSchemaResource(error: SupabaseErrorLike | null | undefined): boolean {
    if (!error) return false;

    return (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message.includes("Could not find the table 'public.email_") ||
        error.message.includes("relation \"public.email_") ||
        error.message.includes("schema cache")
    );
}

function isMissingEmailAttachmentRelationship(error: SupabaseErrorLike | null | undefined): boolean {
    if (!error) return false;

    return (
        error.code === "PGRST200" ||
        (error.message.includes("relationship") &&
            error.message.includes("email_messages") &&
            error.message.includes("email_attachments"))
    );
}

function toRecipients(value: unknown): EmailRecipientDto[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((recipient: JsonRecipient) => {
            if (typeof recipient.email !== "string") return null;

            return {
                email: recipient.email,
                name: typeof recipient.name === "string" ? recipient.name : null,
            };
        })
        .filter((recipient): recipient is EmailRecipientDto => recipient !== null);
}

function toAttachments(rows: EmailAttachmentRow[] | null | undefined): EmailAttachmentDto[] {
    return (rows ?? []).map((attachment) => ({
        id: attachment.id,
        documentId: attachment.document_id,
        documentVersionId: attachment.document_version_id,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        fileSizeBytes: Number(attachment.file_size_bytes),
        attachmentType: attachment.attachment_type,
    }));
}

function mapEmailRow(row: EmailMessageRow): EmailMessageDto {
    return {
        id: row.id,
        emailReference: row.email_reference,
        contextType: row.context_type as EmailContextType,
        contextId: row.context_id,
        templateKey: row.template_key,
        senderName: row.sender_name,
        senderEmail: row.sender_email,
        toRecipients: toRecipients(row.to_recipients),
        ccRecipients: toRecipients(row.cc_recipients),
        bccRecipients: toRecipients(row.bcc_recipients),
        subject: row.subject,
        bodyHtml: row.body_html,
        bodyText: row.body_text,
        status: row.status as EmailSendStatus,
        provider: row.provider,
        sentAt: row.sent_at,
        failedAt: row.failed_at,
        failureMessage: row.failure_message,
        retryCount: row.retry_count ?? 0,
        attachments: toAttachments(row.email_attachments),
        createdAt: row.created_at,
    };
}

function mapListItem(row: EmailMessageRow): EmailListItemDto {
    const detail = mapEmailRow(row);

    return {
        id: detail.id,
        emailReference: detail.emailReference,
        status: detail.status,
        contextType: detail.contextType,
        contextId: detail.contextId,
        templateKey: detail.templateKey,
        toRecipients: detail.toRecipients,
        subject: detail.subject,
        sentAt: detail.sentAt,
        createdAt: detail.createdAt,
        attachmentCount: detail.attachments.length,
    };
}

export class SupabaseEmailRepository implements EmailRepositoryPort {
    constructor(private readonly supabase: SupabaseClient) {}

    async findByIdempotencyKey(params: {
        companyId: string;
        idempotencyKey: string;
    }): Promise<EmailMessageDto | null> {
        const { data, error } = await this.supabase
            .from("email_messages")
            .select(emailSelect)
            .eq("company_id", params.companyId)
            .eq("idempotency_key", params.idempotencyKey)
            .maybeSingle();

        if (error || !data) return null;

        return mapEmailRow(data as unknown as EmailMessageRow);
    }

    async createSendingMessage(input: CreateEmailMessageInput): Promise<EmailMessageDto> {
        const toRecipients = input.toRecipients.map((recipient) => ({
            email: recipient.email.trim().toLowerCase(),
            name: recipient.name ?? null,
        }));
        const ccRecipients = (input.ccRecipients ?? []).map((recipient) => ({
            email: recipient.email.trim().toLowerCase(),
            name: recipient.name ?? null,
        }));
        const bccRecipients = (input.bccRecipients ?? []).map((recipient) => ({
            email: recipient.email.trim().toLowerCase(),
            name: recipient.name ?? null,
        }));

        const { data, error } = await this.supabase
            .from("email_messages")
            .insert({
                company_id: input.companyId,
                email_reference: "",
                context_type: input.contextType,
                context_id: input.contextId ?? null,
                template_key: input.templateKey ?? null,
                sender_name: input.senderName,
                sender_email: input.senderEmail,
                reply_to_email: input.replyToEmail ?? null,
                to_recipients: toRecipients,
                cc_recipients: ccRecipients,
                bcc_recipients: bccRecipients,
                subject: input.subject,
                body_html: input.bodyHtml,
                body_text: input.bodyText ?? null,
                status: "SENDING",
                provider: "resend",
                idempotency_key: input.idempotencyKey,
                created_by: input.actorId ?? null,
                updated_by: input.actorId ?? null,
                metadata: input.metadata ?? {},
            })
            .select(emailSelect)
            .single();

        if (error || !data) {
            throw new Error(`E-Mail konnte nicht angelegt werden: ${error?.message ?? "Unbekannter Fehler"}`);
        }

        const email = mapEmailRow(data as unknown as EmailMessageRow);

        if (input.attachments.length > 0) {
            const { error: attachmentError } = await this.supabase
                .from("email_attachments")
                .insert(
                    input.attachments.map((attachment) => ({
                        company_id: input.companyId,
                        email_message_id: email.id,
                        document_id: attachment.documentId,
                        document_version_id: attachment.documentVersionId,
                        file_name: attachment.fileName,
                        mime_type: attachment.mimeType,
                        file_size_bytes: attachment.fileSizeBytes,
                        attachment_type: attachment.attachmentType,
                        sort_order: attachment.sortOrder,
                        created_by: input.actorId ?? null,
                    })),
                );

            if (attachmentError) {
                throw new Error(`E-Mail-Anhänge konnten nicht gespeichert werden: ${attachmentError.message}`);
            }
        }

        if (input.relations?.length) {
            const { error: relationError } = await this.supabase
                .from("email_relations")
                .insert(
                    input.relations.map((relation) => ({
                        company_id: input.companyId,
                        email_message_id: email.id,
                        relation_type: relation.relationType,
                        relation_id: relation.relationId,
                        created_by: input.actorId ?? null,
                    })),
                );

            if (relationError) {
                throw new Error(`E-Mail-Verknüpfungen konnten nicht gespeichert werden: ${relationError.message}`);
            }
        }

        return {
            ...email,
            attachments: input.attachments.map((attachment, index) => ({
                id: `${email.id}-${index}`,
                documentId: attachment.documentId,
                documentVersionId: attachment.documentVersionId,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                fileSizeBytes: attachment.fileSizeBytes,
                attachmentType: attachment.attachmentType,
            })),
        };
    }

    async markSent(params: {
        companyId: string;
        emailId: string;
        providerMessageId: string | null;
        providerResponse: Record<string, unknown> | null;
    }): Promise<void> {
        const { error } = await this.supabase
            .from("email_messages")
            .update({
                status: "SENT",
                provider_message_id: params.providerMessageId,
                provider_response: params.providerResponse,
                sent_at: new Date().toISOString(),
                failed_at: null,
                failure_code: null,
                failure_message: null,
            })
            .eq("company_id", params.companyId)
            .eq("id", params.emailId);

        if (error) {
            throw new Error(`E-Mail-Status konnte nicht gespeichert werden: ${error.message}`);
        }
    }

    async markFailed(params: {
        companyId: string;
        emailId: string;
        failureCode: string;
        failureMessage: string;
    }): Promise<void> {
        const { error } = await this.supabase
            .from("email_messages")
            .update({
                status: "FAILED",
                failed_at: new Date().toISOString(),
                failure_code: params.failureCode,
                failure_message: params.failureMessage,
            })
            .eq("company_id", params.companyId)
            .eq("id", params.emailId);

        if (error) {
            console.error("[email] failed status could not be stored", error.message);
        }
    }

    async claimFailedMessageForRetry(params: {
        companyId: string;
        emailId: string;
        actorId?: string | null;
    }): Promise<EmailMessageDto | null> {
        const { data, error } = await this.supabase
            .from("email_messages")
            .update({
                status: "SENDING",
                failed_at: null,
                failure_code: null,
                failure_message: null,
                updated_by: params.actorId ?? null,
            })
            .eq("company_id", params.companyId)
            .eq("id", params.emailId)
            .eq("status", "FAILED")
            .select(emailSelect)
            .maybeSingle();

        if (error) {
            throw new Error(`E-Mail konnte nicht erneut gestartet werden: ${error.message}`);
        }

        return data ? mapEmailRow(data as unknown as EmailMessageRow) : null;
    }

    async createDeliveryAttempt(params: {
        companyId: string;
        emailId: string;
        provider: string;
        status: "SENT" | "FAILED";
        providerMessageId: string | null;
        providerResponse: Record<string, unknown> | null;
        failureCode?: string | null;
        failureMessage?: string | null;
        actorId?: string | null;
    }): Promise<void> {
        const { count } = await this.supabase
            .from("email_delivery_attempts")
            .select("id", { count: "exact", head: true })
            .eq("company_id", params.companyId)
            .eq("email_message_id", params.emailId);

        const { error } = await this.supabase.from("email_delivery_attempts").insert({
            company_id: params.companyId,
            email_message_id: params.emailId,
            attempt_number: (count ?? 0) + 1,
            provider: params.provider,
            provider_message_id: params.providerMessageId,
            status: params.status,
            completed_at: new Date().toISOString(),
            failure_code: params.failureCode ?? null,
            failure_message: params.failureMessage ?? null,
            provider_response: params.providerResponse,
            created_by: params.actorId ?? null,
        });

        if (error) {
            console.error("[email] delivery attempt could not be stored", error.message);
        }
    }

    async search(query: SearchEmailsQuery) {
        let relatedEmailIds: string[] = [];

        if (query.contextType && query.contextId) {
            const { data: relationData, error: relationError } = await this.supabase
                .from("email_relations")
                .select("email_message_id")
                .eq("company_id", query.companyId)
                .eq("relation_type", query.contextType)
                .eq("relation_id", query.contextId);

            if (relationError && !isMissingEmailSchemaResource(relationError)) {
                throw new Error(`E-Mail-Verknüpfungen konnten nicht geladen werden: ${relationError.message}`);
            }

            relatedEmailIds = (relationData ?? [])
                .map((relation) => relation.email_message_id)
                .filter((emailId): emailId is string => typeof emailId === "string");
        }

        const buildSearchRequest = (select: string) => {
            let request = this.supabase
                .from("email_messages")
                .select(select, { count: "exact" })
                .eq("company_id", query.companyId)
                .order("created_at", { ascending: false });

            if (query.status) request = request.eq("status", query.status);
            if (query.contextType && query.contextId) {
                if (relatedEmailIds.length > 0) {
                    request = request.or(
                        `and(context_type.eq.${query.contextType},context_id.eq.${query.contextId}),id.in.(${relatedEmailIds.join(",")})`,
                    );
                } else {
                    request = request
                        .eq("context_type", query.contextType)
                        .eq("context_id", query.contextId);
                }
            } else {
                if (query.contextType) request = request.eq("context_type", query.contextType);
                if (query.contextId) request = request.eq("context_id", query.contextId);
            }
            if (query.search?.trim()) {
                const search = query.search.trim();
                request = request.or(
                    [
                        `email_reference.ilike.%${search}%`,
                        `subject.ilike.%${search}%`,
                        `template_key.ilike.%${search}%`,
                    ].join(","),
                );
            }

            const offset = query.offset ?? 0;
            const limit = query.limit ?? 50;
            return request.range(offset, offset + limit - 1);
        };

        const { data, error, count } = await buildSearchRequest(emailSelect);

        if (error) {
            if (isMissingEmailAttachmentRelationship(error)) {
                const fallback = await buildSearchRequest(baseEmailSelect);
                if (fallback.error) {
                    if (isMissingEmailSchemaResource(fallback.error)) {
                        return { emails: [], totalCount: 0 };
                    }

                    throw new Error(`E-Mail-Historie konnte nicht geladen werden: ${fallback.error.message}`);
                }

                return {
                    emails: ((fallback.data ?? []) as unknown as EmailMessageRow[]).map(mapListItem),
                    totalCount: fallback.count ?? 0,
                };
            }

            if (isMissingEmailSchemaResource(error)) {
                return { emails: [], totalCount: 0 };
            }

            throw new Error(`E-Mail-Historie konnte nicht geladen werden: ${error.message}`);
        }

        return {
            emails: ((data ?? []) as unknown as EmailMessageRow[]).map(mapListItem),
            totalCount: count ?? 0,
        };
    }

    async findDetail(query: GetEmailDetailQuery): Promise<EmailMessageDto | null> {
        const { data, error } = await this.supabase
            .from("email_messages")
            .select(emailSelect)
            .eq("company_id", query.companyId)
            .eq("id", query.emailId)
            .single();

        if (error || !data) return null;

        return mapEmailRow(data as unknown as EmailMessageRow);
    }
}
