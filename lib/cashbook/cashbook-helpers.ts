import type {
    CashbookEntryRow,
    CashbookEntryType,
    CashbookPaymentMethod,
} from "@/lib/cashbook/cashbook-queries";

export function getCashbookTypeLabel(type: CashbookEntryType): string {
    const labels: Record<CashbookEntryType, string> = {
        income: "Einnahme",
        expense: "Ausgabe",
    };

    return labels[type];
}

export function getCashbookPaymentMethodLabel(
    method: CashbookPaymentMethod,
): string {
    const labels: Record<CashbookPaymentMethod, string> = {
        cash: "Bar",
        bank: "Bank",
    };

    return labels[method];
}

export function getCashbookCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
        vehicle_sale: "Fahrzeugverkauf",
        vehicle_purchase: "Fahrzeugeinkauf",
        transport: "Transport",
        repair: "Reparatur",
        customs: "Zoll",
        office: "Büro",
        other: "Sonstiges",
    };

    return labels[category] ?? category;
}

export function getCashbookTypeTone(
    type: CashbookEntryType,
): "success" | "danger" {
    if (type === "income") return "success";
    return "danger";
}

export function calculateTotalIncome(entries: CashbookEntryRow[]): number {
    let total = 0;

    for (const entry of entries) {
        if (entry.entry_type === "income") {
            total += entry.amount;
        }
    }

    return total;
}

export function calculateTotalExpenses(entries: CashbookEntryRow[]): number {
    let total = 0;

    for (const entry of entries) {
        if (entry.entry_type === "expense") {
            total += entry.amount;
        }
    }

    return total;
}

export function calculateBalance(entries: CashbookEntryRow[]): number {
    let balance = 0;

    for (const entry of entries) {
        balance += entry.entry_type === "income" ? entry.amount : -entry.amount;
    }

    return balance;
}

export function calculatePaymentMethodBalance(
    entries: CashbookEntryRow[],
    method: CashbookPaymentMethod,
): number {
    let balance = 0;

    for (const entry of entries) {
        if (entry.payment_method !== method) continue;

        balance += entry.entry_type === "income" ? entry.amount : -entry.amount;
    }

    return balance;
}
