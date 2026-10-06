import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    ensureSaleIdentifierInEmailText,
    ensureSaleIdentifierInSubject,
} from "../lib/sales/sale-identifier.ts";

const migrationSource = readFileSync(
    new URL(
        "../supabase/migrations/20261006120000_add_immutable_sale_identifier.sql",
        import.meta.url,
    ),
    "utf8",
);

test("Verkaufskennungen werden automatisch erzeugt, backfillt und eindeutig abgesichert", () => {
    assert.match(migrationSource, /add column if not exists sale_identifier text/i);
    assert.match(migrationSource, /set default public\.generate_sale_identifier\(\)/i);
    assert.match(migrationSource, /where sale_identifier is null or btrim\(sale_identifier\) = ''/i);
    assert.match(migrationSource, /create unique index if not exists sales_sale_identifier_key/i);
    assert.match(migrationSource, /alter column sale_identifier set not null/i);
});

test("Verkaufskennungen sind nach dem Anlegen unveränderlich", () => {
    assert.match(migrationSource, /new\.sale_identifier is distinct from old\.sale_identifier/i);
    assert.match(migrationSource, /Die Verkaufskennung ist unveränderlich/i);
});

test("erneuter Versand ergänzt die Kennung in Betreff und Text nicht doppelt", () => {
    const identifier = "VK-7K4M9P2XAB";
    const subject = ensureSaleIdentifierInSubject("Dokumente", identifier);
    const text = ensureSaleIdentifierInEmailText("Bitte zurücksenden.", identifier, "de");

    assert.equal(subject, `Dokumente · ${identifier}`);
    assert.equal(ensureSaleIdentifierInSubject(subject, identifier), subject);
    assert.match(text, /bei Rückfragen und bei der Rücksendung/);
    assert.equal(ensureSaleIdentifierInEmailText(text, identifier, "de"), text);
});

test("alle drei Rücklauf-PDFs zeichnen die Verkaufskennung auf jeder Seite", () => {
    const footerSource = readFileSync(
        new URL("../lib/pdf/core/sale-identifier-footer.ts", import.meta.url),
        "utf8",
    );

    assert.match(footerSource, /Verkaufskennung:/);
    assert.match(footerSource, /for \(const page of pdfDoc\.getPages\(\)\)/);

    for (const template of [
        "handover-protocol-pdf.ts",
        "entry-certificate-pdf.ts",
        "transport-proof-pdf.ts",
    ]) {
        const source = readFileSync(
            new URL(`../lib/pdf/templates/${template}`, import.meta.url),
            "utf8",
        );
        assert.match(source, /drawSaleIdentifierOnEveryPage/);
    }
});

