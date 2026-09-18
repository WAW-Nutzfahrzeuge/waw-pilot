import assert from "node:assert/strict";
import test from "node:test";

import {
    buildInventorySearchText,
    calculateHistoricalInventoryValueNet,
    calculateInventoryValueNet,
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
