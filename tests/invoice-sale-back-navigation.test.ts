import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Rechnungsübersicht öffnet Verkaufsakten mit Rechnungen als Rückkehrziel", () => {
    const overviewSource = readFileSync(
        "components/invoices/invoices-overview.tsx",
        "utf8",
    );

    assert.match(overviewSource, /returnTo=\$\{encodeURIComponent\("\/dashboard\/invoices"\)\}/);
    assert.match(overviewSource, /router\.push\(getInvoiceSaleHref\(invoice\.sale_id\)\)/);
    assert.match(overviewSource, /href=\{getInvoiceSaleHref\(invoice\.sale_id\)\}/);
});

test("Verkaufsakte akzeptiert ausschließlich Rechnungen als alternatives Rückkehrziel", () => {
    const pageSource = readFileSync(
        "app/dashboard/sales/[saleId]/page.tsx",
        "utf8",
    );
    const detailSource = readFileSync("components/sales/sale-detail.tsx", "utf8");

    assert.match(
        pageSource,
        /resolvedSearchParams\.returnTo === "\/dashboard\/invoices"/,
    );
    assert.match(pageSource, /: "\/dashboard\/sales"/);
    assert.match(detailSource, /<Link href=\{backHref\}>/);
});
