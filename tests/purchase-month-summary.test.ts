import assert from "node:assert/strict";
import test from "node:test";

import {
    getPurchaseMonthOptions,
    getPurchaseVatForMonth,
} from "../lib/purchases/purchase-month-summary.ts";

const purchases = [
    { purchase_date: "2026-02-04", vat_amount: 190 },
    { purchase_date: "2026-01-31", vat_amount: 95 },
    { purchase_date: "2026-02-18", vat_amount: 0 },
    { purchase_date: "invalid", vat_amount: 10 },
];

test("purchase months are unique and sorted newest first", () => {
    assert.deepEqual(getPurchaseMonthOptions(purchases), ["2026-02", "2026-01"]);
});

test("purchase VAT totals use the purchase date month and recorded VAT", () => {
    assert.equal(getPurchaseVatForMonth(purchases, "2026-02"), 190);
    assert.equal(getPurchaseVatForMonth(purchases, "2026-01"), 95);
    assert.equal(getPurchaseVatForMonth(purchases, "all"), 285);
});
