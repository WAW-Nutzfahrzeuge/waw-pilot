import type { SupabaseClient } from "@supabase/supabase-js";

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
    const fileName = `${documentType}-${Date.now()}${fileExtension}`;
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
