import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Bug: after converting a proforma into a final invoice, the /dashboard/sales
// overview kept showing the proforma's invoice number instead of the final
// invoice number. Root cause: getSales() picked "the" invoice for a sale via
// getSingleRelation(sale.invoices), which just returns the first row Supabase
// happens to return (typically the older, first-created proforma) — unlike
// two other query functions in this same file, which already prefer the
// "standard" invoice type when one exists.
const source = readFileSync(
    new URL("../lib/sales/sale-queries.ts", import.meta.url),
    "utf8",
);

function getFunctionBody(name: string): string {
    const startIndex = source.indexOf(`export async function ${name}(`);
    assert.ok(startIndex >= 0, `${name} not found`);
    const nextExportIndex = source.indexOf("export async function", startIndex + 1);
    return nextExportIndex >= 0
        ? source.slice(startIndex, nextExportIndex)
        : source.slice(startIndex);
}

test("fix: getSales() (the /dashboard/sales overview query) prefers the standard invoice over a proforma", () => {
    const fn = getFunctionBody("getSales");

    assert.match(
        fn,
        /invoices\.find\(\(item\) => item\.invoice_type === "standard"\)\s*\?\?\s*getSingleRelation\(sale\.invoices\)/,
        "getSales() must prefer invoice_type === \"standard\" before falling back to the first relation",
    );
});

test("fix: the other sale-summary query functions still keep their existing standard-invoice preference", () => {
    for (const name of ["getSalesDashboardSummary", "getSalesToCheckSummary"]) {
        const fn = getFunctionBody(name);
        assert.match(
            fn,
            /invoice_type === "standard"/,
            `${name} should still prefer the standard invoice`,
        );
    }
});
