import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildSaleSearchText, matchesSaleSearchText } from "../lib/sales/sale-search.ts";

test("sales search matches complete and partial identifiers case-insensitively", () => {
    const text = buildSaleSearchText(["VK-A020195877"]);

    assert.equal(matchesSaleSearchText(text, "VK-A020195877"), true);
    assert.equal(matchesSaleSearchText(text, "A020195"), true);
    assert.equal(matchesSaleSearchText(text, "vk-a020195877"), true);
    assert.equal(matchesSaleSearchText(text, "VK-A020195878"), false);
});

test("sales search trims surrounding query whitespace", () => {
    const text = buildSaleSearchText(["VK-A020195877"]);

    assert.equal(matchesSaleSearchText(text, "  VK-A020195877  "), true);
    assert.equal(matchesSaleSearchText(text, "   "), true);
});

test("existing invoice, vehicle, VIN, customer, country and sale-type search fields remain indexed", () => {
    const text = buildSaleSearchText([
        "VK-A020195877",
        "026-153",
        "Mercedes Actros",
        "WDB123456789",
        "Max Mustermann",
        "Deutschland",
        "Inland",
        "Übergabeprotokoll fehlt",
    ]);

    for (const existingQuery of ["026-153", "actros", "WDB123456789", "mustermann", "deutschland", "inland", "übergabeprotokoll"]) {
        assert.equal(matchesSaleSearchText(text, existingQuery), true, `${existingQuery} should still match`);
    }
});

test("sales overview loads sale_identifier under the existing company filter and uses the existing search field", () => {
    const query = readFileSync("lib/sales/sale-queries.ts", "utf8");
    const overview = readFileSync("components/sales/sales-overview.tsx", "utf8");

    assert.match(query, /\.select\([\s\S]*?sale_identifier[\s\S]*?\)\s*\.eq\("company_id", companyId\)/);
    assert.match(overview, /sale\.sale_identifier/);
    assert.match(overview, /matchesSaleSearchText\(saleSearchIndex\.get\(sale\.id\) \?\? "", query\)/);
    assert.match(overview, /Verkaufskennung/);
});
