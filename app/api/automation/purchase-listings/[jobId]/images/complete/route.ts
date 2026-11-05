import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/company";
import { automationError } from "@/lib/automation/http";
import { isUuid } from "@/lib/automation/validation";
import { calculateImageHash, isListingAutomationRequestAuthorized } from "@/lib/purchases/purchase-listing-server";
import { inspectListingImageBytes } from "@/lib/purchases/purchase-listing-contract";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ jobId: string }> };
type ImageRow = { id: string; company_id: string; job_id: string; storage_path: string; mime_type: string; file_size: number; sha256: string; upload_status: "pending" | "available" };

export async function POST(request: Request, context: Context) {
    if (!isListingAutomationRequestAuthorized(request)) return automationError(401, "unauthorized", "Automatisierungszugang ungültig.");
    const { jobId } = await context.params;
    if (!isUuid(jobId)) return automationError(422, "invalid_job_id", "Die Auftrags-ID ist ungültig.");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.imageId !== "string" || !isUuid(body.imageId)) return automationError(422, "invalid_image_id", "Die Bild-ID ist ungültig.");
    const companyId = getCurrentCompanyId();
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 20_000 });
    const { data: image } = await supabase.from("purchase_listing_job_images").select("id, company_id, job_id, storage_path, mime_type, file_size, sha256, upload_status")
        .eq("id", body.imageId).eq("job_id", jobId).eq("company_id", companyId).maybeSingle() as { data: ImageRow | null };
    if (!image) return automationError(404, "image_not_found", "Das reservierte Bild wurde nicht gefunden.");
    if (image.upload_status === "available") return NextResponse.json({ status: "stored", imageId: image.id, idempotent: true }, { headers: { "cache-control": "no-store" } });
    const { data: file, error: downloadError } = await supabase.storage.from("documents").download(image.storage_path);
    if (downloadError || !file || file.size !== image.file_size) {
        await supabase.storage.from("documents").remove([image.storage_path]);
        return automationError(409, "image_upload_incomplete", "Das Bild ist nicht vollständig im privaten Speicher angekommen.");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (calculateImageHash(bytes) !== image.sha256) {
        await supabase.storage.from("documents").remove([image.storage_path]);
        return automationError(409, "image_checksum_mismatch", "Die gespeicherte Bilddatei stimmt nicht mit der angekündigten Prüfsumme überein.");
    }
    const inspected = await inspectListingImageBytes(bytes, image.mime_type);
    if (!inspected.valid) {
        await supabase.storage.from("documents").remove([image.storage_path]);
        return automationError(415, "invalid_image_content", "Die Bilddatei ist beschädigt oder ihr Inhalt passt nicht zum angegebenen Dateityp.");
    }
    const { data: updated, error } = await supabase.from("purchase_listing_job_images").update({ upload_status: "available" })
        .eq("id", image.id).eq("company_id", companyId).eq("job_id", jobId).eq("upload_status", "pending").select("id").maybeSingle();
    if (error) return automationError(500, "image_registration_failed", "Das gespeicherte Bild konnte nicht registriert werden.");
    return NextResponse.json({ status: "stored", imageId: image.id, idempotent: !updated }, { status: 200, headers: { "cache-control": "no-store" } });
}
