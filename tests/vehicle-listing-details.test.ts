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

test("availability and location are independent; unknown stays distinct from immediate", () => {
    const form = new FormData();
    form.set("listing_vehicleLocation", "Hamburg");
    let result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.vehicleLocation, "Hamburg");
        assert.equal(result.value.availabilityStatus, "unknown");
    }
    form.set("listing_availabilityStatus", "immediate");
    result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.vehicleLocation, "Hamburg");
        assert.equal(result.value.availabilityStatus, "immediate");
    }
});

test("unknown equipment, damage, and function states stay distinct from explicit no", () => {
    const form = new FormData();
    form.set("listing_featureCamera", "no");
    form.set("listing_currentDamageStatus", "none");
    form.set("listing_repairedDamageStatus", "unknown");
    const result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.featureCamera, "no");
        assert.equal(result.value.currentDamageStatus, "none");
        assert.equal(result.value.repairedDamageStatus, "unknown");
    }
});

test("hidden vehicle-type fields are preserved and contradictory damage input is rejected", () => {
    const existing = { ...emptyVehicleListingDetails, mixerNominalVolumeM3: 8, mixerDrumCondition: "Prüfwert" };
    const result = parseVehicleListingDetailsForm(new FormData(), "listing_", existing);
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.mixerNominalVolumeM3, 8);
        assert.equal(result.value.mixerDrumCondition, "Prüfwert");
    }
    const contradictory = new FormData();
    contradictory.set("listing_currentDamageStatus", "none");
    contradictory.set("listing_knownDamages", "Schaden vorhanden");
    assert.equal(parseVehicleListingDetailsForm(contradictory, "listing_").ok, false);
});

test("separate F.1/F.2 values and dimensions validate without unit conversion", () => {
    const form = new FormData();
    form.set("listing_permittedMassF1Kg", "32000");
    form.set("listing_permittedMassF2Kg", "28000");
    form.set("listing_lengthMm", "9000");
    form.set("listing_widthMm", "2500");
    form.set("listing_heightMm", "3900");
    const result = parseVehicleListingDetailsForm(form, "listing_");
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.permittedMassF1Kg, 32000);
        assert.equal(result.value.permittedMassF2Kg, 28000);
        assert.equal(result.value.lengthMm, 9000);
    }
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
    assert.equal(normalized.vehicleLocation, "Berlin");
    assert.equal("ownerName" in normalized, false);
    assert.equal("vinFromOcr" in normalized, false);
});
