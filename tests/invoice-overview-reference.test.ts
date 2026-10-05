import assert from "node:assert/strict";
import test from "node:test";

import { getInvoiceOverviewReference } from "../lib/invoices/invoice-overview-reference.ts";

test("Rechnungsübersicht trennt Rechnungsnummer und Verkaufsnummer", () => {
    const reference = getInvoiceOverviewReference({
        invoice_number: "026-140",
        sale_number: "026-136",
        sale_id: "sale-id",
    });

    assert.deepEqual(reference, {
        invoiceNumber: "026-140",
        saleReference: "026-136",
    });
});

test("Verkaufsreferenz fällt nur bei fehlender Verkaufsnummer auf die ID zurück", () => {
    const reference = getInvoiceOverviewReference({
        invoice_number: "026-140",
        sale_number: null,
        sale_id: "sale-id",
    });

    assert.equal(reference.invoiceNumber, "026-140");
    assert.equal(reference.saleReference, "sale-id");
});
