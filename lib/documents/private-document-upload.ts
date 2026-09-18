import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type UploadedPrivateDocumentFile = {
    originalFileName: string;
    fileName: string;
    filePath: string;
    mimeType: string | null;
    fileSize: number;
};

export function getRequiredFileFromFormData(
    formData: FormData,
    key = "file",
): File | null {
    const fileValue = formData.get(key);

    if (!(fileValue instanceof File) || fileValue.size <= 0) return null;

    return fileValue;
}

export function sanitizeDocumentFileName(fileName: string): string {
    return fileName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9.\-_]/g, "");
}

function getFileExtension(fileName: string): string {
    const parts = fileName.split(".");
    const extension = parts.length > 1 ? parts.pop() : null;

    return extension ? `.${extension}` : "";
}

export async function uploadPrivateDocumentFile({
    supabase,
    file,
    directory,
    documentType,
    bucket = "documents",
}: {
    supabase: SupabaseClient;
    file: File;
    directory: string;
    documentType: string;
    bucket?: string;
}): Promise<
    | { success: true; uploadedFile: UploadedPrivateDocumentFile }
    | { success: false; error: { message?: string } }
> {
    const originalFileName = sanitizeDocumentFileName(file.name);
    const fileExtension = getFileExtension(originalFileName);
    const fileName = `${documentType}-${randomUUID()}${fileExtension}`;
    const filePath = `${directory}/${fileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from(bucket).upload(filePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });

    if (error) {
        return { success: false, error };
    }

    return {
        success: true,
        uploadedFile: {
            originalFileName,
            fileName,
            filePath,
            mimeType: file.type || null,
            fileSize: file.size,
        },
    };
}

export async function cleanupPrivateDocumentFile({
    supabase,
    filePath,
    bucket = "documents",
}: {
    supabase: SupabaseClient;
    filePath: string | null | undefined;
    bucket?: string;
}) {
    if (!filePath) return;

    await supabase.storage.from(bucket).remove([filePath]);
}

export type StagedPrivateDocumentFile = {
    originalPath: string;
    trashPath: string;
};

export function buildPrivateDocumentTrashPath({
    operationId,
    filePath,
}: {
    operationId: string;
    filePath: string;
}): string {
    const normalizedPath = filePath.replace(/^\/+/, "");

    return `admin-delete-trash/${operationId}/${normalizedPath}`;
}

function isStorageNotFoundError(error: { statusCode?: string | number; message?: string } | null): boolean {
    if (!error) return false;

    return (
        error.statusCode === 404 ||
        error.statusCode === "404" ||
        error.message?.toLowerCase().includes("not found") === true
    );
}

export async function stagePrivateDocumentFilesForDelete({
    supabase,
    filePaths,
    operationId,
    bucket = "documents",
}: {
    supabase: SupabaseClient;
    filePaths: Array<string | null | undefined>;
    operationId: string;
    bucket?: string;
}): Promise<StagedPrivateDocumentFile[]> {
    const uniqueFilePaths = Array.from(
        new Set(filePaths.filter((filePath): filePath is string => Boolean(filePath))),
    );
    const stagedFiles: StagedPrivateDocumentFile[] = [];
    const storage = supabase.storage.from(bucket);

    for (const filePath of uniqueFilePaths) {
        const trashPath = buildPrivateDocumentTrashPath({ operationId, filePath });
        const { error } = await storage.move(filePath, trashPath);

        if (error) {
            if (isStorageNotFoundError(error)) continue;

            await restoreStagedPrivateDocumentFiles({
                supabase,
                stagedFiles,
                bucket,
            });

            throw new Error(`Storage-Datei konnte nicht vorbereitet werden: ${filePath}`);
        }

        stagedFiles.push({ originalPath: filePath, trashPath });
    }

    return stagedFiles;
}

export async function restoreStagedPrivateDocumentFiles({
    supabase,
    stagedFiles,
    bucket = "documents",
}: {
    supabase: SupabaseClient;
    stagedFiles: StagedPrivateDocumentFile[];
    bucket?: string;
}): Promise<void> {
    const storage = supabase.storage.from(bucket);

    for (const stagedFile of [...stagedFiles].reverse()) {
        const { error } = await storage.move(stagedFile.trashPath, stagedFile.originalPath);

        if (error && !isStorageNotFoundError(error)) {
            throw new Error(
                `Storage-Datei konnte nicht zurückverschoben werden: ${stagedFile.originalPath}`,
            );
        }
    }
}

export async function finalizeStagedPrivateDocumentDeletes({
    supabase,
    stagedFiles,
    bucket = "documents",
}: {
    supabase: SupabaseClient;
    stagedFiles: StagedPrivateDocumentFile[];
    bucket?: string;
}): Promise<void> {
    const trashPaths = stagedFiles.map((stagedFile) => stagedFile.trashPath);

    if (trashPaths.length === 0) return;

    const { error } = await supabase.storage.from(bucket).remove(trashPaths);

    if (error) {
        throw new Error(`Storage-Cleanup konnte nicht abgeschlossen werden: ${error.message}`);
    }
}
