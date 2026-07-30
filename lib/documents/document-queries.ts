import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapDocumentListItemToLegacyRow } from "@/src/modules/documents/application/mappers/legacy-document-row.mapper";
import { createDocumentUseCases } from "@/src/modules/documents/infrastructure/factories/document-use-case.factory";

export type DocumentSource = "generated" | "uploaded";
export type DocumentStatus = "available" | "missing" | "needs_review";

export type DocumentRow = {
    id: string;
    document_type: string;
    source: DocumentSource;
    status: DocumentStatus;

    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size: number | null;

    customer_id: string | null;
    vehicle_id: string | null;
    sale_id: string | null;
    invoice_id: string | null;

    generated_by_system: boolean;
    created_at: string;

    customer_name: string | null;
    vehicle_internal_number: string | null;
    vehicle_name: string | null;
    invoice_number: string | null;
    review_href: string | null;
};

export type DocumentDashboardSummary = {
    documentsCount: number;
    incompleteDocumentsCount: number;
};

export type DocumentsToCheckSummary = {
    count: number;
    documents: DocumentRow[];
};

export async function getDocuments(): Promise<DocumentRow[]> {
    const companyId = getCurrentCompanyId();
    const { searchDocuments } = createDocumentUseCases();
    const result = await searchDocuments.execute({
        companyId,
        limit: 500,
        includeCount: false,
    });

    return result.documents.map(mapDocumentListItemToLegacyRow);
}

export async function getDocumentDashboardSummary(): Promise<DocumentDashboardSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("documents")
        .select("status")
        .eq("company_id", companyId)
        .neq("status", "missing");

    if (error) {
        throw new Error(
            `Dokumenten-Zusammenfassung konnte nicht geladen werden: ${error.message}`,
        );
    }

    let incompleteDocumentsCount = 0;

    for (const document of data ?? []) {
        if (document.status !== "available") {
            incompleteDocumentsCount += 1;
        }
    }

    return {
        documentsCount: data?.length ?? 0,
        incompleteDocumentsCount,
    };
}

export async function getDocumentsToCheckSummary(): Promise<DocumentsToCheckSummary> {
    const companyId = getCurrentCompanyId();
    const { searchDocuments } = createDocumentUseCases();
    const result = await searchDocuments.execute({
        companyId,
        needsReviewOnly: true,
        limit: 10,
        includeCount: true,
    });

    return {
        count: result.totalCount,
        documents: result.documents.map(mapDocumentListItemToLegacyRow),
    };
}
