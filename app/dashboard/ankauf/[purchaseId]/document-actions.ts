"use server";

import { redirect } from "next/navigation";

import { getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
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

type UploadPurchaseDocumentState = {
    success: boolean;
    message: string;
};

function isAllowedDocumentType(documentType: string): boolean {
    return [
        "vehicle_registration",
        "purchase_invoice",
        "purchase_contract",
        "purchase_receipt",
        "purchase_payment_proof",
        "seller_id",
        "seller_commercial_register",
    ].includes(documentType);
}

function getPurchaseDocumentLabel(documentType: string): string {
    const labels: Record<string, string> = {
        vehicle_registration: "Fahrzeugschein",
        purchase_invoice: "Einkaufsrechnung",
        purchase_contract: "Ankaufsvertrag",
        purchase_receipt: "Ankaufsbeleg",
        purchase_payment_proof: "Zahlungsnachweis Ankauf",
        seller_id: "Ausweis Verkäufer",
        seller_commercial_register: "Handelsregister Verkäufer",
    };

    return labels[documentType] ?? documentType;
}

export async function uploadPurchaseDocumentAction(
    _previousState: UploadPurchaseDocumentState,
    formData: FormData,
): Promise<UploadPurchaseDocumentState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const purchaseId = getStringFormValue(formData, "purchase_id");
    const documentType = getStringFormValue(formData, "document_type");
    const existingDocumentId = getStringFormValue(formData, "existing_document_id");
    const fileValue = getRequiredFileFromFormData(formData);

    if (!purchaseId) {
        return {
            success: false,
            message: "Ankaufsakte fehlt.",
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

    const { data: purchaseCase, error: purchaseCaseError } = await supabase
        .from("purchase_cases")
        .select("id, vehicle_id, seller_customer_id, purchase_number")
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .single();

    if (purchaseCaseError || !purchaseCase) {
        return {
            success: false,
            message: `Ankaufsakte konnte nicht geladen werden: ${
                purchaseCaseError?.message ?? "Nicht gefunden"
            }`,
        };
    }

    const purchaseNumber = purchaseCase.purchase_number ?? purchaseId;
    const documentLabel = getPurchaseDocumentLabel(documentType);

    let oldFilePath: string | null = null;
    let savedDocumentId: string | null = existingDocumentId ?? null;

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
        directory: `purchases/${purchaseId}`,
        documentType,
    });

    if (!uploadResult.success) {
        console.error(
            "[upload] purchase document storage upload failed",
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
                customer_id: purchaseCase.seller_customer_id,
                vehicle_id: purchaseCase.vehicle_id,
                sale_id: null,
                invoice_id: null,
                purchase_case_id: purchaseId,
                generated_by_system: false,
            })
            .eq("id", existingDocumentId)
            .eq("company_id", companyId);

        if (updateError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });
            console.error("[upload] purchase document update failed", updateError);

            return {
                success: false,
                message:
                    "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            };
        }

        if (oldFilePath && oldFilePath !== filePath) {
            await cleanupPrivateDocumentFile({ supabase, filePath: oldFilePath });
        }

        await logActivity({
            action: `Ankaufsdokument ${documentLabel} für ${purchaseNumber} ersetzt`,
            entityType: "document",
            entityId: existingDocumentId,
        });
    } else {
        const { data: insertedDocument, error: insertError } = await supabase
            .from("documents")
            .insert({
                company_id: companyId,
                document_type: documentType,
                source: "uploaded",
                status: "available",
                file_name: originalFileName,
                file_path: filePath,
                mime_type: mimeType,
                file_size: fileSize,
                customer_id: purchaseCase.seller_customer_id,
                vehicle_id: purchaseCase.vehicle_id,
                sale_id: null,
                invoice_id: null,
                purchase_case_id: purchaseId,
                generated_by_system: false,
            })
            .select("id")
            .single();

        if (insertError || !insertedDocument) {
            await cleanupPrivateDocumentFile({ supabase, filePath });
            console.error("[upload] purchase document insert failed", insertError);

            return {
                success: false,
                message:
                    "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            };
        }

        savedDocumentId = insertedDocument.id as string;

        await logActivity({
            action: `Ankaufsdokument ${documentLabel} für ${purchaseNumber} hochgeladen`,
            entityType: "document",
            entityId: savedDocumentId,
        });
    }

    const { data: purchaseDocuments } = await supabase
        .from("documents")
        .select("document_type, status")
        .eq("company_id", companyId)
        .or(`purchase_case_id.eq.${purchaseId},vehicle_id.eq.${purchaseCase.vehicle_id}`);

    const requiredDocumentTypes = [
        "vehicle_registration",
        "purchase_invoice",
    ];

    const hasAllRequiredDocuments = requiredDocumentTypes.every((requiredType) =>
        (purchaseDocuments ?? []).some(
            (document) =>
                document.document_type === requiredType &&
                document.status === "available",
        ),
    );

    await supabase
        .from("purchase_cases")
        .update({
            document_check_status: hasAllRequiredDocuments
                ? "complete"
                : "missing",
            updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseId)
        .eq("company_id", companyId);

    if (hasAllRequiredDocuments) {
        await logActivity({
            action: `Pflichtdokumente für Ankauf ${purchaseNumber} vollständig`,
            entityType: "purchase",
            entityId: purchaseId,
        });
    }

    revalidatePaths([
        `/dashboard/ankauf/${purchaseId}`,
        "/dashboard/ankauf",
        "/dashboard/documents",
        "/dashboard/checks",
        "/dashboard",
        "/dashboard/activities",
    ]);

    redirect(`/dashboard/ankauf/${purchaseId}`);
}
