import {
    generatedDocumentDefinitions,
    getGeneratedDocumentsByContext,
    isSupportedSaleGeneratedDocumentType,
    type GeneratedDocumentDefinition,
    type GeneratedDocumentStatus,
    type GeneratedDocumentType,
} from "@/lib/pdf/generated-documents/document-types";
import {
    validateGeneratedDocumentData,
    type GeneratedDocumentValidationResult,
} from "@/lib/pdf/generated-documents/document-validation";
import {
    getGeneratedDocumentStatus,
    getGeneratedDocumentStatusLabel,
    getGeneratedDocumentStatusTone,
} from "@/lib/pdf/generated-documents/document-status";
import { getSaleGeneratedDocumentData } from "@/lib/pdf/generated-documents/sale-document-data";
import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    DocumentDatePolicy,
    type DocumentDateSuggestion,
} from "@/src/modules/documents/domain/policies/document-date-policy";

export type SaleGeneratedDocumentCheck = {
    type: GeneratedDocumentType;
    documentType: string;
    label: string;
    description: string;
    requiresSignature: boolean;
    generationMode: "automatic" | "external" | "planned" | "not_relevant";
    externalActionLabel: string | null;
    externalActionHref: string | null;

    customerId: string | null;
    vehicleId: string | null;

    status: GeneratedDocumentStatus;
    statusLabel: string;
    statusTone: "success" | "warning" | "danger" | "info" | "neutral";

    canGenerate: boolean;
    missingFields: {
        field: string;
        label: string;
        message: string;
    }[];

    generatedDocument: {
        id: string;
        fileName: string;
        filePath: string | null;
        status: string;
        source: string;
    } | null;

    signedDocument: {
        id: string;
        fileName: string;
        filePath: string | null;
        status: string;
        source: string;
    } | null;

    dateSuggestion: DocumentDateSuggestion | null;
};

type DocumentRow = {
    id: string;
    document_type: string;
    source: string;
    status: string;
    file_name: string;
    file_path: string | null;
    created_at: string;
};

const saleGeneratedDocumentTypes = new Set<GeneratedDocumentType>([
    "handover_protocol",
    "entry_certificate",
    "transport_proof",
]);

type SaleDocumentGenerationMode =
    SaleGeneratedDocumentCheck["generationMode"];

function getSaleType(
    saleType: string | null | undefined,
): "inland" | "eu" | "export_third_country" {
    if (saleType === "eu" || saleType === "export_third_country") {
        return saleType;
    }

    return "inland";
}

function getGenerationMode(params: {
    definition: GeneratedDocumentDefinition;
    saleType: "inland" | "eu" | "export_third_country";
}): SaleDocumentGenerationMode {
    if (
        params.definition.type === "invoice_pdf" ||
        params.definition.type === "proforma_invoice"
    ) {
        return "external";
    }

    if (params.definition.type === "entry_certificate" && params.saleType !== "eu") {
        return "not_relevant";
    }

    if (params.definition.type === "transport_proof" && params.saleType !== "eu") {
        return "not_relevant";
    }

    if (isSupportedSaleGeneratedDocumentType(params.definition.type)) {
        return "automatic";
    }

    return "planned";
}

function getNonAutomaticStatus(params: {
    generationMode: SaleDocumentGenerationMode;
    generatedDocumentExists: boolean;
}): GeneratedDocumentStatus {
    if (params.generatedDocumentExists) {
        return "generated_available";
    }

    if (params.generationMode === "external") {
        return "external_process";
    }

    if (params.generationMode === "not_relevant") {
        return "not_relevant";
    }

    return "generator_planned";
}

function getExternalAction(): Pick<
    SaleGeneratedDocumentCheck,
    "externalActionLabel" | "externalActionHref"
> {
    return {
        externalActionLabel: null,
        externalActionHref: null,
    };
}

function getDefinitionForSaleDocuments(): GeneratedDocumentDefinition[] {
    return generatedDocumentDefinitions.filter(
        (definition) =>
            definition.context === "sale" &&
            saleGeneratedDocumentTypes.has(definition.type),
    );
}

function getGeneratedDocument(
    documents: DocumentRow[],
    documentType: string,
): DocumentRow | null {
    return (
        documents.find(
            (document) =>
                document.document_type === documentType &&
                document.source === "generated",
        ) ?? null
    );
}

function getSignedDocument(
    documents: DocumentRow[],
    documentType: string,
): DocumentRow | null {
    return (
        documents.find(
            (document) =>
                document.document_type === documentType &&
                document.source === "uploaded" &&
                document.status === "available",
        ) ?? null
    );
}

function mapDocumentRow(document: DocumentRow | null) {
    if (!document) return null;

    return {
        id: document.id,
        fileName: document.file_name,
        filePath: document.file_path,
        status: document.status,
        source: document.source,
    };
}

export async function getSaleGeneratedDocumentChecks(
    saleId: string,
): Promise<SaleGeneratedDocumentCheck[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [documentData, documentsResult] = await Promise.all([
        getSaleGeneratedDocumentData(saleId),

        supabase
            .from("documents")
            .select(
                `
                id,
                document_type,
                source,
                status,
                file_name,
                file_path,
                created_at
            `,
            )
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .order("created_at", { ascending: false }),
    ]);

    if (documentsResult.error) {
        throw new Error(
            `Dokumentstatus konnte nicht geladen werden: ${documentsResult.error.message}`,
        );
    }

    const documents = (documentsResult.data ?? []) as DocumentRow[];
    const definitions = getDefinitionForSaleDocuments();
    const saleType = getSaleType(documentData.sale?.saleType);
    const visibleDefinitions = definitions.filter(
        (definition) =>
            getGenerationMode({ definition, saleType }) !== "not_relevant",
    );

    return visibleDefinitions.map((definition) => {
        const generatedDocument = getGeneratedDocument(
            documents,
            definition.documentType,
        );

        const signedDocument = getSignedDocument(
            documents,
            definition.documentType,
        );

        const generationMode = getGenerationMode({ definition, saleType });
        const externalAction = getExternalAction();
        const dateSuggestion =
            isSupportedSaleGeneratedDocumentType(definition.type)
                ? new DocumentDatePolicy().suggest({
                    documentType: definition.type,
                    invoiceDate: documentData.sale?.invoiceDate,
                    saleDate: documentData.sale?.saleDate,
                    transportStartDate: documentData.export?.transportDate,
                    destinationCountry: documentData.export?.destinationCountry,
                })
                : null;
        const validation: GeneratedDocumentValidationResult =
            generationMode === "automatic"
                ? validateGeneratedDocumentData(definition.type, documentData)
                : {
                    canGenerate: false,
                    missingFields: [],
                };

        const status =
            generationMode === "automatic"
                ? getGeneratedDocumentStatus({
                    definition,
                    validation,
                    documentExists: Boolean(generatedDocument),
                    signedDocumentExists: Boolean(signedDocument),
                    sentToCustomer: false,
                })
                : getNonAutomaticStatus({
                    generationMode,
                    generatedDocumentExists: Boolean(generatedDocument),
                });

        return {
            type: definition.type,
            documentType: definition.documentType,
            label: definition.label,
            description: definition.description,
            requiresSignature: definition.requiresSignature,
            generationMode,
            externalActionLabel: externalAction.externalActionLabel,
            externalActionHref: externalAction.externalActionHref,

            customerId: documentData.customerId ?? null,
            vehicleId: documentData.vehicleId ?? null,

            status,
            statusLabel: getGeneratedDocumentStatusLabel(status),
            statusTone: getGeneratedDocumentStatusTone(status),

            canGenerate: validation.canGenerate,
            missingFields: validation.missingFields.map((field) => ({
                field: field.field,
                label: field.label,
                message: field.message,
            })),

            generatedDocument: mapDocumentRow(generatedDocument),
            signedDocument: mapDocumentRow(signedDocument),
            dateSuggestion,
        };
    });
}

export function getSaleGeneratedDocumentDefinitions() {
    return getGeneratedDocumentsByContext("sale").filter((definition) =>
        saleGeneratedDocumentTypes.has(definition.type),
    );
}
