import "server-only";

import { logActivity } from "@/lib/activity/activity-log";
import { getOptionalCurrentAuthUserId } from "@/lib/auth/current-user";
import { getDatevInvoiceUploadEmail } from "@/lib/email/datev-recipient";
import { getInvoiceMailSender } from "@/lib/email/company-mail-sender";
import { getDatevInvoiceEmailTemplate } from "@/lib/email/templates/invoice-email";
import { EmailConfigurationError } from "@/lib/email/resend";
import { getInvoiceTypeDocumentType, type InvoiceType } from "@/lib/invoices/invoice-numbering";
import {
    isDatevInvoiceSendable,
    type DatevInvoiceEligibility,
} from "@/lib/invoices/datev-invoice-rules";
import { renderInvoicePdfBytes } from "@/lib/pdf/invoice-storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";
import { createSendEmailUseCase } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";

export type DatevInvoiceCandidate = DatevInvoiceEligibility & {
    id: string;
    sale_id: string;
    invoice_number: string;
    invoice_type: InvoiceType;
    status: string;
    datev_status: "not_sent" | "sent";
};

export type DatevInvoiceDeliveryResult =
    | { success: true }
    | { success: false; message: string };

type DatevInvoiceDeliveryOptions = {
    recipientEmail?: string;
};

export async function sendDatevInvoice(
    companyId: string,
    invoice: DatevInvoiceCandidate,
    options: DatevInvoiceDeliveryOptions = {},
): Promise<DatevInvoiceDeliveryResult> {
    if (!isDatevInvoiceSendable(invoice)) {
        return {
            success: false,
            message: "Nur offene Standardrechnungen können an DATEV gesendet werden.",
        };
    }

    try {
        const recipientEmail =
            options.recipientEmail ??
            (await getDatevInvoiceUploadEmail(companyId));
        const { pdfData, pdfBytes } = await renderInvoicePdfBytes(invoice.id);
        const invoiceFileName = new ExportFileNamePolicy().createDocumentFileName({
            saleReference: pdfData.invoiceNumber,
            documentType: getInvoiceTypeDocumentType(pdfData.invoiceType),
            mimeType: "application/pdf",
        });
        const sender = await getInvoiceMailSender(companyId);
        const actorId = await getOptionalCurrentAuthUserId();
        const template = getDatevInvoiceEmailTemplate(invoice.invoice_number);
        const sendEmail = await createSendEmailUseCase();

        await sendEmail.execute({
            companyId,
            actorId,
            contextType: "INVOICE",
            contextId: invoice.id,
            templateKey: "invoice.send.datev",
            senderName: sender.senderName,
            senderEmail: sender.senderEmail,
            toRecipients: [{ email: recipientEmail, name: "DATEV" }],
            subject: template.subject,
            bodyText: template.text,
            bodyHtml: template.html,
            resolvedAttachments: [
                {
                    fileName: invoiceFileName,
                    content: Buffer.from(pdfBytes),
                    mimeType: "application/pdf",
                    fileSizeBytes: pdfBytes.byteLength,
                    attachmentType: "invoice_pdf_datev",
                },
            ],
            relations: [
                { relationType: "INVOICE", relationId: invoice.id },
                { relationType: "SALE", relationId: invoice.sale_id },
            ],
            idempotencyKey: `datev-invoice-email:${companyId}:${invoice.id}`,
            metadata: {
                recipient: recipientEmail,
                invoiceNumber: invoice.invoice_number,
            },
        });

        const supabase = createServerSupabaseClient();
        const { error: updateError } = await supabase
            .from("invoices")
            .update({ datev_status: "sent" })
            .eq("id", invoice.id)
            .eq("company_id", companyId)
            .eq("datev_status", "not_sent");

        if (updateError) {
            console.error("[email] DATEV invoice status update failed", updateError);
            return {
                success: false,
                message: "DATEV-Versand wurde ausgeführt, aber der Versandstatus konnte nicht gespeichert werden.",
            };
        }

        await logActivity({
            action: `Rechnung ${invoice.invoice_number} separat an DATEV gesendet`,
            entityType: "invoice",
            entityId: invoice.id,
        });

        return { success: true };
    } catch (error) {
        console.error("[email] DATEV invoice delivery failed", error);

        return {
            success: false,
            message:
                error instanceof EmailConfigurationError
                    ? "Der Rechnungs-E-Mail-Versand ist noch nicht konfiguriert."
                    : "Die Rechnung konnte nicht an DATEV gesendet werden.",
        };
    }
}
