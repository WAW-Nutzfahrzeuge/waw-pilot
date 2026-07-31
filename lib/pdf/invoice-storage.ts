import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { buildFinalInvoicePdf, getCompanyTermsPdf } from "@/lib/pdf/company-terms";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getInvoiceTypeDocumentType,
} from "@/lib/invoices/invoice-numbering";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

export type StoredInvoicePdfResult = {
    fileName: string;
    filePath: string;
    fileSize: number;
};

export async function generateAndStoreInvoicePdf(
    invoiceId: string,
): Promise<StoredInvoicePdfResult> {
    const supabase = createServerSupabaseClient();

    const [pdfData, termsPdf] = await Promise.all([
        getInvoicePdfData(invoiceId),
        getCompanyTermsPdf(),
    ]);
    const invoicePdfBytes = await generateInvoicePdf({
        ...pdfData,
        termsAttached: Boolean(termsPdf),
    });
    const pdfBytes = await buildFinalInvoicePdf({
        invoicePdf: invoicePdfBytes,
        termsPdf: termsPdf?.bytes ?? null,
    });

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
