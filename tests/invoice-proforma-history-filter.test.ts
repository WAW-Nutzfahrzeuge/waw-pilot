import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overviewSource = readFileSync(
    "components/invoices/invoices-overview.tsx",
    "utf8",
);

test("aktive und umgewandelte Proformas haben getrennte Rechnungsfilter", () => {
    assert.match(
        overviewSource,
        /invoiceFilter === "proforma"[\s\S]*invoice\.status !== "converted"/,
    );
    assert.match(
        overviewSource,
        /invoiceFilter === "past_proforma"[\s\S]*invoice\.status === "converted"/,
    );
    assert.match(overviewSource, /label="Vergangene Proforma-Rechnungen"/);
});

test("umgewandelte Proformas zählen nicht mehr als aktive Proformas", () => {
    assert.match(
        overviewSource,
        /invoice\.invoice_type === "proforma" &&[\s\S]*invoice\.status !== "converted"[\s\S]*summary\.proformaInvoices \+= 1/,
    );
    assert.match(
        overviewSource,
        /invoice\.invoice_type === "proforma" &&[\s\S]*invoice\.status === "converted"[\s\S]*summary\.pastProformaInvoices \+= 1/,
    );
});

test("Verkaufsnummer wird beim Anlegen des Verkaufs auch vor einer Proforma erzeugt", () => {
    const createSaleSource = readFileSync(
        "app/dashboard/sales/new/actions.ts",
        "utf8",
    );
    const nextSaleNumberIndex = createSaleSource.indexOf(
        "saleNumber = await getNextSaleNumber",
    );
    const saleInsertIndex = createSaleSource.indexOf('.from("sales")', nextSaleNumberIndex);
    const invoiceInsertIndex = createSaleSource.indexOf(
        '.from("invoices")',
        saleInsertIndex,
    );

    assert.ok(nextSaleNumberIndex >= 0);
    assert.ok(saleInsertIndex > nextSaleNumberIndex);
    assert.ok(invoiceInsertIndex > saleInsertIndex);
});
