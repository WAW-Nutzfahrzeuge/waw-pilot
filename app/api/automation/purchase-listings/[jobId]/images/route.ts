import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentCompanyId } from "@/lib/company";
import { automationError } from "@/lib/automation/http";
import { isUuid } from "@/lib/automation/validation";
import { isListingAutomationRequestAuthorized } from "@/lib/purchases/purchase-listing-server";
import { isSupportedListingImageMime } from "@/lib/purchases/purchase-listing-contract";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
const maxImageBytes = 10 * 1024 * 1024;
type Context = { params: Promise<{ jobId: string }> };
type ImageRow = { id: string; company_id: string; job_id: string; storage_path: string; file_name: string; mime_type: string; file_size: number; sha256: string; source_drive_item_id: string; source_e_tag: string; upload_status: "pending" | "available" };
function validName(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 255 && !/[\\/:*?"<>|\u0000-\u001f]/.test(value);
}

export async function POST(request: Request, context: Context) {
    if (!isListingAutomationRequestAuthorized(request)) return automationError(401, "unauthorized", "Automatisierungszugang ungültig.");
    const { jobId } = await context.params;
    if (!isUuid(jobId)) return automationError(422, "invalid_job_id", "Die Auftrags-ID ist ungültig.");
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return automationError(415, "json_required", "Es werden JSON-Metadaten erwartet.");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !validName(body.fileName) || typeof body.mimeType !== "string" || !isSupportedListingImageMime(body.mimeType) ||
        !Number.isInteger(body.fileSize) || Number(body.fileSize) < 1 || Number(body.fileSize) > maxImageBytes ||
        typeof body.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(body.sha256) ||
        typeof body.sourceDriveItemId !== "string" || body.sourceDriveItemId.length < 1 || body.sourceDriveItemId.length > 500 ||
        typeof body.sourceETag !== "string" || body.sourceETag.length < 1 || body.sourceETag.length > 500) {
        return automationError(422, "invalid_image_metadata", "Bilddatei-Metadaten sind ungültig oder überschreiten das Limit von 10 MB.");
    }
    const companyId = getCurrentCompanyId();
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 20_000 });
    const { data: job } = await supabase.from("purchase_listing_jobs").select("id, company_id, status")
        .eq("id", jobId).eq("company_id", companyId).maybeSingle();
    if (!job || !["processing", "queued"].includes(String(job.status))) return automationError(404, "job_not_available", "Der Auftrag ist nicht für Bildübertragungen geöffnet.");

    const { data: existing } = await supabase.from("purchase_listing_job_images").select("*")
        .eq("company_id", companyId).eq("job_id", jobId).eq("source_drive_item_id", body.sourceDriveItemId).eq("source_e_tag", body.sourceETag).maybeSingle();
    let image = existing as ImageRow | null;
    if (image) {
        if (image.sha256 !== body.sha256 || Number(image.file_size) !== Number(body.fileSize) || image.mime_type !== body.mimeType) return automationError(409, "image_version_conflict", "Dieselbe OneDrive-Bildversion wurde mit abweichendem Inhalt gemeldet.");
        if (image.upload_status === "available") return NextResponse.json({ status: "stored", imageId: image.id, idempotent: true });
    } else {
        const imageId = randomUUID();
        const extension = body.mimeType === "image/jpeg" ? "jpg" : body.mimeType === "image/png" ? "png" : "webp";
        const path = `companies/${companyId}/purchase-listings/${jobId}/${imageId}.${extension}`;
        const { data: inserted, error } = await supabase.from("purchase_listing_job_images").insert({
            id: imageId,
            company_id: companyId,
            job_id: jobId,
            storage_path: path,
            file_name: body.fileName,
            mime_type: body.mimeType,
            file_size: body.fileSize,
            sha256: body.sha256,
            source_drive_item_id: body.sourceDriveItemId,
            source_e_tag: body.sourceETag,
            upload_status: "pending",
        }).select("*").single();
        if (error || !inserted) {
            const { data: concurrent } = await supabase.from("purchase_listing_job_images").select("*")
                .eq("company_id", companyId).eq("job_id", jobId).eq("source_drive_item_id", body.sourceDriveItemId).eq("source_e_tag", body.sourceETag).maybeSingle();
            if (!concurrent) return automationError(500, "image_reservation_failed", "Das Bild konnte nicht zur Übertragung reserviert werden.");
            image = concurrent as ImageRow;
            if (image.sha256 !== body.sha256 || Number(image.file_size) !== Number(body.fileSize) || image.mime_type !== body.mimeType) return automationError(409, "image_version_conflict", "Dieselbe OneDrive-Bildversion wurde mit abweichendem Inhalt gemeldet.");
            if (image.upload_status === "available") return NextResponse.json({ status: "stored", imageId: image.id, idempotent: true });
        } else image = inserted as ImageRow;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || !image) return automationError(500, "storage_not_configured", "Der private Bildspeicher ist nicht konfiguriert.");
    const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUploadUrl(String(image.storage_path), { upsert: false });
    if (signedError || !signed?.signedUrl || !signed.token) return automationError(502, "signed_upload_unavailable", "Ein zeitlich begrenzter privater Uploadzugriff konnte nicht erstellt werden.");
    const uploadUrl = signed.signedUrl.startsWith("http") ? signed.signedUrl : `${supabaseUrl.replace(/\/$/, "")}/storage/v1${signed.signedUrl}`;
    return NextResponse.json({
        status: "upload_required",
        imageId: image.id,
        upload: { method: "PUT", url: uploadUrl, token: signed.token, expiresInSeconds: 7200, headers: { "content-type": String(image.mime_type), "x-upsert": "false" } },
        completeUrl: `/api/automation/purchase-listings/${jobId}/images/complete`,
    }, { status: 201, headers: { "cache-control": "no-store" } });
}

