import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("die Verkaufsübersicht startet mit allen Verkäufen statt nur dem aktuellen Monat", async () => {
    const source = await readFile(
        new URL("../components/sales/sales-overview.tsx", import.meta.url),
        "utf8",
    );

    assert.match(source, /normalizeMonthFilter\(initialMonthFilter \?\? "all"\)/);
    assert.match(source, /defaultValue="all"/);
});

test("der Monatsfilter kann pro Übersicht einen eigenen URL-Standard verwenden", async () => {
    const source = await readFile(
        new URL("../components/filters/month-filter.tsx", import.meta.url),
        "utf8",
    );

    assert.match(source, /defaultValue = "current"/);
    assert.match(source, /normalizeMonthFilter\(nextValue\) === normalizeMonthFilter\(defaultValue\)/);
});
