import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    getVehicleSaleAction,
    resolveSalePrefillVehicleId,
} from "../lib/sales/sale-create-prefill.ts";

const sellableVehicles = [
    { id: "vehicle-1", status: "in_stock" },
    { id: "vehicle-2", status: "reserved" },
    { id: "vehicle-sold", status: "sold" },
];

test("sale create preselects a sellable vehicle from the current company vehicle list", () => {
    assert.equal(
        resolveSalePrefillVehicleId(sellableVehicles, "vehicle-1"),
        "vehicle-1",
    );
});

test("sale create ignores missing or cross-company vehicle ids", () => {
    assert.equal(resolveSalePrefillVehicleId(sellableVehicles, "other-company"), null);
    assert.equal(resolveSalePrefillVehicleId(sellableVehicles, null), null);
});

test("sale create does not preselect a sold vehicle", () => {
    assert.equal(resolveSalePrefillVehicleId(sellableVehicles, "vehicle-sold"), null);
});

test("vehicle detail offers selling only for sellable vehicles without existing sales", () => {
    assert.deepEqual(
        getVehicleSaleAction({
            id: "vehicle-1",
            status: "in_stock",
            sales: [],
        }),
        {
            kind: "create",
            href: "/dashboard/sales/new?vehicleId=vehicle-1",
            label: "Fahrzeug verkaufen",
        },
    );
});

test("vehicle detail links existing sale instead of offering duplicate sale", () => {
    assert.deepEqual(
        getVehicleSaleAction({
            id: "vehicle-1",
            status: "sold",
            sales: [{ id: "sale-1", status: "active" }],
        }),
        {
            kind: "open",
            href: "/dashboard/sales/sale-1",
            label: "Verkauf öffnen",
        },
    );
});

test("vehicle detail hides sale action for unsellable vehicles without sale", () => {
    assert.deepEqual(
        getVehicleSaleAction({
            id: "vehicle-1",
            status: "sold",
            sales: [],
        }),
        { kind: "none" },
    );
});

test("sale create action keeps server-side duplicate-sale safeguards", () => {
    const source = readFileSync("app/dashboard/sales/new/actions.ts", "utf8");

    assert.equal(source.includes('.from("sales")'), true);
    assert.equal(source.includes('.eq("vehicle_id", vehicleId)'), true);
    assert.equal(source.includes('.eq("status", "active")'), true);
    assert.equal(source.includes('.from("vehicles")'), true);
    assert.equal(source.includes('status: "sold"'), true);
    assert.equal(source.includes('.in("status", ["in_stock", "reserved"])'), true);
});
