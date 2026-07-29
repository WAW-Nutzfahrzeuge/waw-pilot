"use server";

import { redirect } from "next/navigation";

import { getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import {
    getDocumentTooLargeMessage,
    getDocumentUploadFailedMessage,
    getUnsupportedVehicleDocumentTypeMessage,
    isAllowedVehicleDocumentFile,
    maxDocumentFileSizeBytes,
} from "@/lib/documents/upload-validation";
import {
    cleanupPrivateDocumentFile,
    getRequiredFileFromFormData,
    uploadPrivateDocumentFile,
} from "@/lib/documents/private-document-upload";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VehicleDocumentType = "vehicle_registration" | "purchase_invoice";

type ExistingVehicleDocument = {
    id: string;
    file_path: string | null;
};

function getVehicleDocumentType(value: string | null): VehicleDocumentType | null {
    if (value === "vehicle_registration" || value === "purchase_invoice") {
        return value;
    }

    return null;
}

function getVehicleDocumentLabel(documentType: VehicleDocumentType): string {
    return documentType === "vehicle_registration"
        ? "Fahrzeugschein"
        : "Einkaufsrechnung";
}

async function getLatestVehicleDocument({
                                           vehicleId,
                                           documentType,
                                       }: {
    vehicleId: string;
    documentType: VehicleDocumentType;
}): Promise<ExistingVehicleDocument | null> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .eq("document_type", documentType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    return (data as ExistingVehicleDocument | null) ?? null;
}

export async function uploadVehicleDocumentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const vehicleId = getStringFormValue(formData, "vehicle_id");
    const documentType = getVehicleDocumentType(
        getStringFormValue(formData, "document_type"),
    );
    const fileValue = getRequiredFileFromFormData(formData);

    if (!vehicleId) {
        throw new Error("Fahrzeug fehlt.");
    }

    if (!documentType) {
        throw new Error("Ungültiger Dokumenttyp.");
    }

    if (!fileValue) {
        throw new Error("Bitte wähle eine Datei aus.");
    }

    if (!isAllowedVehicleDocumentFile(fileValue)) {
        throw new Error(getUnsupportedVehicleDocumentTypeMessage());
    }

    if (fileValue.size > maxDocumentFileSizeBytes) {
        throw new Error(getDocumentTooLargeMessage());
    }

    const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, seller_customer_id")
        .eq("id", vehicleId)
        .eq("company_id", companyId)
        .single();

    if (vehicleError || !vehicle) {
        throw new Error(
            `Fahrzeug konnte nicht geladen werden: ${
                vehicleError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const existingDocument = await getLatestVehicleDocument({
        vehicleId,
        documentType,
    });

    const uploadResult = await uploadPrivateDocumentFile({
        supabase,
        file: fileValue,
        directory: `vehicles/${vehicleId}`,
        documentType,
    });

    if (!uploadResult.success) {
        console.error("[upload] vehicle document storage upload failed", uploadResult.error);
        throw new Error(getDocumentUploadFailedMessage(uploadResult.error));
    }

    const { originalFileName, filePath, mimeType, fileSize } =
        uploadResult.uploadedFile;

    const documentPayload = {
        document_type: documentType,
        source: "uploaded",
        status: "available",
        file_name: originalFileName || getVehicleDocumentLabel(documentType),
        file_path: filePath,
        mime_type: mimeType,
        file_size: fileSize,
        customer_id:
            documentType === "purchase_invoice"
                ? (vehicle.seller_customer_id as string | null)
                : null,
        vehicle_id: vehicleId,
        sale_id: null,
        invoice_id: null,
        generated_by_system: false,
    };

    if (existingDocument) {
        const { error: updateError } = await supabase
            .from("documents")
            .update(documentPayload)
            .eq("id", existingDocument.id)
            .eq("company_id", companyId);

        if (updateError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });
            console.error("[upload] vehicle document update failed", updateError);
            throw new Error(
                "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            );
        }

        if (existingDocument.file_path && existingDocument.file_path !== filePath) {
            await cleanupPrivateDocumentFile({
                supabase,
                filePath: existingDocument.file_path,
            });
        }
    } else {
        const { error: insertError } = await supabase.from("documents").insert({
            company_id: companyId,
            ...documentPayload,
        });

        if (insertError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });
            console.error("[upload] vehicle document insert failed", insertError);
            throw new Error(
                "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            );
        }
    }

    await logActivity({
        action: `${getVehicleDocumentLabel(documentType)} für Fahrzeug hochgeladen`,
        entityType: "document",
        entityId: vehicleId,
    });

    revalidatePaths([
        `/dashboard/vehicles/${vehicleId}`,
        `/dashboard/vehicles/${vehicleId}/edit`,
        "/dashboard/vehicles",
        "/dashboard/documents",
    ]);

    redirect(`/dashboard/vehicles/${vehicleId}?vehicleDocumentUploaded=1`);
}

export async function deleteVehicleDocumentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const vehicleId = getStringFormValue(formData, "vehicle_id");
    const documentId = getStringFormValue(formData, "document_id");

    if (!vehicleId) {
        throw new Error("Fahrzeug fehlt.");
    }

    if (!documentId) {
        throw new Error("Dokument fehlt.");
    }

    const { data: document, error: documentError } = await supabase
        .from("documents")
        .select("id, file_path, source, generated_by_system")
        .eq("id", documentId)
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .single();

    if (documentError || !document) {
        throw new Error(
            `Dokument konnte nicht geladen werden: ${
                documentError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    if (document.source !== "uploaded" || document.generated_by_system) {
        throw new Error(
            "Dieses Dokument wurde vom System erzeugt und kann hier nicht gelöscht werden.",
        );
    }

    if (document.file_path) {
        await cleanupPrivateDocumentFile({ supabase, filePath: document.file_path });
    }

    const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", document.id)
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId);

    if (deleteError) {
        throw new Error(
            `Dokument wurde aus dem Storage entfernt, aber der Datenbankeintrag konnte nicht entfernt werden: ${deleteError.message}`,
        );
    }

    revalidatePaths([
        `/dashboard/vehicles/${vehicleId}`,
        `/dashboard/vehicles/${vehicleId}/edit`,
        "/dashboard/vehicles",
        "/dashboard/documents",
    ]);

    redirect(`/dashboard/vehicles/${vehicleId}?vehicleDocumentDeleted=1`);
}
