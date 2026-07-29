"use server";

import { redirect } from "next/navigation";

import { getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import {
    getDocumentUploadFailedMessage,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
} from "@/lib/documents/upload-validation";
import {
    cleanupPrivateDocumentFile,
    getRequiredFileFromFormData,
    uploadPrivateDocumentFile,
} from "@/lib/documents/private-document-upload";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UploadLicensePlateDocumentState = {
    success: boolean;
    message: string;
};

function isAllowedDocumentType(documentType: string): boolean {
    return [
        "license_plate_document",
        "license_plate_insurance",
        "license_plate_power_of_attorney",
        "license_plate_registration",
    ].includes(documentType);
}

export async function uploadLicensePlateDocumentAction(
    _previousState: UploadLicensePlateDocumentState,
    formData: FormData,
): Promise<UploadLicensePlateDocumentState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const plateCaseId = getStringFormValue(formData, "plate_case_id");
    const documentType = getStringFormValue(formData, "document_type");
    const existingDocumentId = getStringFormValue(formData, "existing_document_id");
    const fileValue = getRequiredFileFromFormData(formData);

    if (!plateCaseId) {
        return {
            success: false,
            message: "Kennzeichen-Vorgang fehlt.",
        };
    }

    if (!documentType || !isAllowedDocumentType(documentType)) {
        return {
            success: false,
            message: "Ungültiger Dokumenttyp.",
        };
    }

    if (!fileValue) {
        return {
            success: false,
            message: "Bitte wähle eine Datei aus.",
        };
    }

    if (!isAllowedDocumentFile(fileValue)) {
        return {
            success: false,
            message: getUnsupportedDocumentTypeMessage(),
        };
    }

    const { data: plateCase, error: plateCaseError } = await supabase
        .from("license_plate_cases")
        .select("id, vehicle_id, customer_id, sale_id")
        .eq("id", plateCaseId)
        .eq("company_id", companyId)
        .single();

    if (plateCaseError || !plateCase) {
        return {
            success: false,
            message: `Kennzeichen-Vorgang konnte nicht geladen werden: ${
                plateCaseError?.message ?? "Nicht gefunden"
            }`,
        };
    }

    let oldFilePath: string | null = null;

    if (existingDocumentId) {
        const { data: existingDocument } = await supabase
            .from("documents")
            .select("file_path")
            .eq("id", existingDocumentId)
            .eq("company_id", companyId)
            .maybeSingle();

        oldFilePath = existingDocument?.file_path ?? null;
    }

    const uploadResult = await uploadPrivateDocumentFile({
        supabase,
        file: fileValue,
        directory: `license-plates/${plateCaseId}`,
        documentType,
    });

    if (!uploadResult.success) {
        console.error(
            "[upload] license plate document storage upload failed",
            uploadResult.error,
        );
        return {
            success: false,
            message: getDocumentUploadFailedMessage(uploadResult.error),
        };
    }

    const { originalFileName, filePath, mimeType, fileSize } =
        uploadResult.uploadedFile;

    if (existingDocumentId) {
        const { error: updateError } = await supabase
            .from("documents")
            .update({
                document_type: documentType,
                source: "uploaded",
                status: "available",
                file_name: originalFileName,
                file_path: filePath,
                mime_type: mimeType,
                file_size: fileSize,
                customer_id: plateCase.customer_id,
                vehicle_id: plateCase.vehicle_id,
                sale_id: plateCase.sale_id,
                invoice_id: null,
                license_plate_case_id: plateCaseId,
                generated_by_system: false,
            })
            .eq("id", existingDocumentId)
            .eq("company_id", companyId);

        if (updateError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });
            console.error("[upload] license plate document update failed", updateError);

            return {
                success: false,
                message:
                    "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            };
        }

        if (oldFilePath && oldFilePath !== filePath) {
            await cleanupPrivateDocumentFile({ supabase, filePath: oldFilePath });
        }
    } else {
        const { error: insertError } = await supabase.from("documents").insert({
            company_id: companyId,
            document_type: documentType,
            source: "uploaded",
            status: "available",
            file_name: originalFileName,
            file_path: filePath,
            mime_type: mimeType,
            file_size: fileSize,
            customer_id: plateCase.customer_id,
            vehicle_id: plateCase.vehicle_id,
            sale_id: plateCase.sale_id,
            invoice_id: null,
            license_plate_case_id: plateCaseId,
            generated_by_system: false,
        });

        if (insertError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });
            console.error("[upload] license plate document insert failed", insertError);

            return {
                success: false,
                message:
                    "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            };
        }
    }

    revalidatePaths([
        `/dashboard/plates/${plateCaseId}`,
        "/dashboard/plates",
        "/dashboard/documents",
    ]);

    redirect(`/dashboard/plates/${plateCaseId}`);
}
