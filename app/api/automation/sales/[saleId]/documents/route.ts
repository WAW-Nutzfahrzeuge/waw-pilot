import { NextResponse } from "next/server";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import {
    automationReturnDocumentTypes, automationReviewStatuses, automationSignatureStatuses,
    claimUpload, createUploadFingerprint, isPdf, markUploadFailed, maxAutomationPdfBytes,
    parsePageNumbers, sanitizeAutomationFileName,
} from "@/lib/automation/document-return-upload";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
type Context = { params: Promise<{ saleId: string }> };
const field = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; };

export async function POST(request: Request, routeContext: Context) {
    const auth = authenticateAutomationRequest(request);
    if (!auth) return automationUnauthorized();
    const { saleId } = await routeContext.params;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) return automationError(400, "invalid_idempotency_key", "Ein gültiger Idempotency-Key ist erforderlich.");
    let form: FormData;
    try { form = await request.formData(); } catch { return automationError(400, "invalid_multipart", "Ungültige multipart/form-data-Anfrage."); }
    const file = form.get("file");
    const documentType = field(form, "documentType");
    const saleIdentifier = field(form, "saleIdentifier")?.toUpperCase();
    const signatureStatus = field(form, "signatureStatus");
    const reviewStatus = field(form, "reviewStatus") ?? "pending";
    const originalPageNumbersRaw = field(form, "originalPageNumbers");
    const originalPageNumbers = parsePageNumbers(originalPageNumbersRaw);
    if (!(file instanceof File) || file.size === 0) return automationError(422, "file_required", "Eine PDF-Datei ist erforderlich.");
    if (file.size > maxAutomationPdfBytes) return automationError(413, "file_too_large", "Die PDF darf maximal 10 MB groß sein.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (file.type !== "application/pdf" || !isPdf(bytes)) return automationError(415, "invalid_file_type", "Nur echte PDF-Dateien werden akzeptiert.");
    if (!documentType || !automationReturnDocumentTypes.includes(documentType as never)) return automationError(422, "invalid_document_type", "Der Dokumenttyp ist ungültig.");
    if (!saleIdentifier) return automationError(422, "sale_identifier_required", "Die Verkaufskennung ist als Zuordnungskontrolle erforderlich.");
    if (!signatureStatus || !automationSignatureStatuses.includes(signatureStatus as never)) return automationError(422, "invalid_signature_status", "Der Unterschriftsstatus ist ungültig.");
    if (!automationReviewStatuses.includes(reviewStatus as never)) return automationError(422, "invalid_review_status", "Der Prüfstatus ist ungültig.");
    if (originalPageNumbersRaw && !originalPageNumbers) return automationError(422, "invalid_page_numbers", "Originalseiten müssen als eindeutige positive Zahlen, z. B. 1,2, angegeben werden.");
    const receivedAtRaw = field(form, "receivedAt") ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(receivedAtRaw))) return automationError(422, "invalid_received_at", "Das Eingangsdatum ist ungültig.");

    const supabase = createAutomationSupabaseClient();
    const { data: sale, error: saleError } = await supabase.from("sales")
        .select("id, sale_identifier, vehicle_id, buyer_customer_id")
        .eq("id", saleId).eq("company_id", auth.companyId).maybeSingle();
    if (saleError) return automationError(500, "sale_lookup_failed", "Die Verkaufsakte konnte nicht geprüft werden.");
    if (!sale) return automationError(404, "sale_not_found", "Die Verkaufsakte wurde nicht gefunden.");
    if (String(sale.sale_identifier).toUpperCase() !== saleIdentifier) return automationError(409, "sale_identifier_conflict", "Verkaufs-ID und Verkaufskennung gehören nicht zusammen.");

    const parentOriginalUploadId = field(form, "originalUploadId");
    if (parentOriginalUploadId) {
        const { data: original } = await supabase.from("automation_return_uploads").select("id")
            .eq("id", parentOriginalUploadId).eq("company_id", auth.companyId).eq("upload_kind", "original").eq("processing_status", "completed").maybeSingle();
        if (!original) return automationError(422, "original_not_found", "Der angegebene Originalanhang ist nicht vorhanden.");
    }
    const replacesDocumentId = field(form, "replacesDocumentId");
    let replacement: { id: string } | null = null;
    if (replacesDocumentId) {
        const { data } = await supabase.from("documents").select("id").eq("id", replacesDocumentId)
            .eq("company_id", auth.companyId).eq("sale_id", saleId).eq("document_type", documentType).eq("source", "automation_return").maybeSingle();
        if (!data) return automationError(422, "replacement_not_found", "Das zu ersetzende Rücklaufdokument ist ungültig.");
        replacement = data;
    }

    const receivedAt = new Date(receivedAtRaw).toISOString();
    const metadata = { kind: "sale_document", saleId, saleIdentifier, documentType, signatureStatus, reviewStatus,
        reviewReason: field(form, "reviewReason"), returnId: field(form, "returnId"), sourceEmailId: field(form, "sourceEmailId"),
        sourceAttachmentId: field(form, "sourceAttachmentId"), originalPageNumbers, parentOriginalUploadId, replacesDocumentId, receivedAt, fileName: file.name };
    const { fileHash, fingerprint } = createUploadFingerprint(bytes, metadata);
    let claim;
    try {
        claim = await claimUpload({ supabase, row: { company_id: auth.companyId, upload_kind: "sale_document", idempotency_key: idempotencyKey,
            request_fingerprint: fingerprint, sale_id: saleId, sale_identifier: saleIdentifier, document_type: documentType,
            original_file_name: file.name, mime_type: "application/pdf", file_size_bytes: file.size, sha256: fileHash,
            return_id: metadata.returnId, source_email_id: metadata.sourceEmailId, source_attachment_id: metadata.sourceAttachmentId,
            original_page_numbers: originalPageNumbers, received_at: receivedAt, signature_status: signatureStatus,
            review_status: reviewStatus, review_reason: metadata.reviewReason, parent_original_upload_id: parentOriginalUploadId } });
    } catch (error) {
        console.error("automation.document.claim_failed", { saleId, error: error instanceof Error ? error.message : "unknown" });
        return automationError(500, "idempotency_failed", "Der Upload konnte nicht sicher reserviert werden.");
    }
    if (claim.kind === "conflict") return automationError(409, "idempotency_conflict", "Dieser Idempotency-Key wurde bereits mit anderem Inhalt verwendet.");
    if (claim.kind === "processing") return NextResponse.json({ status: "processing", uploadId: claim.id }, { status: 202 });
    if (claim.kind === "replay") return NextResponse.json({ status: "stored", uploadId: claim.row.id, documentId: claim.row.document_id, documentVersionId: claim.row.document_version_id }, { status: 200 });

    const safeName = sanitizeAutomationFileName(file.name);
    const path = `companies/${auth.companyId}/sales/${saleId}/automation-returns/${claim.id}/${safeName}`;
    await supabase.storage.from("documents").remove([path]);
    const { error: uploadError } = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
        await markUploadFailed(supabase, claim.id, "storage_upload_failed");
        return automationError(502, "storage_upload_failed", "Das Rücklaufdokument konnte nicht gespeichert werden.");
    }

    const documentStatus = signatureStatus === "present" && reviewStatus !== "rejected" ? "available" : "needs_review";
    const documentMetadata = { automationReturn: { uploadId: claim.id, ...metadata, sha256: fileHash,
        signatureMeaning: "visible_signature_only_no_authenticity_check" } };
    const { data: completedRows, error: documentError } = await supabase.rpc("complete_automation_sale_document_upload", {
        p_upload_id: claim.id,
        p_company_id: auth.companyId,
        p_storage_path: path,
        p_document_status: documentStatus,
        p_document_metadata: documentMetadata,
        p_replaces_document_id: replacement?.id ?? null,
    });
    const completed = Array.isArray(completedRows) ? completedRows[0] : completedRows;
    const documentId = completed?.document_id ? String(completed.document_id) : "";
    if (documentError || !documentId) {
        const { data: verified } = await supabase.from("automation_return_uploads").select("processing_status, document_id, document_version_id")
            .eq("id", claim.id).eq("company_id", auth.companyId).maybeSingle();
        if (verified?.processing_status === "completed" && verified.document_id) {
            return NextResponse.json({ status: "stored", uploadId: claim.id, documentId: verified.document_id, documentVersionId: verified.document_version_id }, { status: 201 });
        }
        await supabase.storage.from("documents").remove([path]);
        await markUploadFailed(supabase, claim.id, "document_write_failed");
        console.error("automation.document.write_failed", { saleId, uploadId: claim.id, code: documentError?.code });
        return automationError(500, "document_write_failed", "Das Rücklaufdokument konnte nicht in der Verkaufsakte registriert werden.");
    }
    console.info("automation.document.stored", { saleId, uploadId: claim.id, documentId });
    return NextResponse.json({ status: "stored", uploadId: claim.id, documentId, documentVersionId: completed?.document_version_id ?? null }, { status: 201 });
}
