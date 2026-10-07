import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Verkäufe und Rechnungen sind standardmäßig absteigend sortiert", () => {
    const overviewFiles = [
        "components/sales/sales-overview.tsx",
        "components/invoices/invoices-overview.tsx",
    ];

    for (const file of overviewFiles) {
        const source = readFileSync(file, "utf8");
        assert.match(
            source,
            /useState<SortDirection>\("descending"\)/,
            `${file} muss absteigend starten`,
        );
    }
});
