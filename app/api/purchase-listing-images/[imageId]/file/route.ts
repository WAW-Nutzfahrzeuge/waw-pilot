import { NextResponse } from "next/server";
import { getOptionalCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { isUuid } from "@/lib/automation/validation";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
type Context = { params: Promise<{ imageId: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getOptionalCurrentUserContext();
    const companyId = getCurrentCompanyId();
    const { imageId } = await context.params;
    if (!user || user.companyId !== companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
    if (!isUuid(imageId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 20_000 });
    const { data: image } = await supabase.from("purchase_listing_job_images").select("company_id, storage_path, mime_type, file_name, upload_status")
        .eq("id", imageId).eq("company_id", companyId).eq("upload_status", "available").maybeSingle();
    if (!image) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
    const { data: file, error } = await supabase.storage.from("documents").download(image.storage_path);
    if (error || !file) return NextResponse.json({ error: "file_unavailable" }, { status: 404, headers: { "cache-control": "no-store" } });
    const mime = ["image/jpeg", "image/png", "image/webp"].includes(String(image.mime_type)) ? String(image.mime_type) : "application/octet-stream";
    return new Response(file.stream(), { headers: {
        "content-type": mime,
        "content-length": String(file.size),
        "content-disposition": `inline; filename="${String(image.file_name).replace(/[\"\r\n]/g, "")}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
    } });
}
