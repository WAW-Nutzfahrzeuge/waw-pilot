"use server";

import { redirect } from "next/navigation";

import { getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import {
    getBzstVerificationTooLargeMessage,
    getDocumentUploadFailedMessage,
    getDocumentTooLargeMessage,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
    maxBzstVerificationFileSizeBytes,
    maxDocumentFileSizeBytes,
} from "@/lib/documents/upload-validation";
import {
    cleanupPrivateDocumentFile,
    getRequiredFileFromFormData,
    uploadPrivateDocumentFile,
} from "@/lib/documents/private-document-upload";
import { logActivity } from "@/lib/activity/activity-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SaleUploadQueryResult = {
    id: string;
    vehicle_id: string;
    buyer_customer_id: string;
    customers:
        | {
            type: "company" | "private";
            company_name: string | null;
            first_name: string | null;
            last_name: string | null;
            vat_id: string | null;
        }
        | {
            type: "company" | "private";
            company_name: string | null;
            first_name: string | null;
            last_name: string | null;
            vat_id: string | null;
        }[]
        | null;
};

type ExistingDocumentQueryResult = {
    id: string;
    file_path: string | null;
};

type SaleDocumentDeleteQueryResult = {
    id: string;
    sale_id: string | null;
    file_path: string | null;
    source: string;
    generated_by_system: boolean | null;
};

function isBzstVerificationDocument(documentType: string): boolean {
    return (
        documentType === "bzst_vat_verification_primary" ||
        documentType === "bzst_vat_verification_secondary"
    );
}

function getSingleRelation<T>(relation: T | T[] | null): T | null {
    if (!relation) return null;

    return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function getCustomerName(
    customer: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null,
): string | null {
    if (!customer) return null;
    if (customer.type === "company") return customer.company_name;

    return [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
}

export async function uploadSaleDocumentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringFormValue(formData, "sale_id");
    const documentType = getStringFormValue(formData, "document_type");
    const documentLabel = getStringFormValue(formData, "document_label") ?? documentType;
    const existingDocumentId = getStringFormValue(formData, "existing_document_id");
    const fileValue = getRequiredFileFromFormData(formData);

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!documentType) {
        throw new Error("Dokumenttyp fehlt.");
    }

    if (!fileValue) {
        throw new Error("Bitte wähle eine Datei aus.");
    }

    if (!isAllowedDocumentFile(fileValue)) {
        throw new Error(getUnsupportedDocumentTypeMessage());
    }

    const maxFileSize = isBzstVerificationDocument(documentType)
        ? maxBzstVerificationFileSizeBytes
        : maxDocumentFileSizeBytes;

    if (fileValue.size > maxFileSize) {
        throw new Error(
            isBzstVerificationDocument(documentType)
                ? getBzstVerificationTooLargeMessage()
                : getDocumentTooLargeMessage(),
        );
    }

    const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select(
            `
            id,
            vehicle_id,
            buyer_customer_id,
            customers:buyer_customer_id (
                type,
                company_name,
                first_name,
                last_name,
                vat_id
            )
        `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (saleError || !saleData) {
        throw new Error(
            `Verkauf konnte nicht geladen werden: ${
                saleError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const sale = saleData as SaleUploadQueryResult;
    const customer = getSingleRelation(sale.customers);
    const metadata = isBzstVerificationDocument(documentType)
        ? {
            source: "MANUAL_BZST_CHECK",
            saleId: sale.id,
            buyerId: sale.buyer_customer_id,
            vatNumberSnapshot: customer?.vat_id ?? null,
            buyerNameSnapshot: getCustomerName(customer),
            verificationSlot:
                documentType === "bzst_vat_verification_primary"
                    ? "PRIMARY"
                    : "SECONDARY",
            uploadedAt: new Date().toISOString(),
            reviewStatus: "REVIEW_REQUIRED",
        }
        : {};

    let existingDocument: ExistingDocumentQueryResult | null = null;

    if (existingDocumentId) {
        const { data: existingDocumentData, error: existingDocumentError } =
            await supabase
                .from("documents")
                .select("id, file_path")
                .eq("id", existingDocumentId)
                .eq("company_id", companyId)
                .eq("sale_id", saleId)
                .single();

        if (existingDocumentError || !existingDocumentData) {
            throw new Error(
                `Bestehendes Dokument konnte nicht geladen werden: ${
                    existingDocumentError?.message ?? "Nicht gefunden"
                }`,
            );
        }

        existingDocument = existingDocumentData as ExistingDocumentQueryResult;
    }

    const uploadResult = await uploadPrivateDocumentFile({
        supabase,
        file: fileValue,
        directory: `sales/${saleId}`,
        documentType,
    });

    if (!uploadResult.success) {
        console.error("[upload] storage upload failed", uploadResult.error);
        throw new Error(getDocumentUploadFailedMessage(uploadResult.error));
    }

    const { originalFileName, filePath, mimeType, fileSize } =
        uploadResult.uploadedFile;
    const displayFileName = documentLabel
        ? `${documentLabel} - ${originalFileName}`
        : originalFileName;

    if (existingDocument) {
        const { error: documentUpdateError } = await supabase
            .from("documents")
            .update({
                source: "uploaded",
                status: "available",
                file_name: displayFileName,
                file_path: filePath,
                mime_type: mimeType,
                file_size: fileSize,
                customer_id: sale.buyer_customer_id,
                vehicle_id: sale.vehicle_id,
                sale_id: sale.id,
                generated_by_system: false,
                metadata,
            })
            .eq("id", existingDocument.id)
            .eq("company_id", companyId);

        if (documentUpdateError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });

            console.error("[upload] document update failed", documentUpdateError);
            throw new Error(
                "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            );
        }

        await logActivity({
            action: isBzstVerificationDocument(documentType)
                ? `${documentLabel} wurde ersetzt.`
                : `${documentLabel} wurde ersetzt.`,
            entityType: "document",
            entityId: existingDocument.id,
        });
    } else {
        const { error: documentError } = await supabase.from("documents").insert({
            company_id: companyId,
            document_type: documentType,
            source: "uploaded",
            status: "available",
            file_name: displayFileName,
            file_path: filePath,
            mime_type: mimeType,
            file_size: fileSize,
            customer_id: sale.buyer_customer_id,
            vehicle_id: sale.vehicle_id,
            sale_id: sale.id,
            invoice_id: null,
            generated_by_system: false,
            metadata,
        });

        if (documentError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });

            console.error("[upload] document insert failed", documentError);
            throw new Error(
                "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            );
        }

        if (isBzstVerificationDocument(documentType)) {
            await logActivity({
                action: `${documentLabel} wurde hochgeladen.`,
                entityType: "sale",
                entityId: sale.id,
            });
        }
    }

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/documents",
    ]);

    redirect(`/dashboard/sales/${saleId}?documentUploaded=1&refresh=${Date.now()}`);
}

export async function deleteSaleDocumentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringFormValue(formData, "sale_id");
    const documentId = getStringFormValue(formData, "document_id");

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!documentId) {
        throw new Error("Dokument fehlt.");
    }

    const { data: documentData, error: documentError } = await supabase
        .from("documents")
        .select("id, sale_id, file_path, source, generated_by_system")
        .eq("id", documentId)
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .single();

    if (documentError || !documentData) {
        throw new Error(
            `Dokument konnte nicht geladen werden: ${
                documentError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const document = documentData as SaleDocumentDeleteQueryResult;

    if (document.source !== "uploaded" || document.generated_by_system) {
        throw new Error(
            "Dieses Dokument wurde vom System erzeugt und kann hier nicht gelöscht werden.",
        );
    }

    const { error: documentUpdateError } = await supabase
        .from("documents")
        .update({
            status: "missing",
            file_path: null,
            mime_type: null,
            file_size: null,
            file_name: "Gelöschtes Dokument",
            generated_by_system: false,
        })
        .eq("id", document.id)
        .eq("company_id", companyId)
        .eq("sale_id", saleId);

    if (documentUpdateError) {
        throw new Error(
            `Dokumentstatus konnte nicht aktualisiert werden: ${documentUpdateError.message}`,
        );
    }

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/documents",
    ]);

    redirect(`/dashboard/sales/${saleId}?documentDeleted=1`);
}
