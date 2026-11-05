import assert from "node:assert/strict";
import test from "node:test";

import { emptyVehicleListingDetails, normalizeVehicleListingDetails, parseVehicleListingDetailsForm } from "../lib/vehicles/listing-details.ts";

test("optional listing details parse explicit units and preserve absence without conversion", () => {
    const form = new FormData();
    form.set("listing_enginePowerKw", "330");
    form.set("listing_grossVehicleWeightKg", "32000");
    form.set("listing_payloadKg", "");
    form.set("listing_wheelbaseMm", "4200");
    form.set("listing_mixerNominalVolumeM3", "9,5");
    form.set("listing_huUntil", "2027-05");
    const result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.enginePowerKw, 330);
    assert.equal(result.value.grossVehicleWeightKg, 32000);
    assert.equal(result.value.payloadKg, null);
    assert.equal(result.value.wheelbaseMm, 4200);
    assert.equal(result.value.mixerNominalVolumeM3, 9.5);
    assert.equal(result.value.huUntil, "2027-05");
    assert.equal(result.value.availabilityConfirmed, false);
});

test("availability location is only retained after explicit confirmation", () => {
    const form = new FormData();
    form.set("listing_vehicleLocation", "Hamburg");
    let result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.vehicleLocation, null);
    form.set("listing_availabilityConfirmed", "on");
    result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.vehicleLocation, "Hamburg");
});

test("invalid units, range and inspection date are rejected instead of silently converted", () => {
    for (const [key, value] of [["payloadKg", "2.5t"], ["enginePowerKw", "3001"], ["huUntil", "05/2027"]]) {
        const form = new FormData();
        form.set(`listing_${key}`, value);
        assert.equal(parseVehicleListingDetailsForm(form, "listing_").ok, false, `${key}=${value}`);
    }
});

test("old vehicle records normalize safely and unknown OCR-like keys are not persisted", () => {
    assert.deepEqual(normalizeVehicleListingDetails(null), emptyVehicleListingDetails);
    const normalized = normalizeVehicleListingDetails({ enginePowerKw: 300, ownerName: "private", vinFromOcr: "secret", payloadKg: "5000", vehicleLocation: "Berlin" });
    assert.equal(normalized.enginePowerKw, 300);
    assert.equal(normalized.payloadKg, null);
    assert.equal(normalized.vehicleLocation, null);
    assert.equal("ownerName" in normalized, false);
    assert.equal("vinFromOcr" in normalized, false);
});
