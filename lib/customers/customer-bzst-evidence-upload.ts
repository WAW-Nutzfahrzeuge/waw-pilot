import type { SupabaseClient } from "@supabase/supabase-js";

import {
    getBzstVerificationTooLargeMessage,
    getDocumentUploadFailedMessage,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
    maxBzstVerificationFileSizeBytes,
} from "@/lib/documents/upload-validation";

type UploadCustomerBzstEvidenceParams = {
    supabase: SupabaseClient;
    companyId: string;
    customerId: string;
    formData: FormData;
};

type EvidenceSlot = {
    inputName: string;
    documentType: "bzst_vat_verification_primary" | "bzst_vat_verification_secondary";
    label: string;
};

const evidenceSlots: EvidenceSlot[] = [
    {
        inputName: "bzst_evidence_1",
        documentType: "bzst_vat_verification_primary",
        label: "Beweisbild 1",
    },
    {
        inputName: "bzst_evidence_2",
        documentType: "bzst_vat_verification_secondary",
        label: "Beweisbild 2",
    },
];

function getSubmittedEvidenceFiles(formData: FormData) {
    return evidenceSlots
        .map((slot) => {
            const value = formData.get(slot.inputName);

            return value instanceof File && value.size > 0
                ? { ...slot, file: value }
                : null;
        })
        .filter((item): item is EvidenceSlot & { file: File } => Boolean(item));
}

function sanitizeFileName(fileName: string): string {
    return fileName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9.\-_]/g, "");
}

function getFileExtension(fileName: string): string {
    const extension = fileName.split(".").pop()?.toLowerCase();

    return extension ? `.${extension}` : "";
}

export function validateCustomerBzstEvidenceFiles(formData: FormData): string | null {
    for (const { file, label } of getSubmittedEvidenceFiles(formData)) {
        if (!isAllowedDocumentFile(file)) {
            return `${label}: ${getUnsupportedDocumentTypeMessage()}`;
        }

        if (file.size > maxBzstVerificationFileSizeBytes) {
            return `${label}: ${getBzstVerificationTooLargeMessage()}`;
        }
    }

    return null;
}

type BzstEvidenceUploadResult =
    | { success: true; documentId: string; filePath: string }
    | { success: false; message: string; filePath?: string };

async function uploadSingleCustomerBzstEvidenceDocument({
    supabase,
    companyId,
    customerId,
    documentType,
    label,
    file,
}: {
    supabase: SupabaseClient;
    companyId: string;
    customerId: string;
    documentType: EvidenceSlot["documentType"];
    label: string;
    file: File;
}): Promise<BzstEvidenceUploadResult> {
    const fallbackExtension = file.type === "application/pdf" ? "pdf" : "png";
    const originalFileName =
        sanitizeFileName(file.name) || `${label}.${fallbackExtension}`;
    const filePath = `customers/${customerId}/${documentType}-${Date.now()}${getFileExtension(originalFileName)}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        return {
            success: false,
            message: `${label}: ${getDocumentUploadFailedMessage(uploadError)}`,
        };
    }

    const { data: document, error: documentError } = await supabase
        .from("documents")
        .insert({
            company_id: companyId,
            document_type: documentType,
            source: "uploaded",
            status: "available",
            file_name: originalFileName,
            file_path: filePath,
            mime_type: file.type || null,
            file_size: file.size,
            customer_id: customerId,
            vehicle_id: null,
            sale_id: null,
            invoice_id: null,
            generated_by_system: false,
        })
        .select("id")
        .single();

    if (documentError || !document) {
        return {
            success: false,
            message: `${label} konnte nicht beim Kunden gespeichert werden.`,
            filePath,
        };
    }

    return { success: true, documentId: document.id as string, filePath };
}

export async function uploadCustomerBzstEvidenceDocuments({
    supabase,
    companyId,
    customerId,
    formData,
}: UploadCustomerBzstEvidenceParams): Promise<{ success: true } | { success: false; message: string }> {
    const submittedFiles = getSubmittedEvidenceFiles(formData);

    if (submittedFiles.length === 0) {
        return { success: true };
    }

    // Die beiden Beweisbild-Slots sind fachlich unabhängig voneinander
    // (jeweils eigener Upload + eigener documents-Insert), daher parallel
    // statt nacheinander ausführen (gleiches Muster wie beim Ankauf-Flow).
    const uploadResults = await Promise.all(
        submittedFiles.map(({ file, documentType, label }) =>
            uploadSingleCustomerBzstEvidenceDocument({
                supabase,
                companyId,
                customerId,
                documentType,
                label,
                file,
            }),
        ),
    );

    const failedResult = uploadResults.find(
        (result): result is { success: false; message: string; filePath?: string } =>
            !result.success,
    );

    if (failedResult) {
        const successfulResults = uploadResults.filter(
            (result): result is { success: true; documentId: string; filePath: string } =>
                result.success,
        );
        const createdDocumentIds = successfulResults.map((result) => result.documentId);
        const uploadedFilePaths = successfulResults.map((result) => result.filePath);

        // Der fehlgeschlagene Slot kann ebenfalls bereits eine Storage-Datei
        // angelegt haben (z. B. wenn nur der documents-Insert fehlschlug).
        if (failedResult.filePath) {
            uploadedFilePaths.push(failedResult.filePath);
        }

        if (createdDocumentIds.length > 0) {
            await supabase
                .from("documents")
                .delete()
                .eq("company_id", companyId)
                .in("id", createdDocumentIds);
        }

        if (uploadedFilePaths.length > 0) {
            await supabase.storage.from("documents").remove(uploadedFilePaths);
        }

        return { success: false, message: failedResult.message };
    }

    return { success: true };
}
