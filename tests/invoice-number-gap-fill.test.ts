import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync(
    new URL(
        "../supabase/migrations/20260925182900_reserve_gap_invoice_numbers.sql",
        import.meta.url,
    ),
    "utf8",
);

const invoiceActionsSource = readFileSync(
    new URL("../app/dashboard/sales/[saleId]/invoice-actions.ts", import.meta.url),
    "utf8",
);

test("gap-fill migration never alters, renames or deletes existing invoice rows", () => {
    assert.doesNotMatch(migrationSql, /update\s+public\.invoices\b/i);
    assert.doesNotMatch(migrationSql, /delete\s+from\s+public\.invoices\b/i);
    assert.doesNotMatch(migrationSql, /alter table public\.invoices/i);
});

test("gap-fill migration derives reserved numbers generically from existing proforma data, not hardcoded values", () => {
    const sqlWithoutComments = migrationSql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");

    assert.match(
        migrationSql,
        /from public\.invoices p\s*\nwhere p\.invoice_type = 'proforma'/,
    );
    assert.match(migrationSql, /p\.invoice_number ~ '\^PRO-\[0-9\]\{3\}-\[0-9\]\+\$'/);
    assert.doesNotMatch(sqlWithoutComments, /026-141/);
    assert.doesNotMatch(sqlWithoutComments, /026-142/);
});

test("reservation table enforces one reservation per company+number and tracks which invoice consumed it", () => {
    assert.match(
        migrationSql,
        /create unique index if not exists invoice_number_reservations_company_number_key/,
    );
    assert.match(
        migrationSql,
        /used_by_invoice_id uuid references public\.invoices\(id\)/,
    );
});

test("get_next_invoice_number atomically drains a pending reservation before falling back to the counter, using SKIP LOCKED", () => {
    const startIndex = migrationSql.lastIndexOf(
        "create or replace function public.get_next_invoice_number",
    );
    const fn = migrationSql.slice(startIndex);

    assert.match(fn, /update public\.invoice_number_reservations/);
    assert.match(fn, /for update skip locked/);
    assert.match(fn, /if reserved_number is not null then\s*\n\s*return reserved_number;/);

    // The reservation drain must happen before the regular counter branch,
    // so a pending reservation always wins over the next sequential number.
    const reservationIndex = fn.indexOf("update public.invoice_number_reservations");
    const counterIndex = fn.indexOf("values (p_company_id, 'invoice', 1)");
    assert.ok(reservationIndex >= 0 && counterIndex >= 0 && reservationIndex < counterIndex);
});

test("createSaleInvoiceAction links a consumed reservation back to the created invoice for auditability", () => {
    assert.match(
        invoiceActionsSource,
        /\.from\("invoice_number_reservations"\)\s*\n\s*\.update\(\{ used_by_invoice_id: invoiceId \}\)/,
    );
});
