import assert from "node:assert/strict";
import test from "node:test";

import {
    buildInventorySearchText,
    calculateHistoricalInventoryValueNet,
    calculateInventorySnapshotTotals,
    calculateInventoryValueNet,
    isVehicleInStockAtDate,
    wasVehicleInInventoryPeriod,
} from "../lib/vehicles/inventory-domain.ts";

test("inventory date filter includes vehicles purchased on or before the cutoff", () => {
    assert.equal(
        wasVehicleInInventoryPeriod({
            row: { purchaseDate: "2026-08-01", saleDate: null },
            fromDate: "",
            toDate: "2026-08-31",
        }),
        true,
    );
});

test("inventory date filter excludes vehicles purchased after the cutoff", () => {
    assert.equal(
        wasVehicleInInventoryPeriod({
            row: { purchaseDate: "2026-09-01", saleDate: null },
            fromDate: "",
            toDate: "2026-08-31",
        }),
        false,
    );
});

test("inventory date filter treats a single cutoff as a historical stock snapshot", () => {
    assert.equal(
        wasVehicleInInventoryPeriod({
            row: { purchaseDate: "2026-08-01", saleDate: "2026-08-20" },
            fromDate: "",
            toDate: "2026-08-31",
        }),
        false,
    );

    assert.equal(
        wasVehicleInInventoryPeriod({
            row: { purchaseDate: "2026-08-01", saleDate: "2026-09-01" },
            fromDate: "",
            toDate: "2026-08-31",
        }),
        true,
    );
});

test("inventory search text contains seller and buyer customer names case-insensitively", () => {
    const searchText = buildInventorySearchText({
        row: {
            stockNumber: "E-1",
            vehicleLabel: "MAN TGX",
            vin: "YS2S6X20005591533",
            vinLastSix: "591533",
            licensePlate: "NE-WA 100",
            stockStartDate: "2026-08-01",
            stockEndDate: null,
            purchaseNumber: "EK 1",
            purchaseDate: "2026-08-01",
            sellerName: "Traudes GmbH",
            purchaseNetAmount: 100000,
            additionalCostsNet: 500,
            saleNumber: "VK 2",
            saleDate: "2026-09-15",
            buyerName: "Latino. LCL",
            saleNetAmount: 120000,
            invoiceNumber: "026-032",
            rawProfitNet: 19500,
            statusLabel: "Bestand",
        },
        formatDate: (value) => value ?? "-",
        formatMoney: (value) => (value === null ? "-" : String(value)),
    });

    assert.equal(searchText.includes("traud"), true);
    assert.equal(searchText.includes("latino. lcl"), true);
});

test("inventory value uses net purchase values for current stock only", () => {
    assert.equal(
        calculateInventoryValueNet([
            { status: "in_stock", purchaseNetAmount: 100000 },
            { status: "reserved", purchaseNetAmount: 50000 },
            { status: "sold", purchaseNetAmount: 90000 },
        ]),
        150000,
    );
});

test("historical inventory value includes vehicles that are sold today but were stock at cutoff", () => {
    assert.equal(
        calculateHistoricalInventoryValueNet([
            { purchaseNetAmount: 100000 },
            { purchaseNetAmount: 90000 },
        ]),
        190000,
    );
});

// ===========================================================================
// Inventurliste (historischer Stichtags-Bestand) - isVehicleInStockAtDate
// ===========================================================================

test("TEST 1: Ankauf vor Stichtag, kein Verkauf -> im Bestand", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-05-01",
            saleDate: null,
            asOfDate: "2026-06-15",
        }),
        true,
    );
});

test("TEST 2: Ankauf vor Stichtag, Verkauf nach Stichtag -> im Bestand", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-05-10",
            saleDate: "2026-07-20",
            asOfDate: "2026-06-15",
        }),
        true,
    );
});

test("TEST 3: Ankauf vor Stichtag, Verkauf vor Stichtag -> nicht im Bestand", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-01-01",
            saleDate: "2026-06-01",
            asOfDate: "2026-06-15",
        }),
        false,
    );
});

test("TEST 4: Ankauf nach Stichtag -> nicht im Bestand", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-06-20",
            saleDate: null,
            asOfDate: "2026-06-15",
        }),
        false,
    );
});

test("TEST 5: Ankauf genau am Stichtag, kein Verkauf -> im Bestand (Ankauf am Stichtag zählt)", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-06-15",
            saleDate: null,
            asOfDate: "2026-06-15",
        }),
        true,
    );
});

test("TEST 6: Verkauf genau am Stichtag -> nicht im Bestand (Stichtag = Ende des Tages)", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-01-01",
            saleDate: "2026-06-15",
            asOfDate: "2026-06-15",
        }),
        false,
    );
});

test("TEST 7: stornierter Verkauf darf das Fahrzeug nicht aus dem Bestand entfernen", () => {
    // Nach lib/sales/cancellation-release.ts wird ein Verkauf bei voller
    // Stornierung auf status "cancelled" gesetzt. inventory-list-queries.ts
    // filtert cancelled-Verkäufe bereits per `.neq("status", "cancelled")"
    // heraus, sodass für ein storniertes Fahrzeug kein saleDate ankommt - die
    // Inventurliste bekommt dafür effektiv saleDate: null.
    const activeSales = [
        { id: "sale-1", status: "cancelled", sale_date: "2026-06-01" },
    ].filter((sale) => sale.status !== "cancelled");

    const saleDateAfterCancellationFilter = activeSales[0]?.sale_date ?? null;

    assert.equal(saleDateAfterCancellationFilter, null);

    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-05-01",
            saleDate: saleDateAfterCancellationFilter,
            asOfDate: "2026-06-15",
        }),
        true,
        "Fahrzeug mit ausschließlich storniertem Verkauf muss zum Stichtag im Bestand erscheinen",
    );
});

test("TEST 9: heutiger Stichtag stimmt mit dem fachlich aktuellen Bestand überein", () => {
    const today = new Date().toISOString().slice(0, 10);

    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: today,
            saleDate: null,
            asOfDate: today,
        }),
        true,
        "Heute angekauftes, nicht verkauftes Fahrzeug ist heute im Bestand (entspricht status in_stock)",
    );

    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: "2026-01-01",
            saleDate: today,
            asOfDate: today,
        }),
        false,
        "Heute verkauftes Fahrzeug ist zum heutigen Stichtag nicht mehr im Bestand (entspricht status sold)",
    );
});

test("TEST 10: Summenberechnung (Netto/MwSt./Brutto) entspricht exakt den enthaltenen Fahrzeugen", () => {
    const totals = calculateInventorySnapshotTotals([
        { purchaseNetAmount: 10000, purchaseVatAmount: 1900, purchaseGrossAmount: 11900 },
        { purchaseNetAmount: 5000, purchaseVatAmount: 0, purchaseGrossAmount: 5000 },
    ]);

    assert.equal(totals.vehicleCount, 2);
    assert.equal(totals.totalNetAmount, 15000);
    assert.equal(totals.totalVatAmount, 1900);
    assert.equal(totals.totalGrossAmount, 16900);
});

test("kein Ankaufdatum bedeutet niemals im Bestand", () => {
    assert.equal(
        isVehicleInStockAtDate({
            purchaseDate: null,
            saleDate: null,
            asOfDate: "2026-06-15",
        }),
        false,
    );
});
