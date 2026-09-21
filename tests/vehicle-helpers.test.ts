import assert from "node:assert/strict";
import test from "node:test";

import { getVehicleStatusLabel } from "../lib/vehicles/vehicle-helpers.ts";

test("vehicle status codes are mapped to human-readable German labels", () => {
    assert.equal(getVehicleStatusLabel("in_stock"), "Im Bestand");
    assert.equal(getVehicleStatusLabel("reserved"), "Reserviert");
    assert.equal(getVehicleStatusLabel("sold"), "Verkauft");
});

test("vehicle status label never returns the raw technical code", () => {
    for (const status of ["in_stock", "reserved", "sold"] as const) {
        const label = getVehicleStatusLabel(status);

        assert.notEqual(label, status);
        assert.notEqual(label.toLowerCase(), "stock");
    }
});
