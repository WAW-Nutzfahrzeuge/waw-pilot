"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { logActivity } from "@/lib/activity/activity-log";
import {
    isSupportedSaleGeneratedDocumentType,
    type GeneratedDocumentType,
} from "@/lib/pdf/generated-documents/document-types";
import { generateAndStoreSaleGeneratedDocument } from "@/lib/pdf/generated-documents/sale-generated-document-storage";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getGeneratedDocumentType(
    value: string | null,
): GeneratedDocumentType | null {
    if (
        value === "handover_protocol" ||
        value === "entry_certificate" ||
        value === "transport_proof"
    ) {
        return value;
    }

    return null;
}

function getGeneratedDocumentActivityLabel(
    documentType: GeneratedDocumentType,
): string {
    const labels: Partial<Record<GeneratedDocumentType, string>> = {
        handover_protocol: "Übergabeprotokoll",
        entry_certificate: "Gelangensbestätigung",
        transport_proof: "Verbringungsnachweis",
    };

    return labels[documentType] ?? documentType;
}

export async function generateSaleDocumentAction(formData: FormData) {
    const saleId = getStringValue(formData, "sale_id");
    const documentType = getGeneratedDocumentType(
        getStringValue(formData, "document_type"),
    );
    const documentDateOverride = getStringValue(formData, "document_date");

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!documentType) {
        throw new Error("Dokumenttyp fehlt oder wird nicht unterstützt.");
    }

    if (!isSupportedSaleGeneratedDocumentType(documentType)) {
        throw new Error("Dieser Dokumenttyp wird in der Verkaufsakte nicht erzeugt.");
    }

    const generatedDocument = await generateAndStoreSaleGeneratedDocument({
        saleId,
        documentType,
        includeSignatureStamp: false,
        documentDateOverride,
    });

    await logActivity({
        action: `${getGeneratedDocumentActivityLabel(
            documentType,
        )} für Verkauf erzeugt`,
        entityType: "document",
        entityId: generatedDocument.documentId,
    });

    revalidatePaths([[`/dashboard/sales/${saleId}`, "page"], "/dashboard/documents"]);

    redirect(
        `/dashboard/sales/${saleId}?generatedDocument=${encodeURIComponent(
            documentType,
        )}&refresh=${Date.now()}#automatic-documents`,
    );
}
