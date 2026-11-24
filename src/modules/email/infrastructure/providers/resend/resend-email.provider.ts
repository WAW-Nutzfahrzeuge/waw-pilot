import {
    EmailConfigurationError,
    sendEmailWithResend,
} from "@/lib/email/resend";
import { SenderConfigurationMissingError } from "@/src/modules/email/domain/errors/email-errors";
import type {
    EmailProviderPort,
    EmailProviderRequest,
} from "@/src/modules/email/application/ports/email-provider.port";

export class ResendEmailProvider implements EmailProviderPort {
    async send(request: EmailProviderRequest) {
        try {
            return await sendEmailWithResend({
                from: request.from,
                replyTo: request.replyTo,
                to: request.to,
                cc: request.cc,
                bcc: request.bcc,
                subject: request.subject,
                text: request.text,
                html: request.html,
                attachments: request.attachments.map((attachment) => ({
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType,
                    contentId: attachment.contentId,
                })),
                idempotencyKey: request.idempotencyKey,
            });
        } catch (error) {
            if (error instanceof EmailConfigurationError) {
                throw new SenderConfigurationMissingError(error.message);
            }

            throw error;
        }
    }
}
