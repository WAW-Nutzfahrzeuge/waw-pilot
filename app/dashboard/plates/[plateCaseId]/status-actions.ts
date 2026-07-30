"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import type { LicensePlateStatus } from "@/lib/license-plates/license-plate-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getStatusValue(formData: FormData): LicensePlateStatus {
    const value = getStringValue(formData, "status");

    if (
        value === "open" ||
        value === "requested" ||
        value === "completed" ||
        value === "cancelled"
    ) {
        return value;
    }

    return "open";
}

export async function updateLicensePlateStatusAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const plateCaseId = getStringValue(formData, "plate_case_id");
    const status = getStatusValue(formData);

    if (!plateCaseId) {
        throw new Error("Kennzeichen-Vorgang fehlt.");
    }

    const { error } = await supabase
        .from("license_plate_cases")
        .update({
            status,
            updated_at: new Date().toISOString(),
        })
        .eq("id", plateCaseId)
        .eq("company_id", companyId);

    if (error) {
        throw new Error(
            `Kennzeichen-Status konnte nicht aktualisiert werden: ${error.message}`,
        );
    }

    revalidatePaths([`/dashboard/plates/${plateCaseId}`, "/dashboard/plates"]);

    redirect(`/dashboard/plates/${plateCaseId}`);
}
