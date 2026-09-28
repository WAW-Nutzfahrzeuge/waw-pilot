import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Bug: get_next_invoice_number()'s regular ("standard") branch used a 2-digit
// year prefix (to_char(..., 'YY') -> "26"), while the proforma branch and the
// reservation-queue rows both use/derive a 3-digit prefix ("026"). This
// produced visibly inconsistent numbers such as "26-145" next to
// "PRO-026-002" / "026-141" in the same UI.
const migrationSql = readFileSync(
    new URL(
        "../supabase/migrations/20260927120000_fix_regular_invoice_year_prefix_format.sql",
        import.meta.url,
    ),
    "utf8",
);

function getNextInvoiceNumberFunctionBody(sql: string): string {
    const startIndex = sql.lastIndexOf(
        "create or replace function public.get_next_invoice_number",
    );
    assert.ok(startIndex >= 0, "get_next_invoice_number definition not found");
    return sql.slice(startIndex);
}

test("fix: regular invoice branch now uses a 3-digit year prefix, matching the proforma branch", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);

    assert.match(fn, /proforma_year_prefix := to_char\(p_invoice_date, 'YYY'\)/);
    assert.match(fn, /invoice_year_prefix := to_char\(p_invoice_date, 'YYY'\)/);
    assert.doesNotMatch(
        fn,
        /invoice_year_prefix := to_char\(p_invoice_date, 'YY'\)/,
        "regular branch must no longer use the 2-digit year prefix",
    );
});

test("fix: the underlying atomic counter key/sequence for regular invoices is untouched", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);

    assert.match(fn, /values \(p_company_id, 'invoice', 1\)/);
    assert.match(
        fn,
        /on conflict \(company_id, counter_key\) do update[\s\S]*current_value = public\.number_counters\.current_value \+ 1/,
    );
    assert.doesNotMatch(fn, /\bmax\s*\(/i);
    assert.doesNotMatch(fn, /\bcount\s*\(/i);
});

test("fix: reservation-queue draining logic is preserved unchanged", () => {
    const fn = getNextInvoiceNumberFunctionBody(migrationSql);

    assert.match(fn, /from public\.invoice_number_reservations/);
    assert.match(fn, /for update skip locked/);
    assert.match(fn, /if reserved_number is not null then/);
});

test("fix: this migration does not touch/rename any already-issued invoice_number", () => {
    assert.doesNotMatch(migrationSql, /update public\.invoices/);
    assert.doesNotMatch(migrationSql, /set invoice_number/);
});
