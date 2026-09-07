import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { buildFinalInvoicePdf, getCompanyTermsPdf } from "@/lib/pdf/company-terms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getInvoiceTypeDocumentType,
} from "@/lib/invoices/invoice-numbering";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";
import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";

export type StoredInvoicePdfResult = {
    fileName: string;
    filePath: string;
    fileSize: number;
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
        saleReference: pdfData.saleNumber ?? pdfData.invoiceNumber,
        documentType: getInvoiceTypeDocumentType(pdfData.invoiceType),
        mimeType: "application/pdf",
    });
    const filePath = `invoices/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
        });

    if (uploadError) {
        throw new Error(`PDF konnte nicht gespeichert werden: ${uploadError.message}`);
    }

    return {
        fileName,
        filePath,
        fileSize: pdfBytes.byteLength,
    };
}
