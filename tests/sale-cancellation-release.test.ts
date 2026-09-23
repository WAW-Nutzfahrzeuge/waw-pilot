import assert from "node:assert/strict";
import test from "node:test";

import {
    canVehicleBeReleasedAfterCancellation,
    isVehiclePurchasableAgain,
    SALE_STATUS_AFTER_CANCELLATION,
    VEHICLE_STATUS_AFTER_CANCELLATION,
    VEHICLE_STATUS_REQUIRED_FOR_RELEASE,
} from "../lib/sales/cancellation-release.ts";

type VehicleStatus = "in_stock" | "reserved" | "sold";

/**
 * Bildet exakt die Update-Semantik aus
 * SupabaseInvoiceCorrectionRepository.createCancellationInvoice() nach:
 * `vehicles.update({ status: "in_stock" }).eq("status", "sold")`.
 * Nur wenn das Fahrzeug aktuell "sold" ist, wird es freigegeben - sonst bleibt
 * der Status unverändert (Schutz vor versehentlichem Überschreiben).
 */
function applyCancellationToVehicle(currentStatus: VehicleStatus): VehicleStatus {
    if (canVehicleBeReleasedAfterCancellation(currentStatus)) {
        return VEHICLE_STATUS_AFTER_CANCELLATION;
    }

    return currentStatus;
}

test("cancellation constants match the business rule (voller Storno -> Verkauf storniert, Fahrzeug in Bestand)", () => {
    assert.equal(SALE_STATUS_AFTER_CANCELLATION, "cancelled");
    assert.equal(VEHICLE_STATUS_AFTER_CANCELLATION, "in_stock");
    assert.equal(VEHICLE_STATUS_REQUIRED_FOR_RELEASE, "sold");
});

test("ein verkauftes Fahrzeug wird durch die Stornierung wieder kaufbar", () => {
    const vehicleBeforeCancellation: VehicleStatus = "sold";

    assert.equal(isVehiclePurchasableAgain(vehicleBeforeCancellation), false);

    const vehicleAfterCancellation = applyCancellationToVehicle(vehicleBeforeCancellation);

    assert.equal(vehicleAfterCancellation, "in_stock");
    assert.equal(
        isVehiclePurchasableAgain(vehicleAfterCancellation),
        true,
        "Fahrzeug muss nach Stornierung wieder in den Bestandslisten auftauchen und verkaufbar sein",
    );
});

test("ein bereits reserviertes Fahrzeug wird durch eine (verspätete) Stornierung nicht überschrieben", () => {
    // Sicherheitsnetz: Falls das Fahrzeug zwischenzeitlich für einen anderen
    // Verkauf reserviert wurde, darf die Stornierung des alten Verkaufs diesen
    // neuen Zustand nicht zerstören.
    const vehicleReservedForAnotherSale: VehicleStatus = "reserved";

    const result = applyCancellationToVehicle(vehicleReservedForAnotherSale);

    assert.equal(result, "reserved");
    assert.equal(canVehicleBeReleasedAfterCancellation(vehicleReservedForAnotherSale), false);
});

test("ein Fahrzeug, das schon im Bestand ist, bleibt es (kein doppeltes Freigeben)", () => {
    const vehicleAlreadyInStock: VehicleStatus = "in_stock";

    const result = applyCancellationToVehicle(vehicleAlreadyInStock);

    assert.equal(result, "in_stock");
    assert.equal(isVehiclePurchasableAgain(result), true);
});

test("isVehiclePurchasableAgain erkennt nur in_stock und reserved als kaufbar", () => {
    assert.equal(isVehiclePurchasableAgain("in_stock"), true);
    assert.equal(isVehiclePurchasableAgain("reserved"), true);
    assert.equal(isVehiclePurchasableAgain("sold"), false);
});
