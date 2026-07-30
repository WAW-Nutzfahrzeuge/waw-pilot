"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import type { LicensePlateType } from "@/lib/license-plates/license-plate-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UpdateLicensePlateCaseState = {
    success: boolean;
    message: string;
};

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getNumberValue(formData: FormData, key: string): number | null {
    const value = getStringValue(formData, key);

    if (!value) return null;

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function getPlateTypeValue(formData: FormData): LicensePlateType {
    const value = getStringValue(formData, "plate_type");

    if (value === "export" || value === "customs" || value === "short_term") {
        return value;
    }

    return "short_term";
}

function addDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);

    return date.toISOString().slice(0, 10);
}

export async function updateLicensePlateCaseAction(
    _previousState: UpdateLicensePlateCaseState,
    formData: FormData,
): Promise<UpdateLicensePlateCaseState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const plateCaseId = getStringValue(formData, "plate_case_id");
    const plateType = getPlateTypeValue(formData);
    const durationDays = getNumberValue(formData, "duration_days");
    const vehicleId = getStringValue(formData, "vehicle_id");
    const customerId = getStringValue(formData, "customer_id");
    const saleId = getStringValue(formData, "sale_id");
    const requestedAt = getStringValue(formData, "requested_at");
    const validFrom = getStringValue(formData, "valid_from");
    const licensePlateNumber = getStringValue(formData, "license_plate_number");
    const registrationOffice = getStringValue(formData, "registration_office");
    const notes = getStringValue(formData, "notes");

    if (!plateCaseId) {
        return {
            success: false,
            message: "Kennzeichen-Vorgang fehlt.",
        };
    }

    if (!vehicleId) {
        return {
            success: false,
            message: "Bitte wähle ein Fahrzeug aus.",
        };
    }

    if (!customerId) {
        return {
            success: false,
            message: "Bitte wähle einen Kunden aus.",
        };
    }

    if (!requestedAt) {
        return {
            success: false,
            message: "Bitte wähle ein Antragsdatum aus.",
        };
    }

    if (plateType === "short_term") {
        if (!durationDays || ![3, 5, 6].includes(durationDays)) {
            return {
                success: false,
                message: "Bitte wähle für Kurzzeitkennzeichen 3, 5 oder 6 Tage aus.",
            };
        }
    }

    const validUntil =
        validFrom && durationDays && plateType === "short_term"
            ? addDays(validFrom, durationDays - 1)
            : null;

    const { error } = await supabase
        .from("license_plate_cases")
        .update({
            vehicle_id: vehicleId,
            customer_id: customerId,
            sale_id: saleId,
            plate_type: plateType,
            duration_days: plateType === "short_term" ? durationDays : null,
            requested_at: requestedAt,
            valid_from: validFrom,
            valid_until: validUntil,
            license_plate_number: licensePlateNumber,
            registration_office: registrationOffice,
            notes,
            updated_at: new Date().toISOString(),
        })
        .eq("id", plateCaseId)
        .eq("company_id", companyId);

    if (error) {
        return {
            success: false,
            message: `Kennzeichen-Vorgang konnte nicht aktualisiert werden: ${error.message}`,
        };
    }

    revalidatePaths([`/dashboard/plates/${plateCaseId}`, "/dashboard/plates"]);

    redirect(`/dashboard/plates/${plateCaseId}`);
}
