import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getSaleDocumentReference } from "../lib/pdf/generated-documents/sale-document-reference.ts";

test("generated sale documents prefer the standard invoice number", () => {
    assert.equal(
        getSaleDocumentReference({
            sale: { invoiceNumber: "026-164", saleNumber: "026-173" },
        }),
        "026-164",
    );
});

test("sale number is only a fallback when no invoice exists yet", () => {
    assert.equal(
        getSaleDocumentReference({
            sale: { invoiceNumber: null, saleNumber: "026-164" },
        }),
        "026-164",
    );
});

test("all three generated documents include the invoice reference", () => {
    const handover = readFileSync("lib/pdf/templates/handover-protocol-pdf.ts", "utf8");
    const entry = readFileSync("lib/pdf/templates/entry-certificate-pdf.ts", "utf8");
    const transport = readFileSync("lib/pdf/templates/transport-proof-pdf.ts", "utf8");
    const storage = readFileSync(
        "lib/pdf/generated-documents/sale-generated-document-storage.ts",
        "utf8",
    );

    for (const template of [handover, entry, transport]) {
        assert.match(template, /getSaleDocumentReference\(data\)/);
        assert.match(template, /Rechnungsnummer/);
    }
    assert.match(storage, /getSaleDocumentReference\(documentData\)/);
});
