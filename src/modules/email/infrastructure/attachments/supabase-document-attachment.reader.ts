import type { SupabaseClient } from "@supabase/supabase-js";

import { EmailAttachmentNotFoundError } from "@/src/modules/email/domain/errors/email-errors";
import type {
    EmailAttachmentReaderPort,
    ResolvedEmailAttachment,
} from "@/src/modules/email/application/ports/email-attachment-reader.port";
import type { DocumentRepository } from "@/src/modules/documents/application/ports/document-repository.port";
import { getDocumentDownloadFileName } from "@/lib/documents/visible-file-names";

export class SupabaseDocumentAttachmentReader implements EmailAttachmentReaderPort {
    constructor(
        private readonly supabase: SupabaseClient,
        private readonly documentRepository: DocumentRepository,
    ) {}

    async readDocumentAttachment(params: {
        companyId: string;
        documentId: string;
        documentVersionId?: string | null;
        attachmentType: string;
    }): Promise<ResolvedEmailAttachment> {
        const activeFile = await this.documentRepository.findActiveFile({
            companyId: params.companyId,
            documentId: params.documentId,
            versionId: params.documentVersionId ?? undefined,
        });

        if (!activeFile) {
            throw new EmailAttachmentNotFoundError(
                "Das Dokument konnte nicht als Anhang geladen werden.",
            );
        }

        const { data, error } = await this.supabase.storage
            .from(activeFile.storageBucket)
            .download(activeFile.storagePath);

        if (error || !data) {
            throw new EmailAttachmentNotFoundError(
                "Die private Dokumentdatei konnte nicht gelesen werden.",
            );
        }

        const content = Buffer.from(await data.arrayBuffer());

        return {
            documentId: activeFile.documentId,
            documentVersionId: activeFile.versionId,
            fileName: getDocumentDownloadFileName({
                storedFileName: activeFile.fileName,
                documentType: activeFile.documentType,
                mimeType: activeFile.mimeType ?? data.type ?? "application/octet-stream",
                invoiceNumber: activeFile.invoiceNumber,
                storagePath: activeFile.storagePath,
                versionNumber: activeFile.versionNumber,
            }),
            mimeType: activeFile.mimeType ?? data.type ?? "application/octet-stream",
            fileSizeBytes: content.byteLength,
            content,
            attachmentType: params.attachmentType,
        };
    }
}
