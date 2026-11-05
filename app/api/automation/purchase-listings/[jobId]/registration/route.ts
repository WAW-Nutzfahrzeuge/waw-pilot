import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/company";
import { isListingAutomationRequestAuthorized } from "@/lib/purchases/purchase-listing-server";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { isUuid } from "@/lib/automation/validation";

export const runtime = "nodejs";
export const maxDuration = 30;
type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
    if (!isListingAutomationRequestAuthorized(request)) return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401, headers: { "cache-control": "no-store" } });
    const { jobId } = await context.params;
    if (!isUuid(jobId)) return NextResponse.json({ error: { code: "invalid_job_id" } }, { status: 422, headers: { "cache-control": "no-store" } });
    const companyId = getCurrentCompanyId();
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 20_000 });
    const { data: job } = await supabase.from("purchase_listing_jobs").select("id, company_id, purchase_case_id, vehicle_id, source_revision, status, source_snapshot")
        .eq("id", jobId).eq("company_id", companyId).maybeSingle();
    if (!job || !["queued", "processing"].includes(String(job.status))) return NextResponse.json({ error: { code: "job_not_available" } }, { status: 404, headers: { "cache-control": "no-store" } });
    const doc = (job.source_snapshot as { registrationDocument?: { id?: string; file_path?: string; mime_type?: string; file_name?: string } }).registrationDocument;
    if (!doc?.id || !doc.file_path) return NextResponse.json({ error: { code: "registration_source_missing" } }, { status: 409, headers: { "cache-control": "no-store" } });
    const { data: current } = await supabase.from("documents").select("id, company_id, purchase_case_id, vehicle_id, document_type, status, file_path, mime_type")
        .eq("id", doc.id).eq("company_id", companyId).maybeSingle();
    if (!current || current.document_type !== "vehicle_registration" || current.status !== "available" || current.file_path !== doc.file_path ||
        (current.purchase_case_id !== job.purchase_case_id && current.vehicle_id !== job.vehicle_id)) {
        return NextResponse.json({ error: { code: "registration_source_changed" } }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    const { data: file, error } = await supabase.storage.from("documents").download(current.file_path);
    if (error || !file || file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: { code: "registration_file_unavailable" } }, { status: 404, headers: { "cache-control": "no-store" } });
    const mimeType = current.mime_type === "application/pdf" || current.mime_type === "image/jpeg" || current.mime_type === "image/png"
        ? current.mime_type : "application/octet-stream";
    return new Response(file.stream(), { status: 200, headers: {
        "content-type": mimeType,
        "content-length": String(file.size),
        "content-disposition": `inline; filename="registration-${job.id}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
    } });
}
