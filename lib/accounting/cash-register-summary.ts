import { isCashBankTransfer } from "@/lib/accounting/financial-categories";

export type CashBalanceEntry = {
    is_cash_relevant: boolean;
    status: string;
    category_code: string | null;
    direction: "in" | "out";
    amount: number;
    booking_date: string;
};

export type CashRegisterTotals = {
    income: number;
    expenses: number;
    bankDeposits: number;
    endingBalance: number;
    movementCount: number;
};

function cents(value: number): number {
    return Math.round(value * 100);
}

export function calculateCashRegisterBalance(
    openingBalance: number,
    entries: CashBalanceEntry[],
    throughDate?: string | null,
): number {
    const totalCents = entries.reduce((total, entry) => {
        if (!entry.is_cash_relevant || entry.status !== "active" || (throughDate && entry.booking_date > throughDate)) return total;
        const amount = cents(entry.amount);
        if (isCashBankTransfer(entry.category_code) || entry.direction === "out") return total - amount;
        return total + amount;
    }, cents(openingBalance));

    return totalCents / 100;
}

export function calculateCashRegisterTotals({
    openingBalance,
    periodEntries,
    balanceEntries,
    balanceThroughDate,
}: {
    openingBalance: number;
    periodEntries: CashBalanceEntry[];
    balanceEntries: CashBalanceEntry[];
    balanceThroughDate?: string | null;
}): CashRegisterTotals {
    let incomeCents = 0;
    let expenseCents = 0;
    let depositCents = 0;
    let movementCount = 0;

    for (const entry of periodEntries) {
        if (!entry.is_cash_relevant || entry.status !== "active") continue;
        movementCount += 1;
        const amount = cents(entry.amount);
        if (isCashBankTransfer(entry.category_code)) depositCents += amount;
        else if (entry.direction === "in") incomeCents += amount;
        else expenseCents += amount;
    }

    return {
        income: incomeCents / 100,
        expenses: expenseCents / 100,
        bankDeposits: depositCents / 100,
        endingBalance: calculateCashRegisterBalance(openingBalance, balanceEntries, balanceThroughDate),
        movementCount,
    };
}
