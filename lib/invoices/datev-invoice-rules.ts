import type { InvoiceType } from "@/lib/invoices/invoice-numbering";

export type DatevInvoiceEligibility = {
    invoice_type: InvoiceType;
    status: string;
    datev_status: "not_sent" | "sent";
};

export function isDatevInvoiceSendable(invoice: DatevInvoiceEligibility): boolean {
    return (
        invoice.invoice_type === "standard" &&
        invoice.status !== "cancelled" &&
        invoice.datev_status === "not_sent"
    );
}
