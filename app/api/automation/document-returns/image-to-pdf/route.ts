import { createHash, randomUUID } from "node:crypto";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import {
    maxAutomationImageConversionBytes,
} from "@/lib/automation/document-return-upload";
import { detectAutomationOriginalFileType, mimeTypeMatchesOriginalFile } from "@/lib/automation/file-signature";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { convertImageToPdf, ImageToPdfError } from "@/lib/automation/image-to-pdf";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { isUuid } from "@/lib/automation/validation";

export const runtime = "nodejs";

function textField(form: FormData, key: string): string | null {
    const value = form.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
    const requestId = randomUUID();
    const auth = authenticateAutomationRequest(request);
    if (!auth) return automationUnauthorized();

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return automationError(400, "invalid_multipart", "Ungültige multipart/form-data-Anfrage.", { requestId });
    }

    const file = form.get("file");
    const originalUploadId = textField(form, "originalUploadId");
    if ((file instanceof File) === Boolean(originalUploadId)) {
        return automationError(422, "image_source_required", "Genau eine Bilddatei oder originalUploadId ist erforderlich.", { requestId });
    }

    let bytes: Buffer;
    let declaredMimeType: string;
    if (originalUploadId) {
        if (!isUuid(originalUploadId)) {
            return automationError(422, "invalid_original_upload_id", "Die Original-Upload-ID ist ungültig.", { requestId });
        }
        const supabase = createAutomationSupabaseClient();
        const { data: original, error: lookupError } = await supabase
            .from("automation_return_uploads")
            .select("id, mime_type, file_size_bytes, storage_path, sha256")
            .eq("id", originalUploadId)
            .eq("company_id", auth.companyId)
            .eq("upload_kind", "original")
            .eq("processing_status", "completed")
            .maybeSingle();
        if (lookupError) {
            console.error("automation.image_to_pdf.original_lookup_failed", { requestId, code: lookupError.code ?? "unknown" });
            return automationError(500, "original_lookup_failed", "Der Originalanhang konnte nicht geprüft werden.", { requestId });
        }
        if (!original || !original.storage_path || (original.mime_type !== "image/jpeg" && original.mime_type !== "image/png")) {
            return automationError(422, "image_original_not_found", "Es wurde kein gespeicherter JPEG-/PNG-Originalanhang gefunden.", { requestId });
        }
        if (Number(original.file_size_bytes) > maxAutomationImageConversionBytes) {
            return automationError(413, "file_too_large", "Das Bild darf für die Konvertierung maximal 4 MB groß sein.", { requestId });
        }
        const { data: storedFile, error: downloadError } = await supabase.storage
            .from("documents")
            .download(original.storage_path);
        if (downloadError || !storedFile) {
            console.error("automation.image_to_pdf.original_download_failed", { requestId, code: downloadError?.name ?? "unknown" });
            return automationError(502, "original_download_failed", "Der Originalanhang konnte nicht geladen werden.", { requestId });
        }
        bytes = Buffer.from(await storedFile.arrayBuffer());
        if (
            bytes.byteLength > maxAutomationImageConversionBytes ||
            createHash("sha256").update(bytes).digest("hex") !== original.sha256
        ) {
            console.error("automation.image_to_pdf.original_integrity_failed", { requestId });
            return automationError(409, "original_integrity_failed", "Das gespeicherte Original konnte nicht verifiziert werden.", { requestId });
        }
        declaredMimeType = original.mime_type;
    } else {
        if (!(file instanceof File) || file.size === 0) {
            return automationError(422, "file_required", "Eine JPEG- oder PNG-Datei ist erforderlich.", { requestId });
        }
        if (file.size > maxAutomationImageConversionBytes) {
            return automationError(413, "file_too_large", "Das Bild darf für die Konvertierung maximal 4 MB groß sein.", { requestId });
        }
        bytes = Buffer.from(await file.arrayBuffer());
        declaredMimeType = file.type;
    }

    if (bytes.byteLength > maxAutomationImageConversionBytes) {
        return automationError(413, "file_too_large", "Das Bild darf für die Konvertierung maximal 4 MB groß sein.", { requestId });
    }

    const detectedMimeType = detectAutomationOriginalFileType(bytes);
    if (
        (detectedMimeType !== "image/jpeg" && detectedMimeType !== "image/png") ||
        !mimeTypeMatchesOriginalFile(declaredMimeType, detectedMimeType)
    ) {
        return automationError(415, "invalid_file_type", "Nur echte JPEG- oder PNG-Dateien werden akzeptiert.", { requestId });
    }

    try {
        const converted = await convertImageToPdf({
            bytes,
            mimeType: detectedMimeType,
            maxOutputBytes: maxAutomationImageConversionBytes,
        });

        return new Response(Buffer.from(converted.bytes), {
            status: 200,
            headers: {
                "content-type": "application/pdf",
                "content-disposition": `attachment; filename="bild-ruecklauf-${requestId}.pdf"`,
                "content-length": String(converted.bytes.byteLength),
                "cache-control": "private, no-store, max-age=0",
                pragma: "no-cache",
                "x-content-type-options": "nosniff",
                ...(originalUploadId ? { "x-waw-original-upload-id": originalUploadId } : {}),
            },
        });
    } catch (error) {
        if (error instanceof ImageToPdfError) {
            console.warn("automation.image_to_pdf.rejected", { requestId, code: error.code });
            return automationError(error.status, error.code, error.message, { requestId });
        }
        console.error("automation.image_to_pdf.failed", { requestId, code: "image_conversion_failed" });
        return automationError(500, "image_conversion_failed", "Das Bild konnte nicht in eine PDF umgewandelt werden.", { requestId });
    }
}
