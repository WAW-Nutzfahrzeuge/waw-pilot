import type { SupabaseClient } from "@supabase/supabase-js";

import {
    getBzstVerificationTooLargeMessage,
    getDocumentUploadFailedMessage,
    getUnsupportedImageAssetTypeMessage,
    isAllowedImageAssetFile,
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
        if (!isAllowedImageAssetFile(file)) {
            return `${label}: ${getUnsupportedImageAssetTypeMessage()}`;
        }

        if (file.size > maxBzstVerificationFileSizeBytes) {
            return `${label}: ${getBzstVerificationTooLargeMessage()}`;
        }
    }

    return null;
}

export async function uploadCustomerBzstEvidenceDocuments({
    supabase,
    companyId,
    customerId,
    formData,
}: UploadCustomerBzstEvidenceParams): Promise<{ success: true } | { success: false; message: string }> {
    const submittedFiles = getSubmittedEvidenceFiles(formData);

    for (const { file, documentType, label } of submittedFiles) {
        const originalFileName = sanitizeFileName(file.name) || `${label}.png`;
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

        const { error: documentError } = await supabase.from("documents").insert({
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
        });

        if (documentError) {
            await supabase.storage.from("documents").remove([filePath]);

            return {
                success: false,
                message: `${label} konnte nicht beim Kunden gespeichert werden.`,
            };
        }
    }

    return { success: true };
}
