import { NextResponse } from "next/server";
import { getCurrentCompanyId } from "@/lib/company";
import { automationError } from "@/lib/automation/http";
import { isUuid } from "@/lib/automation/validation";
import { fingerprintListingCallback, validateListingCallback } from "@/lib/purchases/purchase-listing-contract";
import { isListingAutomationRequestAuthorized, loadPurchaseListingSource, type ListingJobRecord } from "@/lib/purchases/purchase-listing-server";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
type Context = { params: Promise<{ jobId: string }> };
const jobSelect = "id, company_id, purchase_case_id, vehicle_id, source_revision, contract_version, status, source_snapshot, confirmed_vehicle_data, extracted_suggestions, conflicts, missing_fields, title, description, selected_image_ids, manual_revision, result_fingerprint, dispatch_token, lease_expires_at, attempt_count, last_error_code, last_error, created_at, updated_at";

export async function POST(request: Request, context: Context) {
    if (!isListingAutomationRequestAuthorized(request)) return automationError(401, "unauthorized", "Automatisierungszugang ungültig.");
    const { jobId } = await context.params;
    if (!isUuid(jobId)) return automationError(422, "invalid_job_id", "Die Auftrags-ID ist ungültig.");
    const body = await request.json().catch(() => null);
    if (!body) return automationError(400, "invalid_json", "Der Callback enthält kein gültiges JSON.");
    const companyId = getCurrentCompanyId();
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 20_000 });
    const { data: jobData } = await supabase.from("purchase_listing_jobs").select(jobSelect)
        .eq("id", jobId).eq("company_id", companyId).maybeSingle();
    if (!jobData) return automationError(404, "job_not_found", "Der Vorbereitungsauftrag wurde nicht gefunden.");
    const job = jobData as unknown as ListingJobRecord;
    const dispatchToken = typeof (body as Record<string, unknown>).dispatchToken === "string" ? String((body as Record<string, unknown>).dispatchToken) : "";
    if (!job.dispatch_token || dispatchToken !== job.dispatch_token) return automationError(409, "stale_callback", "Dieser Callback gehört zu einem abgelösten Auftragsversuch.");
    if (!["queued", "processing"].includes(job.status)) {
        if (job.result_fingerprint === fingerprintListingCallback(body)) return NextResponse.json({ status: "stored", jobId, idempotent: true });
        return automationError(409, "job_already_completed", "Der Auftrag ist bereits abgeschlossen; spätere Ergebnisse werden nicht übernommen.");
    }

    let currentSource;
    try {
        currentSource = await loadPurchaseListingSource(companyId, job.purchase_case_id, job.contract_version === 2 ? 2 : 1);
    } catch {
        return automationError(409, "source_no_longer_available", "Die Quelldaten sind inzwischen nicht mehr vollständig verfügbar.");
    }
    if (currentSource.sourceRevision !== job.source_revision) return automationError(409, "source_revision_changed", "Die Quelldaten haben sich seit dem Auftrag geändert. Bitte bereite den Entwurf erneut vor.");

    const { data: imageRows, error: imageError } = await supabase.from("purchase_listing_job_images").select("id")
        .eq("company_id", companyId).eq("job_id", job.id).eq("upload_status", "available");
    if (imageError) return automationError(500, "image_lookup_failed", "Die gespeicherten Bildversionen konnten nicht geprüft werden.");
    const validated = validateListingCallback(body, { job, dispatchToken, imageIds: new Set((imageRows ?? []).map((image) => String(image.id))) });
    if (!validated.ok) return automationError(validated.code === "identity_conflict" ? 409 : 422, validated.code, "Die Callback-Daten sind ungültig oder gehören nicht zu diesem Auftrag.");

    const result = validated.result;
    const values = result.status === "failed"
        ? { status: "failed", last_error_code: result.errorCode, last_error: getPublicListingError(result.errorCode), result_fingerprint: result.fingerprint }
        : {
            status: result.status,
            extracted_suggestions: result.suggestions,
            conflicts: result.conflicts,
            missing_fields: result.missingFields,
            title: result.title,
            description: result.description,
            selected_image_ids: result.selectedImageIds,
            result_fingerprint: result.fingerprint,
            last_error_code: null,
            last_error: null,
        };
    const { data: updated, error } = await supabase.from("purchase_listing_jobs").update({
        ...values,
        lease_expires_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("company_id", companyId).eq("source_revision", job.source_revision)
        .eq("dispatch_token", dispatchToken).eq("manual_revision", 0).in("status", ["queued", "processing"]).select("id").maybeSingle();
    if (error) return automationError(500, "callback_save_failed", "Das Ergebnis konnte nicht dauerhaft gespeichert werden.");
    if (!updated) {
        const { data: current } = await supabase.from("purchase_listing_jobs").select("status, result_fingerprint, manual_revision")
            .eq("id", job.id).eq("company_id", companyId).maybeSingle();
        if (current?.result_fingerprint === result.fingerprint) return NextResponse.json({ status: "stored", jobId, idempotent: true });
        return automationError(409, "callback_superseded", "Der Entwurf wurde zwischenzeitlich abgeschlossen oder manuell geändert.");
    }
    return NextResponse.json({ status: "stored", jobId, resultStatus: result.status }, { status: 201, headers: { "cache-control": "no-store" } });
}

function getPublicListingError(code: string): string {
    const messages: Record<string, string> = {
        ONEDRIVE_ACCESS_DENIED: "Der OneDrive-Bilderordner kann mit der n8n-Verbindung nicht gelesen werden. Bitte prüfe die OneDrive-Berechtigung.",
        ONEDRIVE_TIMEOUT: "Der OneDrive-Bilderordner konnte gerade nicht geprüft werden. Bitte versuche es erneut.",
        ONEDRIVE_FOLDER_MISSING: "Der OneDrive-Bilderordner ist nicht vorhanden. Bitte prüfe oder erstelle die OneDrive-Fahrzeugakte.",
        REGISTRATION_UNREADABLE: "Der Fahrzeugschein konnte von n8n nicht verarbeitet werden. Bitte prüfe die Datei und versuche es erneut.",
        OCR_FAILED: "Der Fahrzeugschein konnte nicht zuverlässig ausgelesen werden. Bitte prüfe die Datei und versuche es erneut.",
        PROCESSING_TIMEOUT: "Die Inseratsvorbereitung hat zu lange gedauert. Du kannst sie erneut starten.",
        PROCESSING_FAILED: "Die Inseratsvorbereitung konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
    };
    return messages[code] ?? messages.PROCESSING_FAILED;
}
