import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the sale detail exposes the current vehicle registration through the protected document route", () => {
    const querySource = readFileSync("lib/sales/sale-detail-queries.ts", "utf8");
    const componentSource = readFileSync("components/sales/sale-detail.tsx", "utf8");

    assert.equal(querySource.includes("attachVehicleRegistrationDocument"), true);
    assert.equal(querySource.includes('"vehicle_registration"'), true);
    assert.equal(querySource.includes("selectCurrentVehicleDocument"), true);
    assert.equal(componentSource.includes("vehicle_registration_document"), true);
    assert.equal(componentSource.includes("?download=1"), true);
});
