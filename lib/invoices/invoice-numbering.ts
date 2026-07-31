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

type InvoiceNumberRow = {
    invoice_number: string;
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

function getInvoiceYearPrefix(invoiceDate?: string): string {
    const date = invoiceDate ? new Date(invoiceDate) : new Date();
    const year = date.getFullYear();

    if (!Number.isFinite(year)) {
        const fallbackYear = new Date().getFullYear();

        return `0${String(fallbackYear).slice(-2)}`;
    }

    return `0${String(year).slice(-2)}`;
}

function getInvoiceNumberPrefix(
    invoiceType: InvoiceType,
    invoiceDate?: string,
): string {
    const yearPrefix = getInvoiceYearPrefix(invoiceDate);

    if (invoiceType === "proforma") {
        return `PRO-${yearPrefix}-`;
    }

    if (invoiceType === "down_payment") {
        return `AZ-${yearPrefix}-`;
    }

    if (invoiceType === "credit_note") {
        return `GS-${yearPrefix}-`;
    }

    return `${yearPrefix}-`;
}

function parseInvoiceCounter(
    invoiceNumber: string,
    invoiceType: InvoiceType,
    invoiceDate?: string,
): number | null {
    const prefix = getInvoiceNumberPrefix(invoiceType, invoiceDate);

    if (!invoiceNumber.startsWith(prefix)) {
        return null;
    }

    const counterPart = invoiceNumber.slice(prefix.length);
    const counter = Number(counterPart);

    return Number.isInteger(counter) && counter > 0 ? counter : null;
}

function buildInvoiceNumber(
    invoiceType: InvoiceType,
    counter: number,
    invoiceDate?: string,
): string {
    const prefix = getInvoiceNumberPrefix(invoiceType, invoiceDate);

    return `${prefix}${String(counter).padStart(3, "0")}`;
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

async function getNextInvoiceNumberFallback({
                                                companyId,
                                                invoiceType,
                                                invoiceDate,
                                            }: {
    companyId: string;
    invoiceType: InvoiceType;
    invoiceDate?: string;
}): Promise<string> {
    const supabase = createServerSupabaseClient();
    const prefix = getInvoiceNumberPrefix(invoiceType, invoiceDate);

    const { data, error } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("company_id", companyId)
        .like("invoice_number", `${prefix}%`);

    if (error) {
        throw new Error(
            `Rechnungsnummern konnten nicht geladen werden: ${error.message}`,
        );
    }

    const highestCounter = ((data ?? []) as InvoiceNumberRow[]).reduce(
        (highest, invoice) => {
            const counter = parseInvoiceCounter(
                invoice.invoice_number,
                invoiceType,
                invoiceDate,
            );

            if (counter === null) return highest;

            return Math.max(highest, counter);
        },
        0,
    );

    let nextCounter = highestCounter + 1;
    let nextInvoiceNumber = buildInvoiceNumber(
        invoiceType,
        nextCounter,
        invoiceDate,
    );

    while (
        await invoiceNumberExists({
            companyId,
            invoiceNumber: nextInvoiceNumber,
        })
        ) {
        nextCounter += 1;
        nextInvoiceNumber = buildInvoiceNumber(
            invoiceType,
            nextCounter,
            invoiceDate,
        );
    }

    return nextInvoiceNumber;
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
        return getNextInvoiceNumberFallback({
            companyId,
            invoiceType,
            invoiceDate: resolvedInvoiceDate,
        });
    }

    const candidateInvoiceNumber = String(data);

    const candidateAlreadyExists = await invoiceNumberExists({
        companyId,
        invoiceNumber: candidateInvoiceNumber,
    });

    if (!candidateAlreadyExists) {
        return candidateInvoiceNumber;
    }

    return getNextInvoiceNumberFallback({
        companyId,
        invoiceType,
        invoiceDate: resolvedInvoiceDate,
    });
}
