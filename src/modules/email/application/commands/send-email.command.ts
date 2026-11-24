import type { EmailContextType } from "@/src/modules/email/domain/constants/email-context";
import type { EmailTemplateKey } from "@/src/modules/email/domain/constants/email-template-keys";

export type SendEmailRecipientCommand = {
    email: string;
    name?: string | null;
};

export type SendEmailAttachmentCommand = {
    documentId: string;
    documentVersionId?: string | null;
    attachmentType?: string;
};

export type SendEmailResolvedAttachmentCommand = {
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    content: Buffer;
    attachmentType?: string;
};

export type SendEmailRelationCommand = {
    relationType: EmailContextType;
    relationId: string;
};

export type SendEmailCommand = {
    companyId: string;
    actorId?: string | null;
    contextType: EmailContextType;
    contextId?: string | null;
    templateKey?: EmailTemplateKey | string | null;
    senderName: string;
    senderEmail: string;
    replyToEmail?: string | null;
    toRecipients: SendEmailRecipientCommand[];
    ccRecipients?: SendEmailRecipientCommand[];
    bccRecipients?: SendEmailRecipientCommand[];
    subject: string;
    bodyHtml: string;
    bodyText?: string | null;
    includeCompanySignature?: boolean;
    documentAttachments?: SendEmailAttachmentCommand[];
    resolvedAttachments?: SendEmailResolvedAttachmentCommand[];
    relations?: SendEmailRelationCommand[];
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
};
