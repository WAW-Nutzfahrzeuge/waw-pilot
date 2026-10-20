import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { isUuid } from "@/lib/automation/validation";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ intakeId: string }> };

export async function GET(request: Request, context: RouteContext) {
    const user = await getCurrentUserContext();
    if (user.profile.role !== "admin" || user.companyId !== getCurrentCompanyId()) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { intakeId } = await context.params;
    if (!isUuid(intakeId)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const kind = new URL(request.url).searchParams.get("kind") ?? "document";
    const supabase = createAutomationSupabaseClient();
    const { data: intake } = await supabase.from("automation_owner_id_intakes")
        .select("id, original_upload_id, derived_storage_bucket, derived_storage_path, derived_file_name, derived_mime_type, original_file_name")
        .eq("id", intakeId).eq("company_id", user.companyId).maybeSingle();
    if (!intake) return NextResponse.json({ error: "not_found" }, { status: 404 });
    let bucket: string | null = null;
    let path: string | null = null;
    let fileName = "Ausweis.pdf";
    let mimeType = "application/pdf";
    if (kind === "original") {
        const { data: original } = await supabase.from("automation_return_uploads")
            .select("storage_bucket, storage_path, original_file_name, mime_type")
            .eq("id", intake.original_upload_id).eq("company_id", user.companyId).eq("upload_kind", "original").maybeSingle();
        bucket = original?.storage_bucket ?? "documents";
        path = original?.storage_path ?? null;
        fileName = original?.original_file_name ?? intake.original_file_name ?? "Original";
        mimeType = original?.mime_type ?? "application/octet-stream";
    } else if (kind === "document") {
        bucket = intake.derived_storage_bucket ?? null;
        path = intake.derived_storage_path ?? null;
        fileName = intake.derived_file_name ?? "Ausweis.pdf";
        mimeType = intake.derived_mime_type ?? "application/pdf";
    } else return NextResponse.json({ error: "invalid_file_kind" }, { status: 400 });
    if (!bucket || !path) return NextResponse.json({ error: "file_unavailable" }, { status: 404 });
    const { data: file, error } = await supabase.storage.from(bucket).download(path);
    if (error || !file) return NextResponse.json({ error: "file_unavailable" }, { status: 404 });
    const safeName = fileName.replace(/[\r\n"\\]/g, "_");
    return new Response(await file.arrayBuffer(), {
        headers: {
            "content-type": mimeType,
            "content-disposition": `inline; filename="${safeName}"`,
            "cache-control": "private, no-store, max-age=0",
            "x-content-type-options": "nosniff",
        },
    });
}
