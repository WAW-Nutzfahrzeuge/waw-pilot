type EmailAttachment = {
    filename: string;
    content: Buffer;
    contentType?: string;
};

type SendEmailParams = {
    to: string | string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text: string;
    html?: string;
    from?: string;
    replyTo?: string | null;
    attachments?: EmailAttachment[];
    idempotencyKey?: string;
};

type SendEmailResult = {
    providerMessageId: string | null;
    providerResponse: Record<string, unknown> | null;
};

export class EmailConfigurationError extends Error {
    constructor() {
        super(
            "E-Mail-Versand ist noch nicht eingerichtet. Bitte RESEND_API_KEY und die Rechnungs-Absender-E-Mail in den Einstellungen konfigurieren.",
        );
        this.name = "EmailConfigurationError";
    }
}

export class EmailSendError extends Error {
    constructor() {
        super("Rechnung konnte nicht per E-Mail gesendet werden. Bitte versuche es erneut.");
        this.name = "EmailSendError";
    }
}

export async function sendEmailWithResend({
    to,
    cc = [],
    bcc = [],
    subject,
    text,
    html,
    from: explicitFrom,
    replyTo,
    attachments = [],
    idempotencyKey,
}: SendEmailParams): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = explicitFrom?.trim();

    if (!apiKey || !from) {
        throw new EmailConfigurationError();
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify({
            from,
            to,
            cc: cc.length > 0 ? cc : undefined,
            bcc: bcc.length > 0 ? bcc : undefined,
            reply_to: replyTo ?? undefined,
            subject,
            text,
            html,
            attachments: attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content.toString("base64"),
                content_type: attachment.contentType,
            })),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error("[email] Resend delivery failed", {
            status: response.status,
            response: errorText,
        });
        throw new EmailSendError();
    }

    const responseBody = (await response.json().catch(() => null)) as
        | { id?: string }
        | null;

    return {
        providerMessageId: responseBody?.id ?? null,
        providerResponse: responseBody ? { ...responseBody } : null,
    };
}
