import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminDeleteActionsSource = readFileSync(
    new URL("../app/dashboard/admin-delete-actions.ts", import.meta.url),
    "utf8",
);
const saleDetailSource = readFileSync(
    new URL("../components/sales/sale-detail.tsx", import.meta.url),
    "utf8",
);

test("hard-delete of a sale is blocked when a final invoice exists", () => {
    assert.match(adminDeleteActionsSource, /async function assertSaleCanBeHardDeleted/);
    assert.match(
        adminDeleteActionsSource,
        /\.from\("invoices"\)[\s\S]*?\.eq\("sale_id", saleId\)/,
    );
    assert.match(
        adminDeleteActionsSource,
        /invoice\.invoice_type !== "proforma"/,
    );
    assert.match(
        adminDeleteActionsSource,
        /Ein Verkauf mit finaler Rechnung darf nicht endgültig gelöscht werden/,
    );
});

test("sales with a final invoice guide admins directly to the cancellation flow", () => {
    assert.match(saleDetailSource, /saleHasFinalInvoice/);
    assert.match(saleDetailSource, /href="#invoice-corrections"/);
    assert.match(saleDetailSource, /Stornorechnung erstellen/);
});
