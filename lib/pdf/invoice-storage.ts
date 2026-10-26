import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { buildFinalInvoicePdf, getCompanyTermsPdf } from "@/lib/pdf/company-terms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import {
    getInvoiceTypeDocumentType,
} from "@/lib/invoices/invoice-numbering";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";
import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";
import { enqueueDurableZugferdGeneration } from "@/lib/zugferd/zugferd-durable-queue";

export type StoredInvoicePdfResult = {
    fileName: string;
    filePath: string;
    fileSize: number;
    zugferdJobId?: string | null;
};

export type RenderedInvoicePdfResult = {
    pdfData: InvoicePdfData;
    pdfBytes: Uint8Array;
};

export async function renderInvoicePdfBytes(
    invoiceId: string,
): Promise<RenderedInvoicePdfResult> {
    const pdfData = await getInvoicePdfData(invoiceId);
    const termsPdf = pdfData.termsAttached ? await getCompanyTermsPdf() : null;
    const invoicePdfBytes = await generateInvoicePdf({
        ...pdfData,
        termsAttached: Boolean(termsPdf),
    });
    const pdfBytes = await buildFinalInvoicePdf({
        invoicePdf: invoicePdfBytes,
        termsPdf: termsPdf?.bytes ?? null,
    });

    return { pdfData, pdfBytes };
}

export async function generateAndStoreInvoicePdf(
    invoiceId: string,
): Promise<StoredInvoicePdfResult> {
    const supabase = createServerSupabaseClient();
    const { pdfData, pdfBytes } = await renderInvoicePdfBytes(invoiceId);

    const fileName = new ExportFileNamePolicy().createDocumentFileName({
        saleReference: pdfData.invoiceNumber,
        documentType: getInvoiceTypeDocumentType(pdfData.invoiceType),
        mimeType: "application/pdf",
    });
    // The number is deliberately only part of the download name, never the
    // storage identity. A corrected/renumbered invoice may legitimately use
    // a number whose former PDF is still retained as a historical document
    // version. Keeping each invoice in its own folder avoids a collision with
    // that immutable version while still making subsequent regenerations of
    // the same invoice overwrite its current PDF.
    const filePath = `invoices/${invoiceId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
        });

    if (uploadError) {
        throw new Error(`PDF konnte nicht gespeichert werden: ${uploadError.message}`);
    }

    let zugferdJobId: string | null = null;
    if (pdfData.invoiceType === "standard") {
        try {
            const adminSupabase = createAutomationSupabaseClient();
            const { data: invoice, error: invoiceLookupError } = await adminSupabase
                .from("invoices")
                .select("company_id, sale_id, invoice_type")
                .eq("id", invoiceId)
                .maybeSingle();

            if (invoiceLookupError) {
                console.error("[zugferd] invoice lookup for pre-generation failed", {
                    invoiceId,
                    errorCode: invoiceLookupError.code ?? null,
                });
            } else if (
                invoice &&
                invoice.invoice_type === "standard" &&
                typeof invoice.company_id === "string" &&
                typeof invoice.sale_id === "string"
            ) {
                const queued = await enqueueDurableZugferdGeneration({
                    companyId: invoice.company_id,
                    saleId: invoice.sale_id,
                    invoiceId,
                    pdfData,
                    pdfBytes,
                });
                zugferdJobId = queued.jobId;
            }
        } catch (error) {
            console.error("[zugferd] pre-generation enqueue failed", {
                invoiceId,
                errorType: error instanceof Error ? error.name : "unknown",
            });
        }
    }

    return {
        fileName,
        filePath,
        fileSize: pdfBytes.byteLength,
        zugferdJobId,
    };
}
