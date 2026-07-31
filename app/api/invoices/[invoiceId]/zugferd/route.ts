import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{
        invoiceId: string;
    }>;
};

type InvoiceZugferdQueryResult = {
    invoice_number: string;
    sales: { sale_number: string | null } | { sale_number: string | null }[] | null;
    zugferd_file_path: string | null;
    zugferd_validation_status: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
    const { invoiceId } = await context.params;
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("invoices")
        .select("invoice_number, zugferd_file_path, zugferd_validation_status, sales:sale_id (sale_number)")
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        return NextResponse.json(
            { message: "ZUGFeRD-Rechnung wurde nicht gefunden." },
            { status: 404 },
        );
    }

    const invoice = data as InvoiceZugferdQueryResult;
    const sale = Array.isArray(invoice.sales) ? invoice.sales[0] : invoice.sales;

    if (!invoice.zugferd_file_path) {
        return NextResponse.json(
            { message: "Bitte erstelle zuerst die ZUGFeRD-Rechnung." },
            { status: 404 },
        );
    }

    if (invoice.zugferd_validation_status !== "valid") {
        return NextResponse.json(
            {
                message:
                    "Die ZUGFeRD-Rechnung wurde noch nicht erfolgreich validiert. Bitte erstelle und prüfe sie zuerst.",
            },
            { status: 409 },
        );
    }

    const { data: fileData, error: downloadError } = await supabase.storage
        .from("documents")
        .download(invoice.zugferd_file_path);

    if (downloadError || !fileData) {
        return NextResponse.json(
            { message: "ZUGFeRD-Rechnung konnte nicht geladen werden." },
            { status: 404 },
        );
    }

    return new NextResponse(Buffer.from(await fileData.arrayBuffer()), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${new ExportFileNamePolicy().createDocumentFileName({
                saleReference: sale?.sale_number ?? invoice.invoice_number,
                documentType: "zugferd_invoice",
                mimeType: "application/pdf",
            })}"`,
            "Cache-Control": "no-store",
        },
    });
}
