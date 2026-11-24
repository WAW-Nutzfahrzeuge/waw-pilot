export type EmailProviderAttachment = {
    filename: string;
    content: Buffer;
    contentType: string;
    contentId?: string;
};

export type EmailProviderRequest = {
    from: string;
    replyTo?: string | null;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    text: string;
    html: string;
    attachments: EmailProviderAttachment[];
    idempotencyKey: string;
};

export type EmailProviderResult = {
    providerMessageId: string | null;
    providerResponse: Record<string, unknown> | null;
};

export interface EmailProviderPort {
    send(request: EmailProviderRequest): Promise<EmailProviderResult>;
}
