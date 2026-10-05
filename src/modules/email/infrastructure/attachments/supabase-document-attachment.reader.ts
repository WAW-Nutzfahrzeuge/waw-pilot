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

        let { data, error } = await this.supabase.storage
            .from(activeFile.storageBucket)
            .download(activeFile.storagePath);

        let resolvedStoragePath = activeFile.storagePath;
        let resolvedFileName = activeFile.fileName;
        let resolvedMimeType = activeFile.mimeType;

        if (error || !data) {
            // Some invoice PDFs were regenerated through the legacy document
            // columns while an older active document version still pointed to
            // a no-longer-existing object. The current documents.file_path is
            // the source written by PDF regeneration, so use it as a safe,
            // tenant-scoped fallback instead of regenerating during delivery.
            const { data: currentDocument, error: documentError } = await this.supabase
                .from("documents")
                .select("file_name, file_path, mime_type")
                .eq("company_id", params.companyId)
                .eq("id", params.documentId)
                .single();

            const fallbackPath = currentDocument?.file_path as string | null | undefined;
            if (
                !documentError &&
                fallbackPath &&
                fallbackPath !== activeFile.storagePath
            ) {
                const fallbackDownload = await this.supabase.storage
                    .from("documents")
                    .download(fallbackPath);

                data = fallbackDownload.data;
                error = fallbackDownload.error;
                resolvedStoragePath = fallbackPath;
                resolvedFileName =
                    (currentDocument?.file_name as string | null) ?? activeFile.fileName;
                resolvedMimeType =
                    (currentDocument?.mime_type as string | null) ?? activeFile.mimeType;
            }
        }

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
                storedFileName: resolvedFileName,
                documentType: activeFile.documentType,
                mimeType: resolvedMimeType ?? data.type ?? "application/octet-stream",
                invoiceNumber: activeFile.invoiceNumber,
                storagePath: resolvedStoragePath,
                versionNumber: activeFile.versionNumber,
            }),
            mimeType: resolvedMimeType ?? data.type ?? "application/octet-stream",
            fileSizeBytes: content.byteLength,
            content,
            attachmentType: params.attachmentType,
        };
    }
}
