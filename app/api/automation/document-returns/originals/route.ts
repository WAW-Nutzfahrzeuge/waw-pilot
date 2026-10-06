import { NextResponse } from "next/server";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import {
    claimUpload,
    createUploadFingerprint,
    isPdf,
    markUploadFailed,
    maxAutomationPdfBytes,
    sanitizeAutomationFileName,
} from "@/lib/automation/document-return-upload";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";

const textField = (form: FormData, key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function POST(request: Request) {
    const context = authenticateAutomationRequest(request);
    if (!context) return automationUnauthorized();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) return automationError(400, "invalid_idempotency_key", "Ein gültiger Idempotency-Key ist erforderlich.");

    let form: FormData;
    try { form = await request.formData(); } catch { return automationError(400, "invalid_multipart", "Ungültige multipart/form-data-Anfrage."); }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return automationError(422, "file_required", "Eine PDF-Datei ist erforderlich.");
    if (file.size > maxAutomationPdfBytes) return automationError(413, "file_too_large", "Die PDF darf maximal 10 MB groß sein.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (file.type !== "application/pdf" || !isPdf(bytes)) return automationError(415, "invalid_file_type", "Nur echte PDF-Dateien werden akzeptiert.");

    const receivedAt = textField(form, "receivedAt") ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(receivedAt))) return automationError(422, "invalid_received_at", "Das Eingangsdatum ist ungültig.");
    const metadata = {
        kind: "original",
        returnId: textField(form, "returnId"),
        sourceEmailId: textField(form, "sourceEmailId"),
        sourceAttachmentId: textField(form, "sourceAttachmentId"),
        receivedAt: new Date(receivedAt).toISOString(),
        fileName: file.name,
    };
    const { fileHash, fingerprint } = createUploadFingerprint(bytes, metadata);
    const supabase = createAutomationSupabaseClient();
    let claim;
    try {
        claim = await claimUpload({ supabase, row: {
            company_id: context.companyId, upload_kind: "original", idempotency_key: idempotencyKey,
            request_fingerprint: fingerprint, original_file_name: file.name, mime_type: "application/pdf",
            file_size_bytes: file.size, sha256: fileHash, received_at: metadata.receivedAt,
            return_id: metadata.returnId, source_email_id: metadata.sourceEmailId, source_attachment_id: metadata.sourceAttachmentId,
        } });
    } catch (error) {
        console.error("automation.original.claim_failed", { error: error instanceof Error ? error.message : "unknown" });
        return automationError(500, "idempotency_failed", "Der Upload konnte nicht sicher reserviert werden.");
    }
    if (claim.kind === "conflict") return automationError(409, "idempotency_conflict", "Dieser Idempotency-Key wurde bereits mit anderem Inhalt verwendet.");
    if (claim.kind === "processing") return NextResponse.json({ status: "processing", uploadId: claim.id }, { status: 202 });
    if (claim.kind === "replay") return NextResponse.json({ status: "stored", uploadId: claim.row.id, originalUploadId: claim.row.id }, { status: 200 });

    const fileName = sanitizeAutomationFileName(file.name);
    const path = `companies/${context.companyId}/automation-returns/originals/${claim.id}/${fileName}`;
    await supabase.storage.from("documents").remove([path]);
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
        await markUploadFailed(supabase, claim.id, "storage_upload_failed");
        console.error("automation.original.storage_failed", { uploadId: claim.id });
        return automationError(502, "storage_upload_failed", "Der Originalanhang konnte nicht gespeichert werden.");
    }
    const { error: completeError } = await supabase.from("automation_return_uploads").update({
        processing_status: "completed", storage_path: path, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", claim.id).eq("processing_status", "processing");
    if (completeError) {
        const { data: verified } = await supabase.from("automation_return_uploads").select("processing_status")
            .eq("id", claim.id).eq("company_id", context.companyId).maybeSingle();
        if (verified?.processing_status === "completed") {
            return NextResponse.json({ status: "stored", uploadId: claim.id, originalUploadId: claim.id }, { status: 201 });
        }
        await supabase.storage.from("documents").remove([path]);
        await markUploadFailed(supabase, claim.id, "database_finalize_failed");
        return automationError(500, "database_finalize_failed", "Der Originalanhang konnte nicht registriert werden.");
    }
    console.info("automation.original.stored", { uploadId: claim.id });
    return NextResponse.json({ status: "stored", uploadId: claim.id, originalUploadId: claim.id }, { status: 201 });
}
