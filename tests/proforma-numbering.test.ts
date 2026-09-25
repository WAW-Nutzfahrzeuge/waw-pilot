import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
    new URL(
        "../supabase/migrations/20260925170900_separate_proforma_invoice_numbering.sql",
        import.meta.url,
    ),
    "utf8",
);

const invoiceActionsSource = readFileSync(
    new URL("../app/dashboard/sales/[saleId]/invoice-actions.ts", import.meta.url),
    "utf8",
);

const pdfSources = [
    "../lib/pdf/invoice-pdf.ts",
    "../lib/pdf/invoice-pdf-data.ts",
    "../lib/pdf/invoice-storage.ts",
].map((relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
);

function getNextInvoiceNumberFunctionBody(sql: string): string {
    const startIndex = sql.lastIndexOf(
        "create or replace function public.get_next_invoice_number",
    );
    assert.ok(startIndex >= 0, "get_next_invoice_number definition not found");
    return sql.slice(startIndex);
}

test("TEST 1+2: proforma invoices get their own year-scoped counter key, distinct from 'invoice'", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);

    assert.match(fn, /if p_invoice_type = 'proforma' then/);
    assert.match(
        fn,
        /'invoice:proforma:' \|\| proforma_year_prefix/,
        "proforma counter key must be distinct from the regular 'invoice' counter key",
    );
    assert.match(
        fn,
        /return 'PRO-' \|\| proforma_year_prefix \|\| '-' \|\| lpad\(next_number::text, 3, '0'\)/,
    );
    assert.match(fn, /proforma_year_prefix := to_char\(p_invoice_date, 'YYY'\)/);
});

test("TEST 3: regular invoice counter key and format stay exactly as before", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);

    assert.match(fn, /invoice_year_prefix := to_char\(p_invoice_date, 'YY'\)/);
    assert.match(fn, /values \(p_company_id, 'invoice', 1\)/);
    assert.match(
        fn,
        /return invoice_year_prefix \|\| '-' \|\| lpad\(next_number::text, 3, '0'\)/,
    );
});

test("TEST 5+6+9: both counters use the same atomic on-conflict pattern and no client-side MAX()/COUNT() sequencing", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);

    const onConflictMatches = fn.match(
        /on conflict \(company_id, counter_key\) do update[\s\S]*?current_value = public\.number_counters\.current_value \+ 1/g,
    );

    assert.ok(onConflictMatches, "expected atomic on-conflict increments");
    assert.equal(
        onConflictMatches?.length,
        2,
        "both the proforma branch and the regular branch must use the atomic counter pattern",
    );
    assert.doesNotMatch(fn, /\bmax\s*\(/i);
    assert.doesNotMatch(fn, /\bcount\s*\(/i);
});

test("creating a proforma invoice never touches the regular 'invoice' counter key", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);
    const proformaBranch = fn.slice(
        fn.indexOf("if p_invoice_type = 'proforma' then"),
        fn.indexOf("-- Regular counter/format"),
    );

    assert.doesNotMatch(proformaBranch, /'invoice', 1/);
    assert.doesNotMatch(proformaBranch, /values \(p_company_id, 'invoice',/);
});

test("TEST 4: invoices gain a nullable, unique, self-referencing link from a final invoice back to its source proforma", () => {
    assert.match(
        migrationSql,
        /add column if not exists source_proforma_invoice_id uuid references public\.invoices\(id\)/,
    );
    assert.match(
        migrationSql,
        /add constraint invoices_no_self_source_proforma check \(\s*source_proforma_invoice_id is null or source_proforma_invoice_id <> id/,
    );
    assert.match(
        migrationSql,
        /create unique index if not exists invoices_source_proforma_invoice_id_key\s*\non public\.invoices\(source_proforma_invoice_id\)\s*where source_proforma_invoice_id is not null/,
    );
});

test("TEST 4: creating a standard invoice looks up an unconverted proforma for the same sale and links it", () => {
    assert.match(
        invoiceActionsSource,
        /invoiceType === "standard"/,
    );
    assert.match(
        invoiceActionsSource,
        /\.eq\("invoice_type", "proforma"\)\s*\n\s*\.is\("source_proforma_invoice_id", null\)/,
    );
    assert.match(
        invoiceActionsSource,
        /source_proforma_invoice_id: sourceProformaInvoiceId,/,
    );
});

test("TEST 4/9: the regular invoice number for a converted proforma is requested via the standard invoiceType, not reused from the proforma", () => {
    assert.match(
        invoiceActionsSource,
        /const invoiceNumber = await getNextInvoiceNumber\(\{\s*invoiceType,\s*invoiceDate: sale\.sale_date,\s*\}\);/,
    );
});

test("TEST 7+8: PDF generation only reads the already-stored invoice_number and never calls the numbering RPC", () => {
    for (const source of pdfSources) {
        assert.doesNotMatch(source, /get_next_invoice_number/);
        assert.doesNotMatch(source, /getNextInvoiceNumber/);
    }
});

test("proforma invoices remain excluded from ZUGFeRD/e-invoice generation", () => {
    assert.match(invoiceActionsSource, /invoice\.invoice_type !== "standard"/);
});
