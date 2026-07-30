"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { generateAndStoreLicensePlateConsentDocument } from "@/lib/pdf/generated-documents/license-plate-generated-document-storage";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

export async function generateLicensePlateConsentAction(formData: FormData) {
    const plateCaseId = getStringValue(formData, "plate_case_id");

    if (!plateCaseId) {
        throw new Error("Kennzeichen-Vorgang fehlt.");
    }

    await generateAndStoreLicensePlateConsentDocument({
        plateCaseId,
    });

    revalidatePaths([
        `/dashboard/plates/${plateCaseId}`,
        "/dashboard/plates",
        "/dashboard/documents",
        "/dashboard/checks",
    ]);

    redirect(
        `/dashboard/plates/${plateCaseId}?generatedDocument=license_plate_consent#license-plate-documents`,
    );
}
