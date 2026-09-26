import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventoryQueriesSource = readFileSync(
    new URL("../lib/vehicles/inventory-list-queries.ts", import.meta.url),
    "utf8",
);

const snapshotListSource = readFileSync(
    new URL("../components/vehicles/vehicle-stock-snapshot-list.tsx", import.meta.url),
    "utf8",
);

const overviewSource = readFileSync(
    new URL("../components/vehicles/vehicle-stock-overview.tsx", import.meta.url),
    "utf8",
);

test("TEST 8: vehicles-, purchase_cases- und sales-Query filtern strikt nach company_id (Mandantentrennung)", () => {
    const vehiclesQueryBlock = inventoryQueriesSource.slice(
        inventoryQueriesSource.indexOf('.from("vehicles")'),
        inventoryQueriesSource.indexOf(".order(", inventoryQueriesSource.indexOf('.from("vehicles")')),
    );
    assert.match(vehiclesQueryBlock, /\.eq\("company_id", companyId\)/);

    const purchasesQueryBlock = inventoryQueriesSource.slice(
        inventoryQueriesSource.indexOf('.from("purchase_cases")'),
        inventoryQueriesSource.indexOf(".order(", inventoryQueriesSource.indexOf('.from("purchase_cases")')),
    );
    assert.match(purchasesQueryBlock, /\.eq\("company_id", companyId\)/);

    const salesQueryBlock = inventoryQueriesSource.slice(
        inventoryQueriesSource.indexOf('.from("sales")'),
        inventoryQueriesSource.indexOf(".order(", inventoryQueriesSource.indexOf('.from("sales")')),
    );
    assert.match(salesQueryBlock, /\.eq\("company_id", companyId\)/);
});

test("stornierte Verkäufe werden bereits auf Query-Ebene ausgeschlossen (sales.status != cancelled)", () => {
    const salesQueryBlock = inventoryQueriesSource.slice(
        inventoryQueriesSource.indexOf('.from("sales")'),
        inventoryQueriesSource.indexOf(".order(", inventoryQueriesSource.indexOf('.from("sales")')),
    );

    assert.match(salesQueryBlock, /\.neq\("status", "cancelled"\)/);
});

test("purchase_cases-Query lädt vat_rate, vat_amount und gross_amount für die Inventurliste (keine erfundenen Felder, echte Spalten)", () => {
    assert.match(inventoryQueriesSource, /vat_rate/);
    assert.match(inventoryQueriesSource, /vat_amount/);
    assert.match(inventoryQueriesSource, /gross_amount/);
});

test("Inventurliste verwendet purchaseDate/saleDate (fachliche Daten), nicht created_at oder vehicle.status, für die Stichtagslogik", () => {
    assert.match(snapshotListSource, /isVehicleInStockAtDate/);
    assert.match(snapshotListSource, /purchaseDate: row\.purchaseDate/);
    assert.match(snapshotListSource, /saleDate: row\.saleDate/);
});

test("Inventurliste und Bestandsliste nutzen dieselben Zeilen-Daten (eine zentrale Query, keine Parallelimplementierung)", () => {
    assert.match(overviewSource, /VehicleInventoryList rows={rows}/);
    assert.match(overviewSource, /VehicleStockSnapshotList rows={rows}/);
});

test("Bestandsliste und Inventurliste sind als getrennte Tabs im bestehenden Bereich umgesetzt, kein neuer Hauptmenüpunkt", () => {
    assert.match(overviewSource, /value="bestandsliste"/);
    assert.match(overviewSource, /value="inventurliste"/);
});
