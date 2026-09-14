export const DEFAULT_PAYMENT_TERMS_DAYS = 7;

export function getPaymentTermsText(paymentTermsDays: number): string {
    return `Zahlbar innerhalb von ${paymentTermsDays} Tagen ohne Abzug.`;
}

export function calculateInvoiceDueDate(
    invoiceDate: string,
    paymentTermsDays = DEFAULT_PAYMENT_TERMS_DAYS,
): string {
    const [year, month, day] = invoiceDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + paymentTermsDays));

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}

export function getPaymentTermsDays(
    invoiceDate: string,
    dueDate: string | null | undefined,
): number | null {
    if (!dueDate) return null;

    const [invoiceYear, invoiceMonth, invoiceDay] = invoiceDate.split("-").map(Number);
    const [dueYear, dueMonth, dueDay] = dueDate.split("-").map(Number);
    const invoiceTimestamp = Date.UTC(invoiceYear, invoiceMonth - 1, invoiceDay);
    const dueTimestamp = Date.UTC(dueYear, dueMonth - 1, dueDay);
    const days = (dueTimestamp - invoiceTimestamp) / 86_400_000;

    return Number.isInteger(days) && days >= 0 ? days : null;
}
