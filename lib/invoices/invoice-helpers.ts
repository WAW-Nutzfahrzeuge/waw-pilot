import type {
    InvoiceDatevStatus,
    InvoicePaymentStatus,
    InvoiceStatus,
} from "@/lib/invoices/invoice-queries";

export function getInvoiceStatusLabel(status: InvoiceStatus): string {
    const labels: Record<InvoiceStatus, string> = {
        draft: "Entwurf",
        created: "Erstellt",
        sent: "Gesendet",
        paid: "Bezahlt",
        cancelled: "Storniert",
        converted: "Umgewandelt",
    };

    return labels[status];
}

export function getInvoicePaymentStatusLabel(
    status: InvoicePaymentStatus,
): string {
    const labels: Record<InvoicePaymentStatus, string> = {
        open: "Offen",
        partial: "Teilbezahlt",
        paid: "Bezahlt",
    };

    return labels[status];
}

export function getInvoiceDatevStatusLabel(status: InvoiceDatevStatus): string {
    const labels: Record<InvoiceDatevStatus, string> = {
        not_sent: "Nicht gesendet",
        sent: "Gesendet",
    };

    return labels[status];
}

export function getInvoiceStatusTone(
    status: InvoiceStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
    if (status === "paid") return "success";
    if (status === "sent") return "info";
    if (status === "created") return "warning";
    if (status === "cancelled") return "danger";
    if (status === "converted") return "info";

    return "neutral";
}

export function getInvoicePaymentStatusTone(
    status: InvoicePaymentStatus,
): "success" | "warning" | "danger" {
    if (status === "paid") return "success";
    if (status === "partial") return "warning";

    return "danger";
}

export function getInvoiceDatevStatusTone(
    status: InvoiceDatevStatus,
): "success" | "warning" {
    if (status === "sent") return "success";

    return "warning";
}