import { createHash } from "node:crypto";

export type SalePaymentFingerprintInput = {
    saleId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    note: string | null;
    externalReference: string | null;
    overpaymentConfirmed: boolean;
};

export function isValidPaymentIdempotencyKey(value: string | null): value is string {
    return Boolean(
        value &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                value,
            ),
    );
}

export function createSalePaymentFingerprint(
    input: SalePaymentFingerprintInput,
): string {
    const canonical = JSON.stringify({
        saleId: input.saleId,
        amount: Number(input.amount.toFixed(2)),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        note: input.note?.trim() || null,
        externalReference: input.externalReference?.trim() || null,
        overpaymentConfirmed: input.overpaymentConfirmed,
    });

    return createHash("sha256").update(canonical).digest("hex");
}
