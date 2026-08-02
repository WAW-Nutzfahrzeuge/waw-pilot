import type { SendEmailCommand } from "@/src/modules/email/application/commands/send-email.command";
import type {
    EmailMessageDto,
    EmailSearchResultDto,
} from "@/src/modules/email/application/dto/email.dto";
import type { GetEmailDetailQuery } from "@/src/modules/email/application/queries/get-email-detail.query";
import type { SearchEmailsQuery } from "@/src/modules/email/application/queries/search-emails.query";

export type PersistedEmailAttachment = {
    documentId: string | null;
    documentVersionId: string | null;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    attachmentType: string;
    sortOrder: number;
};

export type CreateEmailMessageInput = SendEmailCommand & {
    status: "SENDING";
    attachments: PersistedEmailAttachment[];
};

export interface EmailRepositoryPort {
    findByIdempotencyKey(params: {
        companyId: string;
        idempotencyKey: string;
    }): Promise<EmailMessageDto | null>;
    createSendingMessage(input: CreateEmailMessageInput): Promise<EmailMessageDto>;
    markSent(params: {
        companyId: string;
        emailId: string;
        providerMessageId: string | null;
        providerResponse: Record<string, unknown> | null;
    }): Promise<void>;
    markFailed(params: {
        companyId: string;
        emailId: string;
        failureCode: string;
        failureMessage: string;
    }): Promise<void>;
    claimFailedMessageForRetry(params: {
        companyId: string;
        emailId: string;
        actorId?: string | null;
    }): Promise<EmailMessageDto | null>;
    createDeliveryAttempt(params: {
        companyId: string;
        emailId: string;
        provider: string;
        status: "SENT" | "FAILED";
        providerMessageId: string | null;
        providerResponse: Record<string, unknown> | null;
        failureCode?: string | null;
        failureMessage?: string | null;
        actorId?: string | null;
    }): Promise<void>;
    search(query: SearchEmailsQuery): Promise<EmailSearchResultDto>;
    findDetail(query: GetEmailDetailQuery): Promise<EmailMessageDto | null>;
}
