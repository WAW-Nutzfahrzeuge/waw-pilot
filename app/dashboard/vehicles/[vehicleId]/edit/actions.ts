"use server";

import { redirect } from "next/navigation";

import { getDecimalFormValue, getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { logActivity } from "@/lib/activity/activity-log";
import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getDuplicateVinMessage,
    translateVehicleDatabaseError,
} from "@/lib/vehicles/vehicle-save-errors";

export type UpdateVehicleState = {
    success: boolean;
    message: string;
};

type VehicleStatus = "in_stock" | "reserved" | "sold";

function getStatusValue(formData: FormData): VehicleStatus {
    const value = getStringFormValue(formData, "status");

    if (value === "in_stock" || value === "reserved" || value === "sold") {
        return value;
    }

    return "in_stock";
}

function getSafeDashboardRedirectPath(value: string | null, fallback: string): string {
    if (!value) return fallback;
    if (!value.startsWith("/dashboard/") || value.startsWith("//") || value.includes("://")) {
        return fallback;
    }

    return value;
}

function getVehicleActivityName(vehicle: {
    internal_number: string | null;
    manufacturer: string | null;
    model: string | null;
}): string {
    const name = [vehicle.manufacturer, vehicle.model]
        .filter(Boolean)
        .join(" ")
        .trim();

    return name || "unbekanntes Fahrzeug";
}

export async function updateVehicleAction(
    vehicleId: string,
    _previousState: UpdateVehicleState,
    formData: FormData,
): Promise<UpdateVehicleState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const manufacturer = getStringFormValue(formData, "manufacturer");
    const model = getStringFormValue(formData, "model");
    const vehicleType = getStringFormValue(formData, "vehicle_type");
    const constructionYear = getDecimalFormValue(formData, "construction_year");
    const vin = getStringFormValue(formData, "vin");
    const licensePlate = getStringFormValue(formData, "license_plate");
    const purchasePriceNet = getDecimalFormValue(formData, "purchase_price_net");
    const additionalCostsNet = getDecimalFormValue(formData, "additional_costs_net") ?? 0;
    const status = getStatusValue(formData);
    const notes = getStringFormValue(formData, "notes");
    const damageNotes = getStringFormValue(formData, "damage_notes");
    const redirectTo = getSafeDashboardRedirectPath(
        getStringFormValue(formData, "redirect_to"),
        `/dashboard/vehicles/${vehicleId}?vehicleSaved=1`,
    );

    if (!vehicleId) {
        return {
            success: false,
            message: "Fahrzeug-ID fehlt.",
        };
    }

    if (!manufacturer) {
        return {
            success: false,
            message: "Bitte gib einen Hersteller ein.",
        };
    }

    if (!model) {
        return {
            success: false,
            message: "Bitte gib ein Modell ein.",
        };
    }

    if (!vehicleType) {
        return {
            success: false,
            message: "Bitte gib einen Fahrzeugtyp ein.",
        };
    }

    if (!vin) {
        return {
            success: false,
            message: "Bitte gib eine Fahrgestellnummer ein.",
        };
    }

    if (purchasePriceNet === null || purchasePriceNet < 0) {
        return {
            success: false,
            message: "Bitte gib einen gültigen Einkaufspreis netto ein.",
        };
    }

    if (additionalCostsNet < 0) {
        return {
            success: false,
            message: "Bitte prüfe die Preisangaben.",
        };
    }

    const { data: existingVehicle, error: loadError } = await supabase
        .from("vehicles")
        .select("id, internal_number, manufacturer, model")
        .eq("id", vehicleId)
        .eq("company_id", companyId)
        .single();

    if (loadError || !existingVehicle) {
        return {
            success: false,
            message: `Fahrzeug konnte nicht geladen werden: ${
                loadError?.message ?? "Nicht gefunden"
            }`,
        };
    }

    const { data: duplicateVinVehicle, error: duplicateVinError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("vin", vin)
        .neq("id", vehicleId)
        .limit(1);

    if (duplicateVinError) {
        console.error("VIN duplicate check failed", duplicateVinError);
    }

    if (duplicateVinVehicle && duplicateVinVehicle.length > 0) {
        return {
            success: false,
            message: getDuplicateVinMessage(),
        };
    }

    const { error: updateError } = await supabase
        .from("vehicles")
        .update({
            manufacturer,
            model,
            vehicle_type: vehicleType,
            construction_year: constructionYear,
            vin,
            license_plate: licensePlate,
            purchase_price_net: purchasePriceNet,
            additional_costs_net: additionalCostsNet,
            status,
            notes,
            damage_notes: damageNotes,
            show_damage_on_invoice: false,
        })
        .eq("id", vehicleId)
        .eq("company_id", companyId);

    if (updateError) {
        console.error("Vehicle update failed", updateError);

        return {
            success: false,
            message: translateVehicleDatabaseError(updateError),
        };
    }

    await logActivity({
        action: `Fahrzeug ${getVehicleActivityName(existingVehicle)} bearbeitet`,
        entityType: "vehicle",
        entityId: vehicleId,
    });

    revalidatePaths([
        "/dashboard",
        "/dashboard/vehicles",
        "/dashboard/vehicles/bestandsliste",
        "/dashboard/ankauf",
        `/dashboard/vehicles/${vehicleId}`,
        `/dashboard/vehicles/${vehicleId}/edit`,
        "/dashboard/activities",
    ]);

    redirect(redirectTo);
}
