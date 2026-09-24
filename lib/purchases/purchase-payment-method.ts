export type PurchasePaymentMethod = "bank" | "cash";

export function getPurchasePaymentMethodLabel(
    paymentMethod: PurchasePaymentMethod | string,
): string {
    if (paymentMethod === "cash") return "Bar";
    if (paymentMethod === "bank") return "Bank";

    return paymentMethod;
}

export function isValidPurchasePaymentMethod(
    value: string | null | undefined,
): value is PurchasePaymentMethod {
    return value === "bank" || value === "cash";
}
