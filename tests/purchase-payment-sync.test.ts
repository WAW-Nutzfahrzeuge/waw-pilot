import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    getPurchasePaymentMethodLabel,
    isValidPurchasePaymentMethod,
} from "../lib/purchases/purchase-payment-method.ts";

test("isValidPurchasePaymentMethod accepts only bank/cash", () => {
    assert.equal(isValidPurchasePaymentMethod("bank"), true);
    assert.equal(isValidPurchasePaymentMethod("cash"), true);
    assert.equal(isValidPurchasePaymentMethod("check"), false);
    assert.equal(isValidPurchasePaymentMethod(null), false);
    assert.equal(isValidPurchasePaymentMethod(undefined), false);
    assert.equal(isValidPurchasePaymentMethod(""), false);
});

test("getPurchasePaymentMethodLabel returns the German label", () => {
    assert.equal(getPurchasePaymentMethodLabel("bank"), "Bank");
    assert.equal(getPurchasePaymentMethodLabel("cash"), "Bar");
});

// Regression: previously only the dedicated "Als bezahlt markieren" button created
// a purchase_payments row (and therefore a Kassenbuch/financial_entries row).
// Selecting "Bezahlt" directly during create or edit silently skipped this, so the
// Kassenbuch stayed empty. All three entry points must now call the single shared
// createPurchasePaymentAndSync() implementation so the financial effect is identical
// no matter where "bezahlt" was set.
test("purchase create action syncs the Kassenbuch when payment_status is paid", () => {
    const source = readFileSync("app/dashboard/ankauf/new/actions.ts", "utf8");

    assert.equal(source.includes("createPurchasePaymentAndSync"), true);
    assert.equal(
        source.includes('paymentStatus === "paid"') &&
            source.includes("createPurchasePaymentAndSync"),
        true,
    );
});

test("purchase edit action syncs the Kassenbuch when transitioning to paid", () => {
    const source = readFileSync(
        "app/dashboard/ankauf/[purchaseId]/edit/actions.ts",
        "utf8",
    );

    assert.equal(source.includes("createPurchasePaymentAndSync"), true);
    assert.equal(
        source.includes('existingPurchase?.payment_status !== "paid"'),
        true,
    );
});

test("dedicated mark-as-paid action reuses the same shared payment sync function", () => {
    const source = readFileSync(
        "app/dashboard/ankauf/[purchaseId]/payment-actions.ts",
        "utf8",
    );

    assert.equal(source.includes("createPurchasePaymentAndSync"), true);
});

test("purchase form collects a payment_method so create/edit can create a real payment", () => {
    const source = readFileSync("components/purchases/purchase-form.tsx", "utf8");

    assert.equal(source.includes('name="payment_method"'), true);
});

test("the shared payment sync module is the single place calling the Kassenbuch sync", () => {
    const source = readFileSync("lib/purchases/purchase-payment-sync.ts", "utf8");

    assert.equal(source.includes("syncPurchasePaymentFinancialEntry"), true);

    // No other file should call the low-level financial sync directly for purchase
    // payments; only the shared module and its known caller (payment-actions.ts,
    // before the refactor) should reference it as of this change.
    const createActionSource = readFileSync(
        "app/dashboard/ankauf/new/actions.ts",
        "utf8",
    );
    const editActionSource = readFileSync(
        "app/dashboard/ankauf/[purchaseId]/edit/actions.ts",
        "utf8",
    );

    assert.equal(
        createActionSource.includes("syncPurchasePaymentFinancialEntry"),
        false,
    );
    assert.equal(
        editActionSource.includes("syncPurchasePaymentFinancialEntry"),
        false,
    );
});
