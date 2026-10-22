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
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import {
    DocumentDatePolicy,
    type DocumentDateSuggestion,
} from "@/src/modules/documents/domain/policies/document-date-policy";
import {
    canGenerateEndUseDeclaration,
    isEndUseDeclarationOptional,
} from "@/src/modules/documents/domain/policies/end-use-declaration-policy";

export type SaleGeneratedDocumentCheck = {
    type: GeneratedDocumentType;
    documentType: string;
    label: string;
    description: string;
    requiresSignature: boolean;
    isOptional: boolean;
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
        reviewState: "manual" | "accepted" | "needs_review";
        activeVersionId: string | null;
        reviewStatus: string | null;
        reviewReason: string | null;
        reviewedAt: string | null;
    } | null;

    automationReturns: Array<NonNullable<SaleGeneratedDocumentCheck["signedDocument"]>>;

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
    active_version_id: string | null;
    archive_status: string | null;
};

type AutomationReturnReviewRow = {
    document_id: string | null;
    document_version_id: string | null;
    review_status: string | null;
    review_reason: string | null;
    reviewed_at: string | null;
};

const saleGeneratedDocumentTypes = new Set<GeneratedDocumentType>([
    "handover_protocol",
    "entry_certificate",
    "transport_proof",
    "end_use_declaration",
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
    destinationCountry: string | null | undefined;
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

    if (
        params.definition.type === "end_use_declaration" &&
        (params.saleType !== "export_third_country" ||
            !canGenerateEndUseDeclaration(params.destinationCountry))
    ) {
        return "not_relevant";
    }

    if (
        params.definition.type === "handover_protocol" &&
        params.saleType === "export_third_country"
    ) {
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
    documentsByType: Map<string, DocumentCandidates>,
    documentType: string,
): DocumentRow | null {
    return documentsByType.get(documentType)?.generated ?? null;
}

function getSignedDocument(
    documentsByType: Map<string, DocumentCandidates>,
    documentType: string,
): DocumentRow | null {
    const candidates = documentsByType.get(documentType);
    return candidates?.approvedReturn ?? candidates?.returnNeedsReview ?? null;
}

type DocumentCandidates = {
    generated: DocumentRow | null;
    approvedReturn: DocumentRow | null;
    returnNeedsReview: DocumentRow | null;
};

function mapDocumentRow(
    document: DocumentRow | null,
    reviewState: "manual" | "accepted" | "needs_review" = "manual",
    automationReview: AutomationReturnReviewRow | null = null,
) {
    if (!document) return null;

    return {
        id: document.id,
        fileName: document.file_name,
        filePath: document.file_path,
        status: document.status,
        source: document.source,
        reviewState,
        activeVersionId: document.active_version_id,
        reviewStatus: automationReview?.review_status ?? null,
        reviewReason: automationReview?.review_reason ?? null,
        reviewedAt: automationReview?.reviewed_at ?? null,
    };
}

export async function getSaleGeneratedDocumentChecks(
    saleId: string,
): Promise<SaleGeneratedDocumentCheck[]> {
    const supabase = createServerSupabaseClient();
    const automationSupabase = createAutomationSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [documentData, documentsResult, automationReviewsResult] = await Promise.all([
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
                created_at,
                active_version_id,
                archive_status
            `,
            )
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .eq("archive_status", "ACTIVE")
            .not("active_version_id", "is", null)
            .order("created_at", { ascending: false }),

        automationSupabase
            .from("automation_return_uploads")
            .select("document_id, document_version_id, review_status, review_reason, reviewed_at")
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .eq("upload_kind", "sale_document")
            .eq("processing_status", "completed"),
    ]);

    if (documentsResult.error) {
        throw new Error(
            `Dokumentstatus konnte nicht geladen werden: ${documentsResult.error.message}`,
        );
    }
    if (automationReviewsResult.error) {
        throw new Error(
            `Rücklauf-Prüfstatus konnte nicht geladen werden: ${automationReviewsResult.error.message}`,
        );
    }

    const documents = (documentsResult.data ?? []) as DocumentRow[];
    const automationReviews = (automationReviewsResult.data ?? []) as AutomationReturnReviewRow[];
    const automationReviewsByVersion = new Map(
        automationReviews
            .filter((review) => review.document_id && review.document_version_id)
            .map((review) => [`${review.document_id}:${review.document_version_id}`, review]),
    );
    const documentsByType = new Map<string, DocumentCandidates>();

    for (const document of documents) {
        const entry = documentsByType.get(document.document_type) ?? {
            generated: null,
            approvedReturn: null,
            returnNeedsReview: null,
        };

        if (document.source === "generated" && !entry.generated) {
            entry.generated = document;
        }

        if (
            (document.source === "uploaded" ||
                document.source === "automation_return") &&
            document.status === "available" &&
            !entry.approvedReturn
        ) {
            entry.approvedReturn = document;
        }

        if (
            document.source === "automation_return" &&
            document.status === "needs_review" &&
            !entry.returnNeedsReview
        ) {
            entry.returnNeedsReview = document;
        }

        documentsByType.set(document.document_type, entry);
    }

    const definitions = getDefinitionForSaleDocuments();
    const saleType = getSaleType(documentData.sale?.saleType);
    const visibleDefinitions = definitions.filter(
        (definition) =>
            getGenerationMode({
                definition,
                saleType,
                destinationCountry: documentData.export?.destinationCountry,
            }) !== "not_relevant",
    );

    return visibleDefinitions.map((definition) => {
        const generatedDocument = getGeneratedDocument(
            documentsByType,
            definition.documentType,
        );

        const signedDocument = getSignedDocument(
            documentsByType,
            definition.documentType,
        );
        const signedDocumentIsApproved = Boolean(
            signedDocument &&
                (signedDocument.source === "uploaded" ||
                    (signedDocument.source === "automation_return" &&
                        signedDocument.status === "available")),
        );
        const returnNeedsReview = Boolean(
            signedDocument?.source === "automation_return" &&
                signedDocument.status === "needs_review",
        );
        const automationReturns = documents
            .filter(
                (document) =>
                    document.document_type === definition.documentType &&
                    document.source === "automation_return",
            )
            .map((document) => {
                const review = automationReviewsByVersion.get(
                    `${document.id}:${document.active_version_id}`,
                ) ?? null;
                return mapDocumentRow(
                    document,
                    review?.review_status === "accepted" ? "accepted" : "needs_review",
                    review,
                );
            })
            .filter(
                (document): document is NonNullable<SaleGeneratedDocumentCheck["signedDocument"]> =>
                    document !== null,
            );

        const generationMode = getGenerationMode({
            definition,
            saleType,
            destinationCountry: documentData.export?.destinationCountry,
        });
        const isOptional =
            generationMode === "automatic" &&
            definition.type === "end_use_declaration" &&
            isEndUseDeclarationOptional(documentData.export?.destinationCountry);
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
                    signedDocumentExists: signedDocumentIsApproved,
                    returnNeedsReview,
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
            isOptional,
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
            signedDocument: mapDocumentRow(
                signedDocument,
                signedDocument?.source === "automation_return"
                    ? signedDocument.status === "available"
                        ? "accepted"
                        : "needs_review"
                    : "manual",
                signedDocument?.source === "automation_return"
                    ? automationReviewsByVersion.get(
                          `${signedDocument.id}:${signedDocument.active_version_id}`,
                      ) ?? null
                    : null,
            ),
            automationReturns,
            dateSuggestion,
        };
    });
}

export function getSaleGeneratedDocumentDefinitions() {
    return getGeneratedDocumentsByContext("sale").filter((definition) =>
        saleGeneratedDocumentTypes.has(definition.type),
    );
}
