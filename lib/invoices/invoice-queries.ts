import { getCurrentCompanyId } from "@/lib/company";
import type { InvoiceType } from "@/lib/invoices/invoice-numbering";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getMonthFilterDateRange,
    type MonthFilterValue,
} from "@/utils/month-filter";

export type InvoiceStatus = "draft" | "created" | "sent" | "paid" | "cancelled";
export type InvoicePaymentStatus = "open" | "partial" | "paid";
export type InvoiceDatevStatus = "not_sent" | "sent";

export type InvoiceRow = {
    id: string;
    sale_id: string;
    customer_id: string;
    vehicle_id: string;

    invoice_type: InvoiceType;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;

    net_amount: number;
    vat_rate: number;
    vat_amount: number;
    gross_amount: number;

    status: InvoiceStatus;
    payment_status: InvoicePaymentStatus;
    datev_status: InvoiceDatevStatus;

    pdf_document_id: string | null;
    sent_at: string | null;
    paid_at: string | null;
    created_at: string;

    customer_name: string;
    customer_country: string | null;
    vehicle_internal_number: string;
    vehicle_name: string;
    vehicle_type: string | null;
    vin: string;
    pdf_file_name: string | null;
};

type InvoiceQueryRow = {
    id: string;
    sale_id: string;
    customer_id: string;
    vehicle_id: string;

    invoice_type: InvoiceType | null;
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;

    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;

    status: InvoiceStatus;
    payment_status: InvoicePaymentStatus;
    datev_status: InvoiceDatevStatus;

    pdf_document_id: string | null;
    sent_at: string | null;
    paid_at: string | null;
    created_at: string;

    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
        country: string | null;
    } | null;

    vehicles: {
        internal_number: string;
        manufacturer: string;
        model: string;
        vehicle_type: string | null;
        vin: string;
    } | null;
};

function getCustomerName(customer: InvoiceQueryRow["customers"]): string {
    if (!customer) return "Unbekannter Kunde";

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannter Kunde";
}

function getInvoiceFileName(invoiceType: InvoiceType, invoiceNumber: string): string {
    const baseNames: Record<InvoiceType, string> = {
        standard: "rechnung",
        proforma: "proforma-rechnung",
        down_payment: "anzahlungsrechnung",
        cancellation_invoice: "stornorechnung",
        credit_note: "gutschrift",
    };

    return `${baseNames[invoiceType]}-${invoiceNumber}.pdf`;
}

function getInvoiceSortWeight(invoiceType: InvoiceType): number {
    const weights: Record<InvoiceType, number> = {
        standard: 1,
        proforma: 2,
        down_payment: 3,
        cancellation_invoice: 4,
        credit_note: 5,
    };

    return weights[invoiceType];
}

export async function getInvoices(): Promise<InvoiceRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      customer_id,
      vehicle_id,
      invoice_type,
      invoice_number,
      invoice_date,
      due_date,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      status,
      payment_status,
      datev_status,
      pdf_document_id,
      sent_at,
      paid_at,
      created_at,
      customers (
        type,
        company_name,
        first_name,
        last_name,
        country
      ),
      vehicles (
        internal_number,
        manufacturer,
        model,
        vehicle_type,
        vin
      )
    `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Rechnungen konnten nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as InvoiceQueryRow[])
        .map((invoice) => {
            const customer = invoice.customers;
            const vehicle = invoice.vehicles;
            const invoiceType = invoice.invoice_type ?? "standard";

            return {
                id: invoice.id,
                sale_id: invoice.sale_id,
                customer_id: invoice.customer_id,
                vehicle_id: invoice.vehicle_id,

                invoice_type: invoiceType,
                invoice_number: invoice.invoice_number,
                invoice_date: invoice.invoice_date,
                due_date: invoice.due_date,

                net_amount: Number(invoice.net_amount),
                vat_rate: Number(invoice.vat_rate),
                vat_amount: Number(invoice.vat_amount),
                gross_amount: Number(invoice.gross_amount),

                status: invoice.status,
                payment_status: invoice.payment_status,
                datev_status: invoice.datev_status,

                pdf_document_id: invoice.pdf_document_id,
                sent_at: invoice.sent_at,
                paid_at: invoice.paid_at,
                created_at: invoice.created_at,

                customer_name: getCustomerName(customer),
                customer_country: customer?.country ?? null,
                vehicle_internal_number: vehicle?.internal_number ?? "—",
                vehicle_name: vehicle
                    ? `${vehicle.manufacturer} ${vehicle.model}`
                    : "Unbekanntes Fahrzeug",
                vehicle_type: vehicle?.vehicle_type ?? null,
                vin: vehicle?.vin ?? "—",
                pdf_file_name: getInvoiceFileName(invoiceType, invoice.invoice_number),
            };
        })
        .sort((a, b) => {
            const dateSort =
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

            if (dateSort !== 0) return dateSort;

            return getInvoiceSortWeight(a.invoice_type) - getInvoiceSortWeight(b.invoice_type);
        });
}

export async function getInvoiceDashboardSummary(
    monthFilter: MonthFilterValue,
): Promise<{ invoicesCount: number }> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const dateRange = getMonthFilterDateRange(monthFilter);

    let query = supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

    if (dateRange) {
        query = query
            .gte("invoice_date", dateRange.from)
            .lte("invoice_date", dateRange.to);
    }

    const { count, error } = await query;

    if (error) {
        throw new Error(`Rechnungs-Zusammenfassung konnte nicht geladen werden: ${error.message}`);
    }

    return { invoicesCount: count ?? 0 };
}
