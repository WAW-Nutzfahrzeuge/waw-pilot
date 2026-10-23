import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    createSalePaymentFingerprint,
    isValidPaymentIdempotencyKey,
} from "../lib/payments/sale-payment-idempotency.ts";

const payment = {
    saleId: "sale-1",
    amount: 1250,
    paymentDate: "2026-10-22",
    paymentMethod: "bank",
    note: "  Anzahlung  ",
    externalReference: " EXT-1 ",
    overpaymentConfirmed: false,
};

test("sale payment request fingerprints are stable for normalized values", () => {
    assert.equal(
        createSalePaymentFingerprint(payment),
        createSalePaymentFingerprint({
            ...payment,
            note: "Anzahlung",
            externalReference: "EXT-1",
        }),
    );
});

test("sale payment request fingerprints change when the payment intent changes", () => {
    assert.notEqual(
        createSalePaymentFingerprint(payment),
        createSalePaymentFingerprint({ ...payment, amount: 1251 }),
    );
});

test("sale payment idempotency keys must be UUIDs", () => {
    assert.equal(isValidPaymentIdempotencyKey("a1989d78-242b-44b8-b40d-d734f2e61fb7"), true);
    assert.equal(isValidPaymentIdempotencyKey("not-a-key"), false);
    assert.equal(isValidPaymentIdempotencyKey(null), false);
});

test("sale payment form shows pending feedback and submits a stable request key", () => {
    const dialog = readFileSync("components/sales/sale-payment-dialogs.tsx", "utf8");
    const action = readFileSync("app/dashboard/sales/[saleId]/payment-actions.ts", "utf8");

    assert.match(dialog, /name="idempotency_key"/);
    assert.match(dialog, /pendingLabel="Zahlung wird gespeichert/);
    assert.match(action, /\.eq\("idempotency_key", idempotencyKey\)/);
    assert.match(action, /requestKeyConflict/);
});

test("payment idempotency is enforced by a company-scoped unique index", () => {
    const migration = readFileSync(
        "supabase/migrations/20261022120000_add_sale_payment_idempotency.sql",
        "utf8",
    );

    assert.match(migration, /unique index if not exists sale_payments_company_idempotency_key_uidx/);
    assert.match(migration, /on public\.sale_payments \(company_id, idempotency_key\)/);
    assert.match(migration, /where idempotency_key is not null/);
    assert.match(migration, /finalization_status/);
});
