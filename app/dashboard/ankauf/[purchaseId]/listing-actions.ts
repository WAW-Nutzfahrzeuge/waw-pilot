"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { loadPurchaseListingSource, getListingAutomationConfig, verifyRegistrationFileIsReadable } from "@/lib/purchases/purchase-listing-server";
import { compareVehicleSuggestions, getListingN8nHttpFailure, getWawListingTemplateV2, listingContractVersion, listingTemplateVersion, sanitizeListingSuggestions, toPublicListingVehicleData, validateListingAcceptanceAck } from "@/lib/purchases/purchase-listing-contract";
import type { ListingJobRecord } from "@/lib/purchases/purchase-listing-server";

export type ListingPreparationActionResult = {
    ok: boolean;
    message: string;
    job: ListingJobRecord | null;
};

const jobSelect = "id, company_id, purchase_case_id, vehicle_id, source_revision, contract_version, status, source_snapshot, confirmed_vehicle_data, extracted_suggestions, conflicts, missing_fields, title, description, selected_image_ids, manual_revision, result_fingerprint, dispatch_token, lease_expires_at, attempt_count, last_error_code, last_error, created_at, updated_at";
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
                contractVersion: listingContractVersion,
                templateVersion: listingTemplateVersion,
                purchaseNumber: source.purchase.purchase_number,
                purchaseDate: source.purchase.purchase_date,
                registrationDocument: source.registrationDocument,
                oneDrive: source.folder,
                databaseListingDetails: source.databaseListingDetails,
            },
            confirmed_vehicle_data: toPublicListingVehicleData(source.vehicle),
            contract_version: listingContractVersion,
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
    const template = getWawListingTemplateV2({
        manufacturer: source.vehicle.manufacturer,
        model: source.vehicle.model,
        vehicleType: source.vehicle.vehicleType,
        vehicleCategory: source.vehicle.vehicleCategory,
        vin: source.vehicle.vin,
        firstRegistration: source.vehicle.firstRegistration,
        constructionYear: source.vehicle.constructionYear,
        mileage: source.vehicle.mileage,
        color: source.vehicle.color,
        listingDetails: source.vehicle.listingDetails,
    });
    const payload = {
        schemaVersion: 1,
        contractVersion: listingContractVersion,
        event: "purchase.listing.prepare",
        jobId: job.id,
        purchaseId: source.purchase.id,
        vehicleId: source.vehicle.id,
        sourceRevision: source.sourceRevision,
        dispatchToken: job.dispatch_token,
        templateVersion: listingTemplateVersion,
        textTemplate: template,
        generationRules: [
            "Verwende im öffentlichen Text ausschließlich bestätigte Softwaredaten aus confirmedVehicleData und textTemplate.",
            "Keine Fakten ergänzen oder aus typischen Fahrzeugmerkmalen ableiten.",
            "Keine Kilometer, Preise, Steuerbehandlung, Unfallfreiheit, Zustands-, Service-, Aufbauhersteller-, Trommelvolumen- oder Ausstattungsangaben erfinden.",
            "Keine Kontakt- oder Standardwerbetexte ergänzen; Besichtigung und Kontakt bleiben offene Punkte.",
            "Abweichungen bei FIN, Erstzulassung oder technischen Angaben als Konflikt melden und bestätigte Softwaredaten nicht ersetzen.",
            "Fahrzeugschein niemals als Inseratsbild verwenden.",
            "Nutze für den öffentlichen Titel und Beschreibungstext ausschließlich confirmedVehicleData und textTemplate; extractedSuggestions sind unbestätigt und dürfen nicht als Tatsachen in den Text gelangen.",
            "Gib Klartext ohne Markdown-Tabelle, HTML, dekorative Trennlinie oder Emoji aus. Keine Platzhalter oder internen Prüfanweisungen in der Beschreibung.",
            "Titel beginnt mit Hersteller und Modell, enthält höchstens zwei Trennzeichen ' | ' und weder FIN noch interne Nummer, Preis oder Telefonnummer.",
        ],
        confirmedVehicleData: toPublicListingVehicleData(source.vehicle),
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
    try {
        const response = await fetch(config.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
            body: JSON.stringify(payload),
            cache: "no-store",
            signal: AbortSignal.timeout(8_000),
        });
        if (response.status !== 202) {
            const { code, message } = getListingN8nHttpFailure(response.status);
            await supabase.from("purchase_listing_jobs").update({ status: "failed", last_error_code: code,
                last_error: message, lease_expires_at: null, dispatch_token: null, updated_at: new Date().toISOString() })
                .eq("id", job.id).eq("company_id", companyId).eq("dispatch_token", job.dispatch_token).eq("status", "processing");
            return { ok: false, message, job: { ...job, status: "failed", last_error_code: code, last_error: message } };
        }
        const ack = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!validateListingAcceptanceAck(ack, { jobId: job.id, purchaseId: source.purchase.id, vehicleId: source.vehicle.id, sourceRevision: source.sourceRevision, dispatchToken: String(job.dispatch_token), contractVersion: listingContractVersion })) {
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
    if (!/^[0-9a-f-]{36}$/i.test(input.jobId) || typeof input.title !== "string" || typeof input.description !== "string" || !Array.isArray(input.selectedImageIds) || !input.extractedSuggestions || typeof input.extractedSuggestions !== "object" || input.title.length > 180 || input.description.length > 12000 || input.selectedImageIds.length > 100 || input.selectedImageIds.some((id) => typeof id !== "string") || new Set(input.selectedImageIds).size !== input.selectedImageIds.length || Object.entries(input.extractedSuggestions).some(([, value]) => typeof value !== "string" || value.length > 500)) {
        return { ok: false, message: "Die Entwurfsdaten sind ungültig oder zu lang." };
    }
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 12_000 });
    const { data: job } = await supabase.from("purchase_listing_jobs").select("id, contract_version, status, manual_revision, confirmed_vehicle_data")
        .eq("id", input.jobId).eq("company_id", companyId).eq("purchase_case_id", input.purchaseId).maybeSingle();
    if (!job || !["needs_input", "draft_ready"].includes(String(job.status))) return { ok: false, message: "Dieser Entwurf kann aktuell nicht bearbeitet werden." };
    const allowedSuggestionFields = job.contract_version === 2
        ? new Set(["manufacturer", "model", "vin", "firstRegistration", "constructionYear", "enginePowerKw", "transmission", "emissionClass", "axleFormula", "frontSuspension", "rearSuspension", "grossVehicleWeightKg", "curbWeightKg", "payloadKg", "wheelbaseMm", "huUntil", "spUntil", "color"])
        : new Set(["manufacturer", "model", "vehicleType", "vin", "firstRegistration", "constructionYear", "mileage", "color"]);
    if (Object.keys(input.extractedSuggestions).some((key) => !allowedSuggestionFields.has(key))) return { ok: false, message: "Der Vorschlag enthält ein Feld, das für diesen Auftragsstand nicht zugelassen ist." };
    if (Number(job.manual_revision) !== input.expectedManualRevision) return { ok: false, message: "Der Entwurf wurde zwischenzeitlich geändert. Bitte lade den aktuellen Stand und versuche es erneut." };
    if (input.selectedImageIds.length) {
        const { data: images, error } = await supabase.from("purchase_listing_job_images").select("id")
            .eq("company_id", companyId).eq("job_id", input.jobId).eq("upload_status", "available").in("id", input.selectedImageIds);
        if (error || images?.length !== input.selectedImageIds.length) return { ok: false, message: "Mindestens ein ausgewähltes Foto gehört nicht zu diesem Entwurf." };
    }
    const savedSuggestions: Record<string, string | number> = { ...input.extractedSuggestions };
    if (job.contract_version === 2) {
        const numericFields = new Set(["constructionYear", "enginePowerKw", "grossVehicleWeightKg", "curbWeightKg", "payloadKg", "wheelbaseMm"]);
        for (const field of numericFields) {
            if (typeof savedSuggestions[field] === "string" && savedSuggestions[field]) {
                const number = Number(String(savedSuggestions[field]).replace(",", "."));
                if (!Number.isFinite(number) || number < 0) return { ok: false, message: `Der Vorschlag „${field}“ muss eine gültige Zahl sein.` };
                savedSuggestions[field] = number;
            }
        }
    }
    const { data: updated, error } = await supabase.from("purchase_listing_jobs").update({
        title: input.title.trim(), description: input.description.trim(), selected_image_ids: input.selectedImageIds,
        extracted_suggestions: savedSuggestions,
        conflicts: compareVehicleSuggestions(job.confirmed_vehicle_data as never, savedSuggestions),
        manual_revision: input.expectedManualRevision + 1, updated_at: new Date().toISOString(),
    }).eq("id", input.jobId).eq("company_id", companyId).eq("purchase_case_id", input.purchaseId)
        .eq("manual_revision", input.expectedManualRevision).in("status", ["needs_input", "draft_ready"]).select("id").maybeSingle();
    if (error || !updated) return { ok: false, message: "Der Entwurf konnte nicht gespeichert werden. Bitte lade den aktuellen Stand." };
    revalidatePath(`/dashboard/ankauf/${input.purchaseId}`);
    return { ok: true, message: "Der Inseratsentwurf wurde gespeichert." };
}

export async function confirmPurchaseListingSuggestions(input: {
    purchaseId: string;
    jobId: string;
    expectedSourceRevision: string;
    expectedManualRevision: number;
    selectedFields: string[];
}): Promise<{ ok: boolean; message: string }> {
    let user;
    let companyId: string;
    try { ({ user, companyId } = await requirePurchaseAccess(input.purchaseId)); }
    catch { return { ok: false, message: "Die Einkaufsakte konnte nicht sicher zugeordnet werden." }; }
    if (!/^[0-9a-f-]{36}$/i.test(input.jobId) || !/^[a-f0-9]{64}$/i.test(input.expectedSourceRevision) || !Array.isArray(input.selectedFields) || !input.selectedFields.length || input.selectedFields.some((field) => typeof field !== "string") || new Set(input.selectedFields).size !== input.selectedFields.length) {
        return { ok: false, message: "Die Auswahl der Vorschläge ist ungültig." };
    }
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 15_000 });
    const { data: job, error: jobError } = await supabase.from("purchase_listing_jobs")
        .select("id, contract_version, source_revision, status, manual_revision, confirmed_vehicle_data, extracted_suggestions")
        .eq("id", input.jobId).eq("company_id", companyId).eq("purchase_case_id", input.purchaseId).maybeSingle();
    if (jobError || !job || job.contract_version !== 2 || !["needs_input", "draft_ready"].includes(String(job.status))) {
        return { ok: false, message: "Nur ein aktueller Entwurf aus dem neuen Vertragsstand kann Fahrzeugdaten übernehmen." };
    }
    if (job.source_revision !== input.expectedSourceRevision || Number(job.manual_revision) !== input.expectedManualRevision) {
        return { ok: false, message: "Quelldaten oder Entwurf wurden zwischenzeitlich geändert. Bitte lade die aktuelle Vorschau." };
    }
    try {
        const currentSource = await loadPurchaseListingSource(companyId, input.purchaseId, 2);
        if (currentSource.sourceRevision !== job.source_revision) return { ok: false, message: "Die Fahrzeugdaten haben sich seit der Vorschau geändert. Bitte erstelle eine neue Vorschau." };
    } catch {
        return { ok: false, message: "Die Quelldaten können gerade nicht geprüft werden. Es wurden keine Fahrzeugdaten geändert." };
    }
    const sanitized = sanitizeListingSuggestions(job.extracted_suggestions, 2);
    const selected = input.selectedFields;
    if (selected.some((field) => !(field in sanitized))) return { ok: false, message: "Mindestens ein ausgewählter Vorschlag fehlt oder hat ein ungültiges Format." };
    const numericFields = new Set(["constructionYear", "enginePowerKw", "grossVehicleWeightKg", "curbWeightKg", "payloadKg", "wheelbaseMm"]);
    const normalized: Record<string, string | number> = {};
    for (const field of selected) {
        const proposed = sanitized[field];
        if (proposed === undefined || proposed === "") return { ok: false, message: "Leere Vorschläge können nicht übernommen werden." };
        if (numericFields.has(field) && typeof proposed !== "number") return { ok: false, message: `Der Vorschlag „${field}“ hat kein gültiges Zahlenformat.` };
        normalized[field] = proposed;
    }
    const { error } = await supabase.rpc("confirm_purchase_listing_suggestions", {
        p_company_id: companyId,
        p_purchase_case_id: input.purchaseId,
        p_job_id: input.jobId,
        p_expected_source_revision: input.expectedSourceRevision,
        p_expected_manual_revision: input.expectedManualRevision,
        p_confirmed_by: user.authUserId,
        p_selected_fields: selected,
        p_suggestions: normalized,
    });
    if (error) {
        const message = error.code === "40001"
            ? "Die Fahrzeugdaten wurden zwischenzeitlich geändert. Bitte lade die Akte neu."
            : "Die ausgewählten Vorschläge konnten nicht übernommen werden. Bitte prüfe die Werte und versuche es erneut.";
        return { ok: false, message };
    }
    revalidatePath(`/dashboard/ankauf/${input.purchaseId}`);
    return { ok: true, message: "Die ausgewählten Vorschläge wurden nach deiner Bestätigung in die Fahrzeugakte übernommen." };
}
