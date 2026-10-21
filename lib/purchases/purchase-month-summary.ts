type PurchaseMonthFields = {
    purchase_date: string | null | undefined;
    vat_amount: number;
};

export function getPurchaseMonthOptions(
    purchases: PurchaseMonthFields[],
): string[] {
    return [...new Set(
        purchases
            .map(({ purchase_date }) => purchase_date?.slice(0, 7) ?? "")
            .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)),
    )].sort((first, second) => second.localeCompare(first));
}

export function getPurchaseVatForMonth(
    purchases: PurchaseMonthFields[],
    month: string | "all",
): number {
    return purchases.reduce((total, purchase) => {
        const purchaseMonth = purchase.purchase_date?.slice(0, 7);
        if (
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(purchaseMonth ?? "") ||
            (month !== "all" && purchaseMonth !== month)
        ) {
            return total;
        }

        return total + purchase.vat_amount;
    }, 0);
}
