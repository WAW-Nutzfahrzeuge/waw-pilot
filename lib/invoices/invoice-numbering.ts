import { getCurrentCompanyId } from "@/lib/company";
import { getTodayDateOnly } from "@/lib/format/date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type InvoiceType =
    | "standard"
    | "proforma"
    | "down_payment"
    | "cancellation_invoice"
    | "credit_note";

type GetNextInvoiceNumberParams = {
    invoiceType?: InvoiceType;
    invoiceDate?: string;
};

export function getInvoiceTypeLabel(invoiceType: InvoiceType): string {
    const labels: Record<InvoiceType, string> = {
        standard: "Rechnung",
        proforma: "Proforma-Rechnung",
        down_payment: "Anzahlungsrechnung",
        cancellation_invoice: "Stornorechnung",
        credit_note: "Gutschrift",
    };

    return labels[invoiceType];
}

export function getInvoiceTypeDocumentType(invoiceType: InvoiceType): string {
    const documentTypes: Record<InvoiceType, string> = {
        standard: "invoice_pdf",
        proforma: "proforma_invoice",
        down_payment: "down_payment_invoice",
        cancellation_invoice: "cancellation_invoice",
        credit_note: "credit_note",
    };

    return documentTypes[invoiceType];
}

async function invoiceNumberExists({
                                       companyId,
                                       invoiceNumber,
                                   }: {
    companyId: string;
    invoiceNumber: string;
}): Promise<boolean> {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();

    if (error) {
        throw new Error(
            `Rechnungsnummer konnte nicht geprüft werden: ${error.message}`,
        );
    }

    return Boolean(data);
}

export async function getNextInvoiceNumber({
                                               invoiceType = "standard",
                                               invoiceDate,
                                           }: GetNextInvoiceNumberParams = {}): Promise<string> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const resolvedInvoiceDate = invoiceDate ?? getTodayDateOnly();

    const { data, error } = await supabase.rpc("get_next_invoice_number", {
        p_company_id: companyId,
        p_invoice_type: invoiceType,
        p_invoice_date: resolvedInvoiceDate,
    });

    if (error || !data) {
        throw new Error(
            `Rechnungsnummer konnte nicht erzeugt werden: ${
                error?.message ?? "Keine Nummer erhalten"
            }`,
        );
    }

    const candidateInvoiceNumber = String(data);

    const candidateAlreadyExists = await invoiceNumberExists({
        companyId,
        invoiceNumber: candidateInvoiceNumber,
    });

    if (!candidateAlreadyExists) {
        return candidateInvoiceNumber;
    }

    throw new Error(
        `Rechnungsnummer ${candidateInvoiceNumber} ist bereits vergeben. Bitte Counter in Supabase prüfen.`,
    );
}
