import type { ArchiveDocumentCommand } from "@/src/modules/documents/application/commands/archive-document.command";
import type { DocumentDetailDto, DocumentSearchResultDto } from "@/src/modules/documents/application/dto/document.dto";
import type { GetDocumentDetailQuery } from "@/src/modules/documents/application/queries/get-document-detail.query";
import type { SearchDocumentsQuery } from "@/src/modules/documents/application/queries/search-documents.query";

export type ActiveDocumentFile = {
    documentId: string;
    documentType: string;
    fileName: string;
    invoiceNumber: string | null;
    mimeType: string | null;
    storageBucket: string;
    storagePath: string;
    versionId: string | null;
    versionNumber: number | null;
};

export interface DocumentRepository {
    search(query: SearchDocumentsQuery): Promise<DocumentSearchResultDto>;
    findDetail(query: GetDocumentDetailQuery): Promise<DocumentDetailDto | null>;
    findActiveFile(params: {
        companyId: string;
        documentId: string;
        versionId?: string;
    }): Promise<ActiveDocumentFile | null>;
    archive(command: ArchiveDocumentCommand): Promise<void>;
}
