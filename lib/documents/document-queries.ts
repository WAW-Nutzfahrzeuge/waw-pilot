import { getCurrentCompanyId } from "@/lib/company";
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
