import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    compareVehicleSuggestions,
    buildPurchaseListingSourceRevision,
    fingerprintListingCallback,
    getListingN8nHttpFailure,
    getListingTextTemplate,
    getWawListingTemplateV2,
    inspectListingImageBytes,
    isListingJobLeaseExpired,
    isSupportedListingImageMime,
    isValidListingAutomationToken,
    stableListingRevision,
    toPublicListingVehicleData,
    validateWawPublicListingText,
    validateListingAcceptanceAck,
    validateListingAutomationEnvironment,
    validateListingCallback,
} from "../lib/purchases/purchase-listing-contract.ts";
import sharp from "sharp";

const vehicle = {
    manufacturer: "Mercedes-Benz", model: "Actros 1845", vehicleType: "Sattelzugmaschine",
    vehicleCategory: "LKW", vin: "WDB123", firstRegistration: "2022-02-03", constructionYear: 2022,
    mileage: null, color: null, purchaseNotes: null, damageNotes: null,
};

test("listing source revision is stable regardless of object key order", () => {
    assert.equal(stableListingRevision({ a: 1, b: { x: true, y: 2 } }), stableListingRevision({ b: { y: 2, x: true }, a: 1 }));
});

test("WAW listing template uses known facts only and leaves missing sales facts open", () => {
    const draft = getListingTextTemplate({ vehicle });
    assert.equal(draft.title, "Mercedes-Benz Actros 1845 Sattelzugmaschine");
    assert.match(draft.description, /Erstzulassung: 2022-02-03/);
    assert.doesNotMatch(draft.description, /unfallfrei|MwSt|Verkaufspreis|Trommelvolumen/i);
    assert.ok(draft.openPoints.includes("Kilometerstand prüfen"));
});

test("WAW v2 template builds a compact vehicle-specific title and plain-text sections", () => {
    const listingDetails = {
        enginePowerKw: 301, transmission: "Automatik", emissionClass: "Euro VI", cab: "Highline",
        retarder: "Retarder", hydraulics: "Kipphydraulik", axleFormula: "8x4", frontSuspension: null,
        rearSuspension: "Luftfederung", grossVehicleWeightKg: 32000, curbWeightKg: null, payloadKg: null,
        wheelbaseMm: null, huUntil: null, spUntil: null, bodyManufacturer: "Stetter", bodyType: "Betonmischer",
        bodyYear: null, mixerNominalVolumeM3: 9, mixerDrive: null, waterTankLiters: null, bodyControls: null,
        includedAccessories: null, equipment: "Klimaanlage\nRückfahrkamera", vehicleCondition: "Gebrauchter Zustand",
        bodyCondition: null, knownDamages: "Lackschaden bekannt", maintenanceHistory: null, repairHistory: null,
        vehicleLocation: null, availabilityConfirmed: false,
    };
    const draft = getWawListingTemplateV2({ ...vehicle, vehicleType: "Betonmischer", listingDetails });
    assert.equal(draft.title, "Mercedes-Benz Actros 1845 | 8x4 | Stetter Betonmischer 9 m³");
    assert.match(draft.description, /FAHRZEUGDATEN\n• Fahrzeugart: Betonmischer/);
    assert.match(draft.description, /BETONMISCHERAUFBAU/);
    assert.match(draft.description, /AUSSTATTUNG\n• Klimaanlage\n• Rückfahrkamera/);
    assert.match(draft.description, /Bekannte Schäden und Einschränkungen: Lackschaden bekannt/);
    assert.doesNotMatch(draft.description, /<[^>]+>|\|.*\||Noch nicht angegeben|Bitte .* ergänzen/);
    assert.equal(validateWawPublicListingText(draft.title, draft.description, { ...vehicle, vehicleType: "Betonmischer" }), true);
    assert.equal(getWawListingTemplateV2({ ...vehicle, manufacturer: "", listingDetails }).title, "");
});

test("v2 outbound vehicle data excludes internal notes and cannot infer contact or private details", () => {
    const outbound = toPublicListingVehicleData({ ...vehicle, id: "vehicle-id", listingDetails: { knownDamages: "confirmed damage" } as never });
    assert.equal("purchaseNotes" in outbound, false);
    assert.equal("damageNotes" in outbound, false);
    assert.equal("notes" in outbound, false);
    assert.equal("purchasePrice" in outbound, false);
    assert.equal(outbound.listingDetails.knownDamages, "confirmed damage");
});

test("v1 source revisions remain stable for old jobs while v2 revisions include listing-specific facts, not private notes", () => {
    const details = { transmission: "Automatik" } as never;
    const input = {
        purchase: { id: "purchase", purchaseNumber: "EK-1", purchaseDate: "2026-01-01" },
        vehicle: { ...vehicle, id: "vehicle", listingDetails: details },
        databaseListingDetails: details,
        registration: { id: "document", filePath: "private/path", createdAt: "2026-01-01", fileSize: 10 },
        oneDrive: { driveId: "drive", folderId: "folder", imagesFolderId: "images" },
    };
    const v1Before = buildPurchaseListingSourceRevision({ ...input, contractVersion: 1 });
    const v1AfterDetailsChange = buildPurchaseListingSourceRevision({ ...input, contractVersion: 1, vehicle: { ...input.vehicle, listingDetails: { transmission: "Schaltgetriebe" } as never } });
    assert.equal(v1Before, v1AfterDetailsChange);
    const v2Before = buildPurchaseListingSourceRevision({ ...input, contractVersion: 2 });
    const v2AfterDetailsChange = buildPurchaseListingSourceRevision({ ...input, contractVersion: 2, vehicle: { ...input.vehicle, listingDetails: { transmission: "Schaltgetriebe" } as never }, databaseListingDetails: { transmission: "Schaltgetriebe" } });
    assert.notEqual(v2Before, v2AfterDetailsChange);
    assert.notEqual(v2Before, v1Before);
});

test("vehicle registration conflicts are identified without replacing confirmed values", () => {
    const conflicts = compareVehicleSuggestions(vehicle, { vin: "WDB999", firstRegistration: "2021-01-01", mileage: 120000 });
    assert.deepEqual(conflicts.map(({ field }) => field), ["vin", "firstRegistration"]);
    assert.equal(vehicle.vin, "WDB123");
});

test("acceptance response must be HTTP-202 contract complete and match all job identity fields", () => {
    const identity = { jobId: "job", purchaseId: "purchase", vehicleId: "vehicle", sourceRevision: "rev", dispatchToken: "lease" };
    assert.equal(validateListingAcceptanceAck({ status: "accepted", ...identity }, identity), true);
    assert.equal(validateListingAcceptanceAck({ status: "accepted", ...identity, vehicleId: "other" }, identity), false);
    assert.equal(validateListingAcceptanceAck({ status: "accepted", ...identity, dispatchToken: "old" }, identity), false);
    assert.equal(validateListingAcceptanceAck({ status: "accepted", contractVersion: 2, ...identity }, { ...identity, contractVersion: 2 }), true);
    assert.equal(validateListingAcceptanceAck({ status: "accepted", ...identity }, { ...identity, contractVersion: 2 }), false);
});

test("listing automation configuration reports only missing or invalid variable names", () => {
    const missing = validateListingAutomationEnvironment({
        N8N_VEHICLE_LISTING_WEBHOOK_URL: "https://n8n.example/webhook/listing",
        N8N_VEHICLE_LISTING_TOKEN: "",
        N8N_VEHICLE_LISTING_CALLBACK_BASE_URL: "https://waw.example",
    });
    assert.deepEqual(missing, {
        ok: false,
        missingVariables: ["N8N_VEHICLE_LISTING_TOKEN"],
        invalidVariables: [],
    });

    const invalid = validateListingAutomationEnvironment({
        N8N_VEHICLE_LISTING_WEBHOOK_URL: "http://n8n.example/webhook/listing",
        N8N_VEHICLE_LISTING_TOKEN: "test-token",
        N8N_VEHICLE_LISTING_CALLBACK_BASE_URL: "https://waw.example/dashboard",
    });
    assert.deepEqual(invalid, {
        ok: false,
        missingVariables: [],
        invalidVariables: ["N8N_VEHICLE_LISTING_WEBHOOK_URL", "N8N_VEHICLE_LISTING_CALLBACK_BASE_URL"],
    });

    const valid = validateListingAutomationEnvironment({
        N8N_VEHICLE_LISTING_WEBHOOK_URL: " https://n8n.example/webhook/listing ",
        N8N_VEHICLE_LISTING_TOKEN: " test-token ",
        N8N_VEHICLE_LISTING_CALLBACK_BASE_URL: "https://waw.example/",
    });
    assert.deepEqual(valid, {
        ok: true,
        config: {
            webhookUrl: "https://n8n.example/webhook/listing",
            token: "test-token",
            callbackBaseUrl: "https://waw.example",
        },
    });
});

test("non-202 n8n responses map to distinct safe diagnostic messages", () => {
    assert.equal(getListingN8nHttpFailure(401).code, "N8N_AUTH_FAILED");
    assert.match(getListingN8nHttpFailure(404).message, /URL.*aktiven Inserats-Webhook/);
    assert.match(getListingN8nHttpFailure(503).message, /HTTP 503/);
    assert.match(getListingN8nHttpFailure(200).message, /statt HTTP 202/);
});

test("callback validation checks identity, lease token, image membership and does not allow a ready draft without a photo", () => {
    const job = {
        id: "job", company_id: "company", purchase_case_id: "purchase", vehicle_id: "vehicle", source_revision: "revision",
        status: "processing", source_snapshot: {}, confirmed_vehicle_data: vehicle, extracted_suggestions: {}, conflicts: [], missing_fields: [],
        title: null, description: null, selected_image_ids: [], manual_revision: 0, result_fingerprint: null,
        dispatch_token: "lease", lease_expires_at: null, attempt_count: 1, last_error_code: null, last_error: null,
        created_at: "", updated_at: "",
    };
    const base = { schemaVersion: 1, jobId: "job", purchaseId: "purchase", vehicleId: "vehicle", sourceRevision: "revision", dispatchToken: "lease", status: "draft_ready", title: "Title", description: "Description", extractedSuggestions: { vin: "WDB123" }, conflicts: [], missingFields: [], selectedImageIds: ["image-1"] };
    const valid = validateListingCallback(base, { job, dispatchToken: "lease", imageIds: new Set(["image-1"]) });
    assert.equal(valid.ok, true);
    if (valid.ok && valid.result.status !== "failed") {
        assert.equal(valid.result.status, "draft_ready");
        assert.equal(valid.result.conflicts.some((item) => (item as { field?: string }).field === "vin"), false);
    }
    const conflict = validateListingCallback({ ...base, extractedSuggestions: { vin: "WDB999" } }, { job, dispatchToken: "lease", imageIds: new Set(["image-1"]) });
    assert.equal(conflict.ok, true);
    if (conflict.ok && conflict.result.status !== "failed") assert.equal(conflict.result.status, "needs_input");
    assert.deepEqual(validateListingCallback({ ...base, dispatchToken: "stale" }, { job, dispatchToken: "lease", imageIds: new Set(["image-1"]) }), { ok: false, code: "identity_conflict" });
    const noPhoto = validateListingCallback({ ...base, selectedImageIds: [] }, { job, dispatchToken: "lease", imageIds: new Set() });
    assert.equal(noPhoto.ok, true);
    if (noPhoto.ok && noPhoto.result.status !== "failed") assert.equal(noPhoto.result.status, "needs_input");
    assert.deepEqual(validateListingCallback({ ...base, selectedImageIds: ["foreign"] }, { job, dispatchToken: "lease", imageIds: new Set(["image-1"]) }), { ok: false, code: "invalid_image_reference" });
});

test("legacy v1 callbacks remain accepted while v2 requires its own version and filters OCR to technical fields", () => {
    const base = { schemaVersion: 1, jobId: "job", purchaseId: "purchase", vehicleId: "vehicle", sourceRevision: "revision", dispatchToken: "lease", status: "draft_ready", title: "Mercedes-Benz Actros 1845", description: "FAHRZEUGDATEN\n• Fahrzeugart: Sattelzugmaschine", extractedSuggestions: { vin: "WDB123", mileage: 20000, ownerName: "Private Person" }, missingFields: [], selectedImageIds: ["image"] };
    const commonJob = { id: "job", company_id: "company", purchase_case_id: "purchase", vehicle_id: "vehicle", source_revision: "revision", status: "processing", source_snapshot: {}, confirmed_vehicle_data: vehicle, extracted_suggestions: {}, conflicts: [], missing_fields: [], title: null, description: null, selected_image_ids: [], manual_revision: 0, result_fingerprint: null, dispatch_token: "lease", lease_expires_at: null, attempt_count: 1, last_error_code: null, last_error: null, created_at: "", updated_at: "" };
    const legacy = validateListingCallback(base, { job: commonJob, dispatchToken: "lease", imageIds: new Set(["image"]) });
    assert.equal(legacy.ok, true);
    if (legacy.ok && legacy.result.status !== "failed") assert.deepEqual(legacy.result.suggestions, { vin: "WDB123", mileage: 20000 });

    const v2 = validateListingCallback({ ...base, contractVersion: 2, title: "Mercedes-Benz Actros 1845", extractedSuggestions: { vin: "WDB123", mileage: 20000, enginePowerKw: 330, ownerName: "Private Person", firstRegistration: "2021-01-01" } }, { job: { ...commonJob, contract_version: 2 }, dispatchToken: "lease", imageIds: new Set(["image"]) });
    assert.equal(v2.ok, true);
    if (v2.ok && v2.result.status !== "failed") assert.deepEqual(v2.result.suggestions, { vin: "WDB123", enginePowerKw: 330, firstRegistration: "2021-01-01" });
    assert.deepEqual(validateListingCallback({ ...base, contractVersion: 1 }, { job: { ...commonJob, contract_version: 2 }, dispatchToken: "lease", imageIds: new Set(["image"]) }), { ok: false, code: "contract_version_conflict" });
    assert.deepEqual(validateListingCallback({ ...base, contractVersion: 2, title: "Actros 1845" }, { job: { ...commonJob, contract_version: 2 }, dispatchToken: "lease", imageIds: new Set(["image"]) }), { ok: false, code: "invalid_public_text" });
});

test("callback fingerprints are stable for technical retries", () => {
    assert.equal(fingerprintListingCallback({ b: 2, a: 1 }), fingerprintListingCallback({ a: 1, b: 2 }));
});

test("expired processing lease can be retried; live lease cannot", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    assert.equal(isListingJobLeaseExpired("processing", "2026-11-05T11:59:00.000Z", now), true);
    assert.equal(isListingJobLeaseExpired("processing", "2026-11-05T12:05:00.000Z", now), false);
    assert.equal(isListingJobLeaseExpired("draft_ready", "2026-11-05T11:00:00.000Z", now), false);
});

test("only supported photo MIME types are accepted and image bytes are actually decoded", async () => {
    assert.equal(isSupportedListingImageMime("image/jpeg"), true);
    assert.equal(isSupportedListingImageMime("application/pdf"), false);
    const validPng = await sharp({ create: { width: 80, height: 64, channels: 3, background: "white" } }).png().toBuffer();
    assert.equal((await inspectListingImageBytes(validPng, "image/png")).valid, true);
    assert.equal((await inspectListingImageBytes(validPng, "image/jpeg")).valid, false);
    assert.equal((await inspectListingImageBytes(Buffer.from("not an image"), "image/jpeg")).valid, false);
});

test("listing callback bearer validation rejects missing and incorrect credentials", () => {
    assert.equal(isValidListingAutomationToken("test-token", "test-token"), true);
    assert.equal(isValidListingAutomationToken("wrong-token", "test-token"), false);
    assert.equal(isValidListingAutomationToken("", "test-token"), false);
    assert.equal(isValidListingAutomationToken("test-token", ""), false);
});

test("database/API/UI preserve active drafts, manual edits, private image paths and expiration-aware retries", () => {
    const migration = readFileSync("supabase/migrations/20261106100000_add_purchase_listing_preparation.sql", "utf8");
    const action = readFileSync("app/dashboard/ankauf/[purchaseId]/listing-actions.ts", "utf8");
    const server = readFileSync("lib/purchases/purchase-listing-server.ts", "utf8");
    const callback = readFileSync("app/api/automation/purchase-listings/[jobId]/callback/route.ts", "utf8");
    const imageApi = readFileSync("app/api/automation/purchase-listings/[jobId]/images/route.ts", "utf8");
    const ui = readFileSync("components/purchases/purchase-listing-preparation-card.tsx", "utf8");
    const details = readFileSync("lib/vehicles/listing-details.ts", "utf8");
    const newMigration = readFileSync("supabase/migrations/20261106110000_add_vehicle_listing_details_and_confirmations.sql", "utf8");
    assert.match(migration, /purchase_listing_jobs_active_revision_uidx/);
    assert.match(migration, /claim_purchase_listing_job/);
    assert.match(migration, /lease_expires_at/);
    assert.match(action, /getCurrentUserContext/);
    assert.match(server, /N8N_VEHICLE_LISTING_WEBHOOK_URL/);
    assert.match(action, /method: "POST"/);
    assert.match(action, /authorization: `Bearer \$\{config\.token\}`/);
    assert.doesNotMatch(action, /console\.(info|warn)\(\[?"\[purchase-listing\] n8n/);
    assert.doesNotMatch(action, /requestStarted|httpStatus: responseStatus/);
    assert.match(action, /AbortSignal\.timeout\(8_000\)/);
    assert.match(callback, /eq\("manual_revision", 0\)/);
    assert.match(callback, /eq\("dispatch_token", dispatchToken\)/);
    assert.match(callback, /loadPurchaseListingSource\(companyId, job\.purchase_case_id, job\.contract_version === 2 \? 2 : 1\)/);
    assert.match(callback, /eq\("source_revision", job\.source_revision\)/);
    assert.match(imageApi, /createSignedUploadUrl/);
    assert.equal(imageApi.includes("companies/${companyId}/purchase-listings/${jobId}/${imageId}"), true);
    assert.match(ui, /router\.refresh\(\)/);
    assert.match(ui, /Neue Vorschau vorbereiten/);
    assert.match(ui, /Titelbild/);
    assert.match(action, /confirm_purchase_listing_suggestions/);
    assert.match(action, /sanitizeListingSuggestions\(job\.extracted_suggestions, 2\)/);
    assert.match(ui, /Ausgewählte Vorschläge in Fahrzeugakte übernehmen/);
    assert.match(newMigration, /contract_version is distinct from old\.contract_version/);
    assert.match(newMigration, /confirmed_suggestions/);
    assert.match(details, /payloadKg/);
    assert.doesNotMatch(action, /purchaseNotes: source\.vehicle|damageNotes: source\.vehicle/);
});
