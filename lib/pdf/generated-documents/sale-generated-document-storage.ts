import { getCurrentCompanyId } from "@/lib/company";
import {
    getGeneratedDocumentDefinition,
    isSupportedSaleGeneratedDocumentType,
    type GeneratedDocumentType,
} from "@/lib/pdf/generated-documents/document-types";
import { validateGeneratedDocumentData } from "@/lib/pdf/generated-documents/document-validation";
import { getSaleGeneratedDocumentData } from "@/lib/pdf/generated-documents/sale-document-data";
import { generateHandoverProtocolPdf } from "@/lib/pdf/templates/handover-protocol-pdf";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateEntryCertificatePdf } from "@/lib/pdf/templates/entry-certificate-pdf";
import { generateTransportProofPdf } from "@/lib/pdf/templates/transport-proof-pdf";
import { getCompanySignatureStampAssets } from "@/lib/pdf/company-signature-assets";
import { logActivity } from "@/lib/activity/activity-log";
import { MissingInvoiceDateError } from "@/src/modules/documents/domain/errors/document-rule-errors";
import { MissingDocumentDateError } from "@/src/modules/documents/domain/errors/document-rule-errors";
import {
    DocumentDatePolicy,
    type DocumentDateSuggestion,
} from "@/src/modules/documents/domain/policies/document-date-policy";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

export type GenerateSaleDocumentResult = {
    documentId: string;
    fileName: string;
    filePath: string;
};

function buildGeneratedDocumentMetadata(params: {
    documentDate: DocumentDateSuggestion;
    generatedAt: string;
    overrideDate: string | null;
}): Record<string, unknown> {
    return {
        documentDate: params.documentDate.usedDate,
        usedDate: params.documentDate.usedDate,
        suggestedDate: params.documentDate.suggestedDate,
        sourceDate: params.documentDate.sourceDate,
        transitDays: params.documentDate.transitDays,
        destinationCountryCode: params.documentDate.countryCode,
        destinationCountryName: params.documentDate.countryName,
        calculationType: params.documentDate.calculationType,
        overrideApplied: params.documentDate.isOverridden,
        overrideDate: params.overrideDate,
        generatedAt: params.generatedAt,
        source: "generated_sale_document",
    };
}

async function logDocumentDateOverrideActivity(params: {
    documentId: string;
    documentDate: DocumentDateSuggestion;
}): Promise<void> {
    if (!params.documentDate.isOverridden) return;

    await logActivity({
        action: `Das vorgeschlagene Dokumentdatum wurde auf ${params.documentDate.usedDate} geändert.`,
        entityType: "document",
        entityId: params.documentId,
    });
}

async function generatePdfBytesForSaleDocument(
    documentType: GeneratedDocumentType,
    saleId: string,
    includeSignatureStamp: boolean,
    documentDateOverride: string | null,
) {
    const documentData = await getSaleGeneratedDocumentData(saleId);
    if (!isSupportedSaleGeneratedDocumentType(documentType)) {
        throw new Error("Dieser Dokumenttyp wird nicht automatisch erzeugt.");
    }

    const validation = validateGeneratedDocumentData(documentType, documentData);

    if (!validation.canGenerate) {
        const messages = validation.missingFields
            .map((field) => field.message)
            .join(" ");

        throw new Error(
            `Dokument kann nicht erzeugt werden, weil Pflichtdaten fehlen: ${messages}`,
        );
    }

    const documentDate = new DocumentDatePolicy().suggest({
        documentType,
        invoiceDate: documentData.sale?.invoiceDate,
        saleDate: documentData.sale?.saleDate,
        transportStartDate: documentData.export?.transportDate,
        destinationCountry: documentData.export?.destinationCountry,
        overrideDate: documentDateOverride,
    });

    if (documentType === "handover_protocol" && !documentDate.usedDate) {
        throw new MissingInvoiceDateError();
    }

    if (
        (documentType === "entry_certificate" || documentType === "transport_proof") &&
        !documentDate.usedDate
    ) {
        throw new MissingDocumentDateError();
    }

    const documentDataWithDate = {
        ...documentData,
        documentDate: {
            ...documentDate,
            usedDate: documentDate.usedDate,
        },
    };

    if (documentType === "handover_protocol") {
        return {
            pdfBytes: await generateHandoverProtocolPdf(documentDataWithDate, {
                signatureStamp: {
                    include: includeSignatureStamp,
                    ...(await getCompanySignatureStampAssets(includeSignatureStamp)),
                },
            }),
            documentData: documentDataWithDate,
            documentDate,
        };
    }

    if (documentType === "entry_certificate") {
        return {
            pdfBytes: await generateEntryCertificatePdf(documentDataWithDate),
            documentData: documentDataWithDate,
            documentDate,
        };
    }

    if (documentType === "transport_proof") {
        return {
            pdfBytes: await generateTransportProofPdf(documentDataWithDate),
            documentData: documentDataWithDate,
            documentDate,
        };
    }

    throw new Error(
        "Dieser Dokumenttyp kann aktuell noch nicht automatisch erzeugt werden.",
    );
}

export async function generateAndStoreSaleGeneratedDocument(params: {
    saleId: string;
    documentType: GeneratedDocumentType;
    includeSignatureStamp?: boolean;
    documentDateOverride?: string | null;
}): Promise<GenerateSaleDocumentResult> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    if (!isSupportedSaleGeneratedDocumentType(params.documentType)) {
        throw new Error(
            "Dieser Dokumenttyp kann in der Verkaufsakte nicht automatisch erzeugt werden.",
        );
    }

    const definition = getGeneratedDocumentDefinition(params.documentType);

    const { pdfBytes, documentData, documentDate } = await generatePdfBytesForSaleDocument(
        params.documentType,
        params.saleId,
        Boolean(params.includeSignatureStamp),
        params.documentDateOverride ?? null,
    );

    const fileNamePolicy = new ExportFileNamePolicy();
    const saleReference = documentData.sale?.saleNumber ?? documentData.sale?.invoiceNumber ?? params.saleId;
    const fileName = fileNamePolicy.createDocumentFileName({
        saleReference,
        documentType: params.documentType,
        mimeType: "application/pdf",
    });
    const fileBaseName = fileName.replace(/\.pdf$/i, "");

    const generatedAt = new Date().toISOString();
    const versionPart = generatedAt.replace(/[:.]/g, "-");
    const filePath = `generated-documents/sales/${params.saleId}/${fileBaseName}-${versionPart}.pdf`;
    const metadata = buildGeneratedDocumentMetadata({
        documentDate,
        generatedAt,
        overrideDate: params.documentDateOverride ?? null,
    });

    const [uploadResult, existingDocumentResult] = await Promise.all([
        supabase.storage.from("documents").upload(filePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: false,
        }),
        supabase
            .from("documents")
            .select("id")
            .eq("company_id", companyId)
            .eq("sale_id", params.saleId)
            .eq("document_type", definition.documentType)
            .eq("source", "generated")
            .maybeSingle(),
    ]);

    if (uploadResult.error) {
        throw new Error(
            `PDF konnte nicht gespeichert werden: ${uploadResult.error.message}`,
        );
    }

    if (existingDocumentResult.error) {
        throw new Error(
            `Vorhandenes Dokument konnte nicht geprüft werden: ${existingDocumentResult.error.message}`,
        );
    }

    const existingDocument = existingDocumentResult.data;

    if (existingDocument?.id) {
        const { error: updateError } = await supabase
            .from("documents")
            .update({
                status: definition.requiresSignature ? "needs_review" : "available",
                file_name: fileName,
                file_path: filePath,
                mime_type: "application/pdf",
                file_size: pdfBytes.byteLength,
                customer_id: documentData.customerId,
                vehicle_id: documentData.vehicleId,
                generated_by_system: true,
                metadata,
            })
            .eq("id", existingDocument.id)
            .eq("company_id", companyId);

        if (updateError) {
            throw new Error(
                `Dokument konnte nicht aktualisiert werden: ${updateError.message}`,
            );
        }

        await logDocumentDateOverrideActivity({
            documentId: existingDocument.id,
            documentDate,
        });

        return {
            documentId: existingDocument.id,
            fileName,
            filePath,
        };
    }

    const { data: insertedDocument, error: insertError } = await supabase
        .from("documents")
        .insert({
            company_id: companyId,
            document_type: definition.documentType,
            source: "generated",
            status: definition.requiresSignature ? "needs_review" : "available",
            file_name: fileName,
            file_path: filePath,
            mime_type: "application/pdf",
            file_size: pdfBytes.byteLength,
            customer_id: documentData.customerId,
            vehicle_id: documentData.vehicleId,
            sale_id: params.saleId,
            generated_by_system: true,
            metadata,
        })
        .select("id")
        .single();

    if (insertError || !insertedDocument) {
        throw new Error(
            `Dokument konnte nicht angelegt werden: ${
                insertError?.message ?? "Keine Dokument-ID erhalten"
            }`,
        );
    }

    await logDocumentDateOverrideActivity({
        documentId: insertedDocument.id as string,
        documentDate,
    });

    return {
        documentId: insertedDocument.id as string,
        fileName,
        filePath,
    };
}
