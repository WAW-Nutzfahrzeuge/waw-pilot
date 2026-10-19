import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getPastProformaInvoiceIds } from "../lib/invoices/proforma-history.ts";

const overviewSource = readFileSync(
    "components/invoices/invoices-overview.tsx",
    "utf8",
);

test("aktive und umgewandelte Proformas haben getrennte Rechnungsfilter", () => {
    assert.match(
        overviewSource,
        /invoiceFilter === "proforma"[\s\S]*pastProformaInvoiceIds\.has\(invoice\.id\)/,
    );
    assert.match(
        overviewSource,
        /invoiceFilter === "past_proforma"[\s\S]*pastProformaInvoiceIds\.has\(invoice\.id\)/,
    );
    assert.match(overviewSource, /label="Vergangene Proforma-Rechnungen"/);
});

test("umgewandelte Proformas zählen nicht mehr als aktive Proformas", () => {
    assert.match(
        overviewSource,
        /invoice\.invoice_type === "proforma" &&[\s\S]*!pastProformaInvoiceIds\.has\(invoice\.id\)[\s\S]*summary\.proformaInvoices \+= 1/,
    );
    assert.match(
        overviewSource,
        /invoice\.invoice_type === "proforma" &&[\s\S]*pastProformaInvoiceIds\.has\(invoice\.id\)[\s\S]*summary\.pastProformaInvoices \+= 1/,
    );
});

test("a proforma is shown as past if a standard invoice already exists for its sale", () => {
    const invoiceRows = [
        { id: "proforma-1", sale_id: "sale-1", invoice_type: "proforma", status: "created" },
        { id: "standard-1", sale_id: "sale-1", invoice_type: "standard", status: "created" },
        { id: "proforma-2", sale_id: "sale-2", invoice_type: "proforma", status: "created" },
    ];

    assert.deepEqual([...getPastProformaInvoiceIds(invoiceRows)], ["proforma-1"]);
});

test("an explicitly converted proforma remains in history if its sale has no standard invoice row", () => {
    const invoiceRows = [
        { id: "proforma-1", sale_id: "sale-1", invoice_type: "proforma", status: "converted" },
    ];

    assert.deepEqual([...getPastProformaInvoiceIds(invoiceRows)], ["proforma-1"]);
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
