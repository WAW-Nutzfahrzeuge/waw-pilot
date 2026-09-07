import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    formatInvoiceNumber,
    getInvoiceYearPrefix,
    getNextInvoiceNumberPreview,
} from "../lib/invoices/invoice-number.ts";

test("invoice year prefix is always three digits with a leading zero", () => {
    assert.equal(getInvoiceYearPrefix(new Date("2026-01-01T00:00:00.000Z")), "026");
    assert.equal(getInvoiceYearPrefix(new Date("2027-01-01T00:00:00.000Z")), "027");
    assert.equal(getInvoiceYearPrefix(new Date("2028-01-01T00:00:00.000Z")), "028");
    assert.equal(getInvoiceYearPrefix(new Date("2029-01-01T00:00:00.000Z")), "029");
    assert.equal(getInvoiceYearPrefix(new Date("2030-01-01T00:00:00.000Z")), "030");
});

test("invoice preview keeps the sequence independent from the year", () => {
    assert.equal(getNextInvoiceNumberPreview(new Date("2026-06-15T00:00:00.000Z"), 132), "026-132");
    assert.equal(getNextInvoiceNumberPreview(new Date("2026-06-15T00:00:00.000Z"), 133), "026-133");
    assert.equal(getNextInvoiceNumberPreview(new Date("2026-06-15T00:00:00.000Z"), 134), "026-134");
    assert.equal(getNextInvoiceNumberPreview(new Date("2027-01-01T00:00:00.000Z"), 135), "027-135");
});

test("invoice number formatting pads short sequence numbers", () => {
    assert.equal(formatInvoiceNumber("026", 1), "026-001");
});

test("number counter migration uses atomic counters for purchase, sale and invoices", () => {
    const sql = readFileSync(
        new URL("../supabase/migrations/20260907120000_add_atomic_number_counters.sql", import.meta.url),
        "utf8",
    );
    const nextFunctionsSql = sql.slice(sql.indexOf("create or replace function public.next_purchase_number"));

    assert.match(sql, /create table if not exists public\.number_counters/);
    assert.match(sql, /on conflict \(company_id, counter_key\)[\s\S]*current_value = public\.number_counters\.current_value \+ 1/);
    assert.match(sql, /target_company_id,\s*'purchase:' \|\| current_year/);
    assert.match(sql, /'EK-' \|\| lpad\(next_number::text, 3, '0'\) \|\| '-' \|\| current_year/);
    assert.match(sql, /target_company_id, 'sale:' \|\| sale_year_prefix/);
    assert.match(sql, /sale_year_prefix \|\| '-' \|\| lpad\(next_number::text, 3, '0'\)/);
    assert.match(sql, /p_company_id, 'invoice'/);
    assert.doesNotMatch(nextFunctionsSql, /\bmax\s*\(/i);
    assert.doesNotMatch(nextFunctionsSql, /\bcount\s*\(/i);
});
