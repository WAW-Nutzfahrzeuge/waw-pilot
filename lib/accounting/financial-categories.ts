export type FinancialDirection = "in" | "out";
export type FinancialPaymentMethod = "cash" | "bank";
export type AccountingStatus =
    | "UNREVIEWED"
    | "REVIEW_REQUIRED"
    | "COMPLETE"
    | "EXPORTED"
    | "ERROR";

export type FinancialCategoryDefinition = {
    code: string;
    label: string;
    type: "income" | "expense" | "transfer" | "adjustment";
    defaultDirection?: FinancialDirection;
    defaultPaymentMethod?: FinancialPaymentMethod;
};

export const financialCategories: FinancialCategoryDefinition[] = [
    { code: "vehicle_sale", label: "Fahrzeugverkauf", type: "income", defaultDirection: "in" },
    { code: "vehicle_purchase", label: "Fahrzeugeinkauf", type: "expense", defaultDirection: "out" },
    { code: "other_income", label: "Sonstige Einnahme", type: "income", defaultDirection: "in" },
    { code: "refund", label: "Erstattung", type: "income", defaultDirection: "in" },
    { code: "owner_deposit", label: "Bareinlage", type: "transfer", defaultDirection: "in", defaultPaymentMethod: "cash" },
    { code: "owner_withdrawal", label: "Barentnahme", type: "transfer", defaultDirection: "out", defaultPaymentMethod: "cash" },
    { code: "cash_bank_deposit", label: "Bargeld auf Bank eingezahlt", type: "transfer", defaultDirection: "out", defaultPaymentMethod: "cash" },
    { code: "repair", label: "Reparatur", type: "expense", defaultDirection: "out" },
    { code: "parts", label: "Ersatzteile", type: "expense", defaultDirection: "out" },
    { code: "transport", label: "Transport", type: "expense", defaultDirection: "out" },
    { code: "fuel", label: "Kraftstoff", type: "expense", defaultDirection: "out" },
    { code: "toll", label: "Maut", type: "expense", defaultDirection: "out" },
    { code: "insurance", label: "Versicherung", type: "expense", defaultDirection: "out" },
    { code: "registration", label: "Zulassung / Kennzeichen", type: "expense", defaultDirection: "out" },
    { code: "office", label: "Bürobedarf", type: "expense", defaultDirection: "out" },
    { code: "tax_advice", label: "Steuerberatung", type: "expense", defaultDirection: "out" },
    { code: "bank_fees", label: "Bankgebühren", type: "expense", defaultDirection: "out", defaultPaymentMethod: "bank" },
    { code: "other_expense", label: "Sonstige Ausgabe", type: "expense", defaultDirection: "out" },
    { code: "other", label: "Sonstiges", type: "adjustment" },
];

export function getFinancialCategoryLabel(code: string | null | undefined): string {
    if (!code) return "Nicht zugeordnet";
    return financialCategories.find((category) => category.code === code)?.label ?? code;
}

export function isCashBankTransfer(categoryCode: string | null | undefined): boolean {
    return categoryCode === "cash_bank_deposit";
}

export function getAccountingStatusLabel(status: AccountingStatus | string): string {
    const labels: Record<string, string> = {
        UNREVIEWED: "Nicht geprüft",
        REVIEW_REQUIRED: "Zu prüfen",
        COMPLETE: "Vollständig",
        EXPORTED: "Exportiert",
        ERROR: "Fehlerhaft",
    };

    return labels[status] ?? status;
}

export function getAccountingStatusTone(
    status: AccountingStatus | string,
): "success" | "warning" | "danger" | "info" | "neutral" {
    if (status === "COMPLETE" || status === "EXPORTED") return "success";
    if (status === "REVIEW_REQUIRED" || status === "UNREVIEWED") return "warning";
    if (status === "ERROR") return "danger";
    return "neutral";
}
