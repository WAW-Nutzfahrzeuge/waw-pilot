"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import {
    getBzstVerificationTooLargeMessage,
    getDirectSaleDocumentTooLargeMessage,
    getDocumentUploadFailedMessage,
    getDocumentTooLargeMessage,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
    maxBzstVerificationFileSizeBytes,
    maxDirectSaleDocumentFileSizeBytes,
    maxDocumentFileSizeBytes,
} from "@/lib/documents/upload-validation";
import {
    cleanupPrivateDocumentFile,
    finalizeStagedPrivateDocumentDeletes,
    getRequiredFileFromFormData,
    restoreStagedPrivateDocumentFiles,
    sanitizeDocumentFileName,
    stagePrivateDocumentFilesForDelete,
    uploadPrivateDocumentFile,
} from "@/lib/documents/private-document-upload";
import { logActivity } from "@/lib/activity/activity-log";
import {
    isSaleCustomDocument,
    normalizeSaleCustomDocumentLabel,
    saleCustomDocumentType,
} from "@/lib/sales/sale-custom-documents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { getCurrentUserContext } from "@/lib/auth/current-user";

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
    document_type: string;
};

export type PrepareSaleDocumentUploadInput = {
    saleId: string;
    documentType: string;
    documentLabel: string;
    existingDocumentId?: string | null;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
};

export type PreparedSaleDocumentUpload = {
    bucket: "documents";
    path: string;
    token: string;
};

export type FinalizeSaleDocumentUploadInput = PrepareSaleDocumentUploadInput & {
    path: string;
};

const directSaleUploadPathPattern =
    /^companies\/([0-9a-f-]{36})\/sales\/([0-9a-f-]{36})\/direct\/([a-z0-9_-]+)-([0-9a-f-]{36})(\.[a-z0-9]+)?$/;

function validateDirectSaleUploadInput(input: PrepareSaleDocumentUploadInput): void {
    if (!input.saleId) throw new Error("Verkauf fehlt.");
    if (!input.documentType) throw new Error("Dokumenttyp fehlt.");

    if (isSaleCustomDocument(input.documentType)) {
        const label = normalizeSaleCustomDocumentLabel(input.documentLabel);
        if (!label) {
            throw new Error("Bitte gib eine Dokumentbezeichnung mit maximal 120 Zeichen ein.");
        }
    }

    const fileDescriptor = {
        name: input.originalFileName,
        type: input.mimeType,
    } as File;

    if (!isAllowedDocumentFile(fileDescriptor)) {
        throw new Error(getUnsupportedDocumentTypeMessage());
    }

    const maximumSize = isBzstVerificationDocument(input.documentType)
        ? maxBzstVerificationFileSizeBytes
        : maxDirectSaleDocumentFileSizeBytes;

    if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) {
        throw new Error("Die ausgewählte Datei ist leer oder ungültig.");
    }

    if (input.fileSize > maximumSize) {
        throw new Error(
            isBzstVerificationDocument(input.documentType)
                ? getBzstVerificationTooLargeMessage()
                : getDocumentTooLargeMessage(),
        );
    }
}

async function loadSaleForDocumentUpload({
    saleId,
    companyId,
}: {
    saleId: string;
    companyId: string;
}): Promise<SaleUploadQueryResult> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("sales")
        .select(`
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
        `)
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        throw new Error(`Verkauf konnte nicht geladen werden: ${error?.message ?? "Nicht gefunden"}`);
    }

    return data as SaleUploadQueryResult;
}

export async function prepareSaleDocumentUploadAction(
    input: PrepareSaleDocumentUploadInput,
): Promise<PreparedSaleDocumentUpload> {
    await getCurrentUserContext();
    validateDirectSaleUploadInput(input);

    const companyId = getCurrentCompanyId();
    await loadSaleForDocumentUpload({ saleId: input.saleId, companyId });

    const safeOriginalName = sanitizeDocumentFileName(input.originalFileName);
    const extension = safeOriginalName.includes(".")
        ? `.${safeOriginalName.split(".").pop()}`
        : "";
    const safeDocumentType = input.documentType
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
        .slice(0, 80);
    const path = `companies/${companyId}/sales/${input.saleId}/direct/${safeDocumentType}-${randomUUID()}${extension}`;
    const storageSupabase = createAutomationSupabaseClient();
    const { data, error } = await storageSupabase.storage
        .from("documents")
        .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
        console.error("[upload] signed sale document upload could not be prepared", {
            saleId: input.saleId,
            message: error?.message,
        });
        throw new Error("Dokument-Upload konnte nicht vorbereitet werden. Bitte versuche es erneut.");
    }

    return { bucket: "documents", path, token: data.token };
}

export async function finalizeSaleDocumentUploadAction(
    input: FinalizeSaleDocumentUploadInput,
): Promise<{ success: true }> {
    await getCurrentUserContext();
    validateDirectSaleUploadInput(input);

    const companyId = getCurrentCompanyId();
    const pathMatch = directSaleUploadPathPattern.exec(input.path);
    if (!pathMatch || pathMatch[1] !== companyId || pathMatch[2] !== input.saleId) {
        throw new Error("Der Upload-Pfad ist ungültig.");
    }

    const sale = await loadSaleForDocumentUpload({ saleId: input.saleId, companyId });
    const supabase = createServerSupabaseClient();
    const storageSupabase = createAutomationSupabaseClient();
    const storage = storageSupabase.storage.from("documents");
    const { data: storedFile, error: storedFileError } = await storage.info(input.path);

    if (storedFileError || !storedFile) {
        throw new Error("Die hochgeladene Datei wurde nicht im privaten Speicher gefunden.");
    }

    const storedSize = storedFile.size ?? storedFile.metadata?.size ?? 0;
    const storedMimeType = storedFile.contentType ?? storedFile.metadata?.mimetype ?? input.mimeType;
    const maximumSize = isBzstVerificationDocument(input.documentType)
        ? maxBzstVerificationFileSizeBytes
        : maxDirectSaleDocumentFileSizeBytes;

    if (storedSize <= 0 || storedSize > maximumSize || storedSize !== input.fileSize) {
        await storage.remove([input.path]);
        throw new Error(getDirectSaleDocumentTooLargeMessage());
    }

    if (!isAllowedDocumentFile({ name: input.originalFileName, type: storedMimeType } as File)) {
        await storage.remove([input.path]);
        throw new Error(getUnsupportedDocumentTypeMessage());
    }

    const customDocumentLabel = isSaleCustomDocument(input.documentType)
        ? normalizeSaleCustomDocumentLabel(input.documentLabel)
        : null;
    const customer = getSingleRelation(sale.customers);
    const metadata = isBzstVerificationDocument(input.documentType)
        ? {
            source: "MANUAL_BZST_CHECK",
            saleId: sale.id,
            buyerId: sale.buyer_customer_id,
            vatNumberSnapshot: customer?.vat_id ?? null,
            buyerNameSnapshot: getCustomerName(customer),
            verificationSlot:
                input.documentType === "bzst_vat_verification_primary"
                    ? "PRIMARY"
                    : "SECONDARY",
            uploadedAt: new Date().toISOString(),
            reviewStatus: "REVIEW_REQUIRED",
        }
        : {};
    const originalFileName = sanitizeDocumentFileName(input.originalFileName);
    const displayFileName = isSaleCustomDocument(input.documentType)
        ? originalFileName
        : input.documentLabel
          ? `${input.documentLabel} - ${originalFileName}`
          : originalFileName;

    let existingDocument: ExistingDocumentQueryResult | null = null;
    if (input.existingDocumentId) {
        let query = supabase
            .from("documents")
            .select("id, file_path, document_type")
            .eq("id", input.existingDocumentId)
            .eq("company_id", companyId);
        query = isBzstVerificationDocument(input.documentType)
            ? query.or(
                  `sale_id.eq.${input.saleId},and(sale_id.is.null,customer_id.eq.${sale.buyer_customer_id})`,
              )
            : query.eq("sale_id", input.saleId);

        const { data, error } = await query.single();
        if (error || !data) {
            await storage.remove([input.path]);
            throw new Error("Bestehendes Dokument konnte nicht geladen werden.");
        }
        existingDocument = data as ExistingDocumentQueryResult;
        if (existingDocument.document_type !== input.documentType) {
            await storage.remove([input.path]);
            throw new Error("Dieses Dokument kann nicht durch einen anderen Dokumenttyp ersetzt werden.");
        }
    }

    const documentValues = {
        source: "uploaded",
        status: "available",
        file_name: displayFileName,
        file_path: input.path,
        mime_type: storedMimeType,
        file_size: storedSize,
        customer_id: sale.buyer_customer_id,
        vehicle_id: sale.vehicle_id,
        sale_id: sale.id,
        generated_by_system: false,
        metadata,
        ...(isSaleCustomDocument(input.documentType)
            ? { title: customDocumentLabel }
            : {}),
    };

    const result = existingDocument
        ? await supabase
              .from("documents")
              .update(documentValues)
              .eq("id", existingDocument.id)
              .eq("company_id", companyId)
        : await supabase.from("documents").insert({
              company_id: companyId,
              document_type: input.documentType,
              invoice_id: null,
              ...documentValues,
          });

    if (result.error) {
        // A repeated finalization can race with the first one. The version path
        // constraint is the source of truth; never delete a file already linked.
        const { data: linkedVersion } = await supabase
            .from("document_versions")
            .select("id")
            .eq("company_id", companyId)
            .eq("storage_bucket", "documents")
            .eq("storage_path", input.path)
            .maybeSingle();

        if (!linkedVersion) {
            await storage.remove([input.path]);
            console.error("[upload] direct sale document finalization failed", {
                saleId: input.saleId,
                message: result.error.message,
            });
            throw new Error("Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.");
        }
    }

    await logActivity({
        action: `${customDocumentLabel ?? input.documentLabel} wurde hochgeladen.`,
        entityType: "sale",
        entityId: sale.id,
    });
    revalidatePaths([
        `/dashboard/sales/${input.saleId}`,
        "/dashboard/sales",
        "/dashboard/documents",
    ]);

    return { success: true };
}

type SaleDocumentDeleteQueryResult = {
    id: string;
    sale_id: string | null;
    file_path: string | null;
    source: string;
    generated_by_system: boolean | null;
    document_type: string;
    active_version_id?: string | null;
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
    const submittedDocumentLabel = getStringFormValue(formData, "document_label");
    const documentLabel = submittedDocumentLabel ?? documentType;
    const existingDocumentId = getStringFormValue(formData, "existing_document_id");
    const fileValue = getRequiredFileFromFormData(formData);

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!documentType) {
        throw new Error("Dokumenttyp fehlt.");
    }

    const customDocumentLabel = isSaleCustomDocument(documentType)
        ? normalizeSaleCustomDocumentLabel(submittedDocumentLabel)
        : null;

    if (isSaleCustomDocument(documentType) && !customDocumentLabel) {
        throw new Error("Bitte gib eine Dokumentbezeichnung mit maximal 120 Zeichen ein.");
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
        // BZSt-Prüfnachweise können auch beim Kunden hinterlegt sein (sale_id: null),
        // da die USt-ID-Prüfung einmalig pro Kunde erfolgt. Die Verkaufsakte zeigt
        // solche Nachweise ebenfalls als vorhanden an, daher muss "Ersetzen" auch
        // kundengebundene Dokumente dieses Kunden finden, nicht nur verkaufsgebundene.
        let existingDocumentQuery = supabase
            .from("documents")
            .select("id, file_path, document_type")
            .eq("id", existingDocumentId)
            .eq("company_id", companyId);

        existingDocumentQuery = isBzstVerificationDocument(documentType)
            ? existingDocumentQuery.or(
                  `sale_id.eq.${saleId},and(sale_id.is.null,customer_id.eq.${sale.buyer_customer_id})`,
              )
            : existingDocumentQuery.eq("sale_id", saleId);

        const { data: existingDocumentData, error: existingDocumentError } =
            await existingDocumentQuery.single();

        if (existingDocumentError || !existingDocumentData) {
            throw new Error(
                `Bestehendes Dokument konnte nicht geladen werden: ${
                    existingDocumentError?.message ?? "Nicht gefunden"
                }`,
            );
        }

        existingDocument = existingDocumentData as ExistingDocumentQueryResult;

        if (
            isSaleCustomDocument(documentType) &&
            existingDocument.document_type !== saleCustomDocumentType
        ) {
            throw new Error("Dieses Zusatzdokument kann nicht ersetzt werden.");
        }
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
    const displayFileName = isSaleCustomDocument(documentType)
        ? originalFileName
        : documentLabel
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
                ...(isSaleCustomDocument(documentType)
                    ? { title: customDocumentLabel }
                    : {}),
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
            ...(isSaleCustomDocument(documentType)
                ? { title: customDocumentLabel }
                : {}),
        });

        if (documentError) {
            await cleanupPrivateDocumentFile({ supabase, filePath });

            console.error("[upload] document insert failed", documentError);
            throw new Error(
                "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
            );
        }

        if (isBzstVerificationDocument(documentType) || isSaleCustomDocument(documentType)) {
            await logActivity({
                action: `${customDocumentLabel ?? documentLabel} wurde hochgeladen.`,
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
    const userContext = await getCurrentUserContext();
    if (userContext.profile.role !== "admin") {
        throw new Error("Nur Admins dürfen Verkaufsdokumente löschen.");
    }

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
        .select("id, sale_id, file_path, source, generated_by_system, document_type, active_version_id")
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

    if (document.source === "automation_return") {
        const automationSupabase = createAutomationSupabaseClient();
        const stagedFiles = await stagePrivateDocumentFilesForDelete({
            supabase: automationSupabase,
            filePaths: [document.file_path],
            operationId: `automation-return-${document.id}-${document.active_version_id ?? "active"}`,
        });

        const { error: deleteError } = await automationSupabase.rpc(
            "delete_automation_return_document_version",
            {
                p_company_id: companyId,
                p_sale_id: saleId,
                p_document_id: document.id,
            },
        );

        if (deleteError) {
            await restoreStagedPrivateDocumentFiles({
                supabase: automationSupabase,
                stagedFiles,
            });
            throw new Error(`Automatisierter Rücklauf konnte nicht gelöscht werden: ${deleteError.message}`);
        }

        await finalizeStagedPrivateDocumentDeletes({
            supabase: automationSupabase,
            stagedFiles,
        });

        await logActivity({
            action: "Automatisierter Dokumentenrücklauf wurde gelöscht.",
            entityType: "sale",
            entityId: saleId,
        });

        revalidatePaths([
            `/dashboard/sales/${saleId}`,
            "/dashboard/sales",
            "/dashboard/documents",
        ]);

        redirect(`/dashboard/sales/${saleId}?documentDeleted=1`);
    }

    if (document.source !== "uploaded" || document.generated_by_system) {
        throw new Error(
            "Dieses Dokument wurde vom System erzeugt und kann hier nicht gelöscht werden.",
        );
    }

    const stagedFiles = isSaleCustomDocument(document.document_type)
        ? await stagePrivateDocumentFilesForDelete({
              supabase,
              filePaths: [document.file_path],
              operationId: `sale-custom-document-${document.id}`,
          })
        : [];

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
        await restoreStagedPrivateDocumentFiles({ supabase, stagedFiles });
        throw new Error(
            `Dokumentstatus konnte nicht aktualisiert werden: ${documentUpdateError.message}`,
        );
    }

    if (stagedFiles.length > 0) {
        await finalizeStagedPrivateDocumentDeletes({ supabase, stagedFiles });
    }

    if (isSaleCustomDocument(document.document_type)) {
        await logActivity({
            action: "Weiteres Dokument wurde gelöscht.",
            entityType: "document",
            entityId: document.id,
        });
    }

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/documents",
    ]);

    redirect(`/dashboard/sales/${saleId}?documentDeleted=1`);
}
