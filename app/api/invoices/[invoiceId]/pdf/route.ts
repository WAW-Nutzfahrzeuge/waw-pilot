import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { buildFinalInvoicePdf, getCompanyTermsPdf } from "@/lib/pdf/company-terms";
import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getInvoiceTypeDocumentType } from "@/lib/invoices/invoice-numbering";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{
        invoiceId: string;
    }>;
};

type InvoiceDocumentRelation = {
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
};

type SupabaseRelation<T> = T | T[] | null;

type InvoiceDocumentQueryResult = {
    invoice_type: "standard" | "proforma" | "down_payment" | "cancellation_invoice" | "credit_note";
    invoice_number: string;
    sales: SupabaseRelation<{ sale_number: string | null }>;
    pdf_document_id: string | null;
    documents: SupabaseRelation<InvoiceDocumentRelation>;
};

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

async function getStoredInvoicePdf(invoiceId: string) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("invoices")
        .select(
            `
      invoice_number,
      invoice_type,
      sales:sale_id (sale_number),
      pdf_document_id,
      documents:pdf_document_id (
        file_name,
        file_path,
        mime_type
      )
    `,
        )
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) return null;

    const invoice = data as unknown as InvoiceDocumentQueryResult;
    const document = getSingleRelation(invoice.documents);
    const sale = getSingleRelation(invoice.sales);

    if (!document?.file_path) return null;

    const { data: fileData, error: downloadError } = await supabase.storage
        .from("documents")
        .download(document.file_path);

    if (downloadError || !fileData) return null;

    const arrayBuffer = await fileData.arrayBuffer();

    const fileName = new ExportFileNamePolicy().createDocumentFileName({
        saleReference: sale?.sale_number ?? invoice.invoice_number,
        documentType: getInvoiceTypeDocumentType(invoice.invoice_type),
        mimeType: document.mime_type ?? "application/pdf",
    });

    return {
        bytes: Buffer.from(arrayBuffer),
        fileName,
        contentType: document.mime_type || "application/pdf",
    };
}

export async function GET(_request: Request, context: RouteContext) {
    const { invoiceId } = await context.params;

    const storedPdf = await getStoredInvoicePdf(invoiceId);

    if (storedPdf) {
        return new NextResponse(storedPdf.bytes, {
            headers: {
                "Content-Type": storedPdf.contentType,
                "Content-Disposition": `attachment; filename="${storedPdf.fileName}"`,
                "Cache-Control": "no-store",
            },
        });
    }

    try {
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

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${new ExportFileNamePolicy().createDocumentFileName({
                    saleReference: pdfData.saleNumber ?? pdfData.invoiceNumber,
                    documentType: getInvoiceTypeDocumentType(pdfData.invoiceType),
                    mimeType: "application/pdf",
                })}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : "PDF konnte nicht erzeugt werden.",
            },
            { status: 500 },
        );
    }
}
