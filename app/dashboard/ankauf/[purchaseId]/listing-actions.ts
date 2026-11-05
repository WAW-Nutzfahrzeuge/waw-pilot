"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { loadPurchaseListingSource, getListingAutomationConfig, verifyRegistrationFileIsReadable } from "@/lib/purchases/purchase-listing-server";
import { compareVehicleSuggestions, getListingN8nHttpFailure, getListingTextTemplate, listingTemplateVersion, validateListingAcceptanceAck } from "@/lib/purchases/purchase-listing-contract";
import type { ListingJobRecord } from "@/lib/purchases/purchase-listing-server";

export type ListingPreparationActionResult = {
    ok: boolean;
    message: string;
    job: ListingJobRecord | null;
};

const jobSelect = "id, company_id, purchase_case_id, vehicle_id, source_revision, status, source_snapshot, confirmed_vehicle_data, extracted_suggestions, conflicts, missing_fields, title, description, selected_image_ids, manual_revision, result_fingerprint, dispatch_token, lease_expires_at, attempt_count, last_error_code, last_error, created_at, updated_at";
const fail = (message: string): ListingPreparationActionResult => ({ ok: false, message, job: null });

async function requirePurchaseAccess(purchaseId: string) {
    const user = await getCurrentUserContext();
    const companyId = getCurrentCompanyId();
    if (user.companyId !== companyId || !/^[0-9a-f-]{36}$/i.test(purchaseId)) throw new Error("ACCESS_DENIED");
    return { user, companyId };
}

export async function startPurchaseListingPreparation(purchaseId: string): Promise<ListingPreparationActionResult> {
    let user;
    let companyId: string;
    try {
        ({ user, companyId } = await requirePurchaseAccess(purchaseId));
    } catch {
        return fail("Die Einkaufsakte konnte nicht sicher zugeordnet werden.");
    }

    const configuration = getListingAutomationConfig();
    if (!configuration.ok) {
        console.error("[purchase-listing] n8n configuration invalid", {
            errorCode: configuration.missingVariables.length ? "CONFIG_MISSING" : "CONFIG_INVALID",
            missingVariables: configuration.missingVariables,
            invalidVariables: configuration.invalidVariables,
            requestStarted: false,
        });
        const affectedVariables = [...configuration.missingVariables, ...configuration.invalidVariables];
        return fail(affectedVariables.length
            ? `Die n8n-Konfiguration ist unvollständig oder ungültig. Bitte prüfe in Vercel: ${affectedVariables.join(", " )}.`
            : "Die n8n-Konfiguration ist unvollständig oder ungültig. Bitte prüfe die Servervariablen in Vercel.");
    }
    const config = configuration.config;
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 12_000 });
    let source;
    try {
        source = await loadPurchaseListingSource(companyId, purchaseId);
    } catch (error) {
        const code = error instanceof Error ? error.message : "UNKNOWN";
        const messages: Record<string, string> = {
            PURCHASE_NOT_FOUND: "Die Einkaufsakte oder das zugehörige Fahrzeug wurde nicht gefunden.",
            REGISTRATION_MISSING: "In dieser Einkaufsakte fehlt ein abrufbarer Fahrzeugschein. Bitte lade den Fahrzeugschein zuerst hoch.",
            REGISTRATION_LINK_INVALID: "Der Fahrzeugschein ist nicht eindeutig dieser Einkaufsakte zugeordnet. Bitte prüfe die Dokumentzuordnung.",
            ONEDRIVE_FOLDER_MISSING: "Es fehlt die OneDrive-Fahrzeugakte oder der Unterordner „Fahrzeugbilder“. Bitte erstelle oder prüfe ihn zuerst im OneDrive-Bereich.",
            DOCUMENT_LOOKUP_FAILED: "Die Fahrzeugschein-Zuordnung konnte gerade nicht geprüft werden.",
            FOLDER_LOOKUP_FAILED: "Die OneDrive-Zuordnung konnte gerade nicht geprüft werden.",
        };
        console.error("[purchase-listing] source validation failed", { code });
        return fail(messages[code] ?? "Die Fahrzeugdaten konnten gerade nicht geprüft werden.");
    }
    if (!(await verifyRegistrationFileIsReadable(source.registrationDocument.file_path))) {
        return fail("Der hinterlegte Fahrzeugschein ist vorhanden, kann derzeit aber nicht aus dem privaten Dokumentenspeicher gelesen werden.");
    }

    const { data: active, error: activeError } = await supabase.from("purchase_listing_jobs").select(jobSelect)
        .eq("company_id", companyId).eq("purchase_case_id", purchaseId).eq("source_revision", source.sourceRevision)
        .in("status", ["queued", "processing"]).maybeSingle();
    if (activeError) return fail("Der Vorbereitungsauftrag konnte nicht geprüft werden.");
    let job = active as unknown as ListingJobRecord | null;
    if (job?.status === "processing" && job.lease_expires_at && Date.parse(job.lease_expires_at) > Date.now()) {
        return { ok: true, message: "Die Inseratsvorbereitung läuft bereits.", job };
    }

    if (!job) {
        const { data: inserted, error: insertError } = await supabase.from("purchase_listing_jobs").insert({
            company_id: companyId,
            purchase_case_id: source.purchase.id,
            vehicle_id: source.vehicle.id,
            source_revision: source.sourceRevision,
            status: "queued",
            source_snapshot: {
                templateVersion: "waw-mobile-listing-v1",
                purchaseNumber: source.purchase.purchase_number,
                purchaseDate: source.purchase.purchase_date,
                registrationDocument: source.registrationDocument,
                oneDrive: source.folder,
            },
            confirmed_vehicle_data: source.vehicle,
            created_by: user.authUserId,
        }).select(jobSelect).single();
        if (insertError || !inserted) {
            // Another click may have won the active-revision unique constraint.
            const { data: concurrent } = await supabase.from("purchase_listing_jobs").select(jobSelect)
                .eq("company_id", companyId).eq("purchase_case_id", purchaseId).eq("source_revision", source.sourceRevision)
                .in("status", ["queued", "processing"]).maybeSingle();
            if (!concurrent) return fail("Der Vorbereitungsauftrag konnte nicht gespeichert werden.");
            job = concurrent as unknown as ListingJobRecord;
            if (job.status === "processing" && job.lease_expires_at && Date.parse(job.lease_expires_at) > Date.now()) {
                return { ok: true, message: "Die Inseratsvorbereitung läuft bereits.", job };
            }
        } else {
            job = inserted as unknown as ListingJobRecord;
        }
    }

    const { data: claims, error: claimError } = await supabase.rpc("claim_purchase_listing_job", {
        p_job_id: job.id,
        p_company_id: companyId,
        p_lease_seconds: 1800,
    });
    const claimed = Array.isArray(claims) ? claims[0] as ListingJobRecord | undefined : undefined;
    if (claimError || !claimed) {
        const { data: current } = await supabase.from("purchase_listing_jobs").select(jobSelect).eq("id", job.id).eq("company_id", companyId).maybeSingle();
        return { ok: Boolean(current), message: "Der Auftrag läuft bereits oder kann noch nicht erneut gestartet werden.", job: current as unknown as ListingJobRecord | null };
    }
    job = claimed;

    const callbackUrl = `${config.callbackBaseUrl}/api/automation/purchase-listings/${job.id}/callback`;
    const registrationUrl = `${config.callbackBaseUrl}/api/automation/purchase-listings/${job.id}/registration`;
    const template = getListingTextTemplate({ vehicle: source.vehicle });
    const payload = {
        schemaVersion: 1,
        event: "purchase.listing.prepare",
        jobId: job.id,
        purchaseId: source.purchase.id,
        vehicleId: source.vehicle.id,
        sourceRevision: source.sourceRevision,
        dispatchToken: job.dispatch_token,
        templateVersion: listingTemplateVersion,
        textTemplate: template,
        generationRules: [
            "Verwende nur bestätigte Fahrzeugdaten oder Angaben, die im Fahrzeugschein klar lesbar belegt sind.",
            "Keine Fakten ergänzen oder aus typischen Fahrzeugmerkmalen ableiten.",
            "Keine Kilometer, Preise, Steuerbehandlung, Unfallfreiheit, Zustands-, Service-, Aufbauhersteller-, Trommelvolumen- oder Ausstattungsangaben erfinden.",
            "Keine Kontakt- oder Standardwerbetexte ergänzen; Besichtigung und Kontakt bleiben offene Punkte.",
            "Abweichungen bei FIN, Erstzulassung oder technischen Angaben als Konflikt melden und bestätigte Softwaredaten nicht ersetzen.",
            "Fahrzeugschein niemals als Inseratsbild verwenden.",
        ],
        confirmedVehicleData: source.vehicle,
        registrationDocument: {
            documentId: source.registrationDocument.id,
            fileName: source.registrationDocument.file_name,
            mimeType: source.registrationDocument.mime_type,
            fileSize: source.registrationDocument.file_size,
            downloadUrl: registrationUrl,
        },
        oneDriveImages: {
            driveId: source.folder.drive_id,
            folderId: source.folder.images_folder_id,
        },
        imageUploadUrl: `${config.callbackBaseUrl}/api/automation/purchase-listings/${job.id}/images`,
        callbackUrl,
    };
    let requestStarted = false;
    let responseStatus: number | null = null;
    try {
        requestStarted = true;
        console.info("[purchase-listing] n8n dispatch started", { jobId: job.id, requestStarted });
        const response = await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
            body: JSON.stringify(payload),
            cache: "no-store",
            signal: AbortSignal.timeout(8_000),
        });
        responseStatus = response.status;
        console.info("[purchase-listing] n8n dispatch response", { jobId: job.id, requestStarted, httpStatus: responseStatus });
        if (response.status !== 202) {
            const { code, message } = getListingN8nHttpFailure(response.status);
            await supabase.from("purchase_listing_jobs").update({ status: "failed", last_error_code: code,
                last_error: message, lease_expires_at: null, dispatch_token: null, updated_at: new Date().toISOString() })
                .eq("id", job.id).eq("company_id", companyId).eq("dispatch_token", job.dispatch_token).eq("status", "processing");
            console.warn("[purchase-listing] n8n rejected dispatch", { jobId: job.id, errorCode: code, requestStarted, httpStatus: response.status });
            return { ok: false, message, job: { ...job, status: "failed", last_error_code: code, last_error: message } };
        }
        const ack = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!validateListingAcceptanceAck(ack, { jobId: job.id, purchaseId: source.purchase.id, vehicleId: source.vehicle.id, sourceRevision: source.sourceRevision, dispatchToken: String(job.dispatch_token) })) {
            console.warn("[purchase-listing] n8n acceptance response invalid", { jobId: job.id, errorCode: "INVALID_N8N_ACK", requestStarted, httpStatus: response.status });
            const message = "n8n hat HTTP 202 geliefert, aber die Annahmebestätigung passt nicht zum erwarteten Auftrag. Bitte prüfe die n8n-Antwort gemäß API-Vertrag.";
            await supabase.from("purchase_listing_jobs").update({ status: "failed", last_error_code: "INVALID_N8N_ACK",
                last_error: message, lease_expires_at: null, dispatch_token: null, updated_at: new Date().toISOString() })
                .eq("id", job.id).eq("company_id", companyId).eq("dispatch_token", job.dispatch_token).eq("status", "processing");
            return { ok: false, message, job: { ...job, status: "failed", last_error_code: "INVALID_N8N_ACK", last_error: message } };
        }
        // A callback may finish before the acknowledgement reaches us. Read the row again
        // and never move a terminal result back to processing.
        const { data: current } = await supabase.from("purchase_listing_jobs").select(jobSelect).eq("id", job.id).eq("company_id", companyId).maybeSingle();
        revalidatePath(`/dashboard/ankauf/${purchaseId}`);
        return { ok: true, message: "Die Inseratsvorbereitung wurde angenommen.", job: current as unknown as ListingJobRecord | null ?? job };
    } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        // A timeout is ambiguous: n8n might have accepted the stable job. Keep the
        // processing lease and permit retry only after expiry using this same job ID.
        console.error("[purchase-listing] dispatch unavailable", {
            jobId: job.id,
            errorCode: timedOut ? "DISPATCH_TIMEOUT" : "DISPATCH_UNAVAILABLE",
            requestStarted,
            httpStatus: responseStatus,
        });
        revalidatePath(`/dashboard/ankauf/${purchaseId}`);
        return { ok: true, message: timedOut ? "Die Annahmebestätigung dauert noch. Der Auftrag kann bereits laufen; bitte warte auf den Status oder versuche es nach Ablauf der Frist erneut." : "Die Verbindung zu n8n wurde unterbrochen. Der Auftrag kann bereits angenommen worden sein; bitte prüfe den Status vor einem erneuten Versuch.", job };
    }
}

export async function savePurchaseListingDraft(input: {
    purchaseId: string;
    jobId: string;
    expectedManualRevision: number;
    title: string;
    description: string;
    extractedSuggestions: Record<string, string>;
    selectedImageIds: string[];
}): Promise<{ ok: boolean; message: string }> {
    let companyId: string;
    try { ({ companyId } = await requirePurchaseAccess(input.purchaseId)); } catch { return { ok: false, message: "Die Einkaufsakte konnte nicht sicher zugeordnet werden." }; }
    const allowedSuggestionFields = new Set(["manufacturer", "model", "vehicleType", "vin", "firstRegistration", "constructionYear", "mileage", "color"]);
    if (!/^[0-9a-f-]{36}$/i.test(input.jobId) || input.title.length > 180 || input.description.length > 12000 || input.selectedImageIds.length > 100 || new Set(input.selectedImageIds).size !== input.selectedImageIds.length || Object.entries(input.extractedSuggestions).some(([key, value]) => !allowedSuggestionFields.has(key) || typeof value !== "string" || value.length > 500)) {
        return { ok: false, message: "Die Entwurfsdaten sind ungültig oder zu lang." };
    }
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 12_000 });
    const { data: job } = await supabase.from("purchase_listing_jobs").select("id, status, manual_revision, confirmed_vehicle_data")
        .eq("id", input.jobId).eq("company_id", companyId).eq("purchase_case_id", input.purchaseId).maybeSingle();
    if (!job || !["needs_input", "draft_ready"].includes(String(job.status))) return { ok: false, message: "Dieser Entwurf kann aktuell nicht bearbeitet werden." };
    if (Number(job.manual_revision) !== input.expectedManualRevision) return { ok: false, message: "Der Entwurf wurde zwischenzeitlich geändert. Bitte lade den aktuellen Stand und versuche es erneut." };
    if (input.selectedImageIds.length) {
        const { data: images, error } = await supabase.from("purchase_listing_job_images").select("id")
            .eq("company_id", companyId).eq("job_id", input.jobId).eq("upload_status", "available").in("id", input.selectedImageIds);
        if (error || images?.length !== input.selectedImageIds.length) return { ok: false, message: "Mindestens ein ausgewähltes Foto gehört nicht zu diesem Entwurf." };
    }
    const { data: updated, error } = await supabase.from("purchase_listing_jobs").update({
        title: input.title.trim(), description: input.description.trim(), selected_image_ids: input.selectedImageIds,
        extracted_suggestions: input.extractedSuggestions,
        conflicts: compareVehicleSuggestions(job.confirmed_vehicle_data as never, input.extractedSuggestions),
        manual_revision: input.expectedManualRevision + 1, updated_at: new Date().toISOString(),
    }).eq("id", input.jobId).eq("company_id", companyId).eq("purchase_case_id", input.purchaseId)
        .eq("manual_revision", input.expectedManualRevision).in("status", ["needs_input", "draft_ready"]).select("id").maybeSingle();
    if (error || !updated) return { ok: false, message: "Der Entwurf konnte nicht gespeichert werden. Bitte lade den aktuellen Stand." };
    revalidatePath(`/dashboard/ankauf/${input.purchaseId}`);
    return { ok: true, message: "Der Inseratsentwurf wurde gespeichert." };
}
