import { NextResponse } from "next/server";

import { renderInvoicePdfBytes } from "@/lib/pdf/invoice-storage";
import { getInvoiceTypeDocumentType } from "@/lib/invoices/invoice-numbering";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{
        invoiceId: string;
    }>;
};

function createContentDisposition(disposition: "attachment" | "inline", fileName: string): string {
    const asciiFallback = fileName
        .replace(/[^\x20-\x7e]/g, "_")
        .replace(/"/g, "")
        .trim() || "Rechnung.pdf";

    return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, context: RouteContext) {
    const { invoiceId } = await context.params;

    try {
        const { pdfData, pdfBytes } = await renderInvoicePdfBytes(invoiceId);
        const url = new URL(request.url);
        const shouldDownload = url.searchParams.get("download") === "1";
        const fileName = new ExportFileNamePolicy().createDocumentFileName({
            saleReference: pdfData.invoiceNumber,
            documentType: getInvoiceTypeDocumentType(pdfData.invoiceType),
            mimeType: "application/pdf",
        });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": createContentDisposition(
                    shouldDownload ? "attachment" : "inline",
                    fileName,
                ),
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
