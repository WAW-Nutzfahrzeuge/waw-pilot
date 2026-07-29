"use server";

import { updateVehicleAction } from "@/app/dashboard/vehicles/[vehicleId]/edit/actions";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

export async function updatePurchaseVehicleAction(formData: FormData) {
    const vehicleId = getStringValue(formData, "vehicle_id");

    if (!vehicleId) {
        throw new Error("Fahrzeug fehlt.");
    }

    const result = await updateVehicleAction(
        vehicleId,
        { success: false, message: "" },
        formData,
    );

    if (!result.success) {
        throw new Error(result.message || "Fahrzeug konnte nicht gespeichert werden.");
    }
}
