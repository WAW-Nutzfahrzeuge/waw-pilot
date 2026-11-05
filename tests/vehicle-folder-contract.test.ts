import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

import {
    buildVehicleFolderName,
    validateVehicleFolderResponse,
    validateVehicleFolderCheckResponse,
    type VehicleFolderRequest,
    type VehicleFolderCheckRequest,
} from "../lib/purchases/vehicle-folder-contract.ts";
import { dispatchVehicleFolderWebhook } from "../lib/purchases/vehicle-folder-dispatch.ts";
import {
    dispatchVehicleFolderCheck,
    isVehicleFolderCheckLeaseActive,
    withVehicleFolderCheckTimeout,
} from "../lib/purchases/vehicle-folder-check-dispatch.ts";

const request: VehicleFolderRequest = {
    event_id: "b764f8ac-7d25-4e4b-a411-6f735274a9d0",
    event: "purchase.folder.ensure",
    purchase_id: "a764f8ac-7d25-4e4b-a411-6f735274a9d0",
    vehicle_id: "c764f8ac-7d25-4e4b-a411-6f735274a9d0",
    folder_name: "AK-2026-000421_Mercedes-Actros_3241_Betonmischer",
    drive_id: "drive-1",
    root_folder_id: "root-1",
};

const checkRequest: VehicleFolderCheckRequest = {
    event_id: request.event_id,
    event: "purchase.folder.inspect",
    purchase_id: request.purchase_id,
    vehicle_id: request.vehicle_id,
    drive_id: request.drive_id,
    folder_id: "folder-id",
};

function validResponse() {
    return {
        status: "ready",
        event_id: request.event_id,
        purchase_id: request.purchase_id,
        vehicle_id: request.vehicle_id,
        folder_name: request.folder_name,
        drive_id: request.drive_id,
        folder_id: "folder-id",
        folder_url: "https://tenant.sharepoint.com/sites/WAW/Shared%20Documents/folder",
        registration_folder_id: "registration-id",
        images_folder_id: "images-id",
    };
}

test("vehicle folder name is human-readable, safe, and based on stable purchase number", () => {
    assert.equal(
        buildVehicleFolderName({
            purchaseId: request.purchase_id,
            purchaseNumber: "AK-2026-000421",
            manufacturer: "Mercedes-Benz",
            model: "Actros/3241",
            vehicleType: "LKW",
            vehicleCategory: "Betonmischer",
        }),
        "AK-2026-000421_Mercedes-Benz-Actros-3241_Betonmischer",
    );
});

test("vehicle folder fallback uses the full internal id when the purchase number is absent", () => {
    const result = buildVehicleFolderName({
        purchaseId: request.purchase_id,
        purchaseNumber: null,
        manufacturer: "",
        model: "",
        vehicleType: "LKW",
        vehicleCategory: null,
    });
    assert.equal(result, `EK-${request.purchase_id}_LKW`);
    assert.ok(!result.includes("../"));
});

test("n8n folder response is accepted only when all identity values match", () => {
    assert.equal(validateVehicleFolderResponse(validResponse(), request)?.status, "ready");
    const newWorkflowResponse: Record<string, unknown> = { ...validResponse() };
    delete newWorkflowResponse.registration_folder_id;
    assert.equal(
        validateVehicleFolderResponse(newWorkflowResponse, request)?.images_folder_id,
        "images-id",
    );
    assert.equal(
        validateVehicleFolderResponse(
            { ...newWorkflowResponse, registration_folder_id: null },
            request,
        )?.status,
        "ready",
    );

    for (const mutation of [
        { ...validResponse(), event_id: "another-job" },
        { ...validResponse(), purchase_id: "another-purchase" },
        { ...validResponse(), vehicle_id: "another-vehicle" },
        { ...validResponse(), folder_name: "different-name" },
        { ...validResponse(), drive_id: "different-drive" },
        { ...validResponse(), registration_folder_id: "" },
        { ...validResponse(), registration_folder_id: 42 },
        { ...validResponse(), folder_url: "http://tenant.sharepoint.com/folder" },
        { ...validResponse(), folder_url: "https://evil.example/folder" },
    ]) {
        assert.equal(validateVehicleFolderResponse(mutation, request), null);
    }
});

test("purchase folder migration makes the old registration mapping optional without clearing saved values", () => {
    const migration = readFileSync(
        resolve("supabase/migrations/20261104130000_make_purchase_registration_folder_optional.sql"),
        "utf8",
    );

    assert.match(migration, /alter column registration_folder_id drop not null/i);
    assert.match(migration, /registration_folder_id\s*=\s*coalesce\(\s*nullif\(btrim\(p_registration_folder_id\), ''\),\s*j\.registration_folder_id\s*\)/i);
    assert.match(migration, /registration_folder_id is not null/i);
    assert.doesNotMatch(migration.match(/add constraint purchase_vehicle_folder_jobs_ready_fields_check[\s\S]*?;/i)?.[0] ?? "", /registration_folder_id is not null/i);
});

test("purchase registration upload is optional and stored through the existing private documents bucket", () => {
    const purchaseAction = readFileSync(resolve("app/dashboard/ankauf/new/actions.ts"), "utf8");
    const purchaseDetailAction = readFileSync(
        resolve("app/dashboard/ankauf/[purchaseId]/document-actions.ts"),
        "utf8",
    );

    assert.match(purchaseAction, /getFileValues\(formData, "vehicle_registration_file"\)/);
    assert.match(purchaseAction, /\.from\("documents"\)[\s\S]*?\.upload\(filePath, file/);
    assert.match(purchaseAction, /document_type: documentType[\s\S]*?vehicle_id: vehicleId[\s\S]*?purchase_case_id: purchaseCaseId/);
    assert.match(purchaseDetailAction, /document_type: documentType[\s\S]*?purchase_case_id: purchaseId/);
    assert.doesNotMatch(purchaseAction, /if\s*\(\s*!.*vehicle_registration_file/);
});

test("durable folder jobs enforce unique purchase identity, private access, and atomic leased claims", () => {
    const migration = readFileSync(
        resolve("supabase/migrations/20261104110000_add_purchase_vehicle_folder_jobs.sql"),
        "utf8",
    );

    assert.match(migration, /unique\s*\(company_id,\s*purchase_case_id\)/i);
    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on public\.purchase_vehicle_folder_jobs from public, anon, authenticated/i);
    assert.match(migration, /create or replace function public\.claim_purchase_vehicle_folder_job/i);
    assert.match(migration, /lease_token\s*=\s*gen_random_uuid\(\)/i);
    assert.match(migration, /lease_expires_at\s*<=\s*now\(\)/i);
    const requeueFunction = migration.match(/create or replace function public\.requeue_missing_purchase_vehicle_folder[\s\S]*?\$\$;/i)?.[0] ?? "";
    assert.doesNotMatch(requeueFunction, /set[\s\S]*?folder_name\s*=/i);
});

test("mocked n8n success persists the complete validated folder mapping", async () => {
    const stored = new Map<string, unknown>();
    const failures: string[] = [];
    const newWorkflowResponse: Record<string, unknown> = { ...validResponse() };
    delete newWorkflowResponse.registration_folder_id;
    const result = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: "lease-1",
        post: async () => ({ statusCode: 200, body: newWorkflowResponse }),
        complete: async (response, token) => {
            assert.equal(token, "lease-1");
            stored.set(response.event_id, response);
            return true;
        },
        fail: async (code) => { failures.push(code); },
    });

    assert.equal(result.status, "ready");
    assert.equal(stored.get(request.event_id), (result as { status: "ready"; response: unknown }).response);
    assert.equal(
        (stored.get(request.event_id) as { registration_folder_id?: string }).registration_folder_id,
        undefined,
    );
    assert.equal(failures.length, 0);
});

test("mocked invalid response is rejected and cannot be persisted", async () => {
    let persisted = false;
    const failures: string[] = [];
    const result = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: "lease-2",
        post: async () => ({ statusCode: 200, body: { ...validResponse(), purchase_id: "other" } }),
        complete: async () => { persisted = true; return true; },
        fail: async (code) => { failures.push(code); },
    });

    assert.deepEqual(result, { status: "error", errorCode: "INVALID_RESPONSE" });
    assert.equal(persisted, false);
    assert.deepEqual(failures, ["INVALID_RESPONSE"]);
});

test("mocked timeout can be retried with the exact same stable folder identity", async () => {
    const failed: string[] = [];
    let secondRequest: VehicleFolderRequest | null = null;
    const timedOut = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: "lease-old",
        post: async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); },
        complete: async () => false,
        fail: async (code) => { failed.push(code); },
    });
    const retried = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: "lease-new",
        post: async (outgoingRequest) => {
            secondRequest = outgoingRequest;
            return { statusCode: 200, body: validResponse() };
        },
        complete: async (_response, token) => token === "lease-new",
        fail: async (code) => { failed.push(code); },
    });

    assert.deepEqual(timedOut, { status: "error", errorCode: "TIMEOUT" });
    assert.equal(retried.status, "ready");
    assert.deepEqual(secondRequest, request);
    assert.deepEqual(failed, ["TIMEOUT"]);
});

test("folder inspection resolves renamed folders by stored drive and item IDs and returns the current URL", () => {
    const response = {
        status: "found",
        event_id: checkRequest.event_id,
        purchase_id: checkRequest.purchase_id,
        vehicle_id: checkRequest.vehicle_id,
        drive_id: checkRequest.drive_id,
        folder_id: checkRequest.folder_id,
        item_type: "folder",
        folder_url: "https://tenant.sharepoint.com/sites/WAW/Shared%20Documents/renamed-folder",
    };
    assert.equal(validateVehicleFolderCheckResponse(response, checkRequest)?.folder_url, response.folder_url);
    assert.equal("folder_name" in checkRequest, false);
    assert.equal(validateVehicleFolderCheckResponse({ ...response, folder_id: "other-id" }, checkRequest), null);
    assert.equal(validateVehicleFolderCheckResponse({ ...response, item_type: "file" }, checkRequest), null);
});

test("only an explicit itemNotFound result marks the saved OneDrive folder missing", async () => {
    let persisted: unknown = null;
    const result = await dispatchVehicleFolderCheck({
        request: checkRequest,
        post: async () => ({
            statusCode: 200,
            body: {
                status: "missing",
                error_code: "ITEM_NOT_FOUND",
                event_id: checkRequest.event_id,
                purchase_id: checkRequest.purchase_id,
                vehicle_id: checkRequest.vehicle_id,
                drive_id: checkRequest.drive_id,
                folder_id: checkRequest.folder_id,
            },
        }),
        persist: async (response, failure) => { persisted = { response, failure }; return true; },
    });
    assert.deepEqual(result, { status: "missing" });
    assert.equal((persisted as { response: { status: string } }).response.status, "missing");
});

test("the configured direct n8n response body is accepted without expecting an outer wrapper", async () => {
    const directRespondToWebhookBody = {
        status: "missing",
        error_code: "ITEM_NOT_FOUND",
        event_id: checkRequest.event_id,
        purchase_id: checkRequest.purchase_id,
        vehicle_id: checkRequest.vehicle_id,
        drive_id: checkRequest.drive_id,
        folder_id: checkRequest.folder_id,
    };
    let savedResult = "";
    const result = await dispatchVehicleFolderCheck({
        request: checkRequest,
        post: async () => ({ statusCode: 200, body: directRespondToWebhookBody }),
        persist: async (response, failure) => {
            assert.equal(failure, null);
            savedResult = response?.status ?? "";
            return true;
        },
    });
    assert.deepEqual(result, { status: "missing" });
    assert.equal(savedResult, "missing");
});

test("found response persists the current webUrl and completes the check normally", async () => {
    const currentUrl = "https://tenant.sharepoint.com/sites/WAW/Shared%20Documents/renamed-folder";
    const response = {
        status: "found",
        event_id: checkRequest.event_id,
        purchase_id: checkRequest.purchase_id,
        vehicle_id: checkRequest.vehicle_id,
        drive_id: checkRequest.drive_id,
        folder_id: checkRequest.folder_id,
        item_type: "folder",
        folder_url: currentUrl,
    };
    let savedUrl = "";
    const result = await dispatchVehicleFolderCheck({
        request: checkRequest,
        post: async () => ({ statusCode: 200, body: response }),
        persist: async (value, failure) => {
            assert.equal(failure, null);
            savedUrl = value?.folder_url ?? "";
            return true;
        },
    });
    assert.deepEqual(result, { status: "found", folderUrl: currentUrl });
    assert.equal(savedUrl, currentUrl);
});

test("403 and timeout preserve the folder mapping and never report it deleted", async () => {
    for (const [post, reason] of [
        [async () => ({ statusCode: 403, body: null }), "AUTH"],
        [async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }, "TIMEOUT"],
    ] as const) {
        let persistedFailure = "";
        const result = await dispatchVehicleFolderCheck({
            request: checkRequest,
            post,
            persist: async (response, failure) => {
                assert.equal(response, null);
                persistedFailure = failure ?? "";
                return true;
            },
        });
        assert.deepEqual(result, { status: "unavailable", reason });
        assert.equal(persistedFailure, reason);
    }
});

test("expired check leases are reclaimable while unexpired claims remain active", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    assert.equal(isVehicleFolderCheckLeaseActive("old-token", "2026-11-05T11:59:00.000Z", now), false);
    assert.equal(isVehicleFolderCheckLeaseActive("active-token", "2026-11-05T12:01:00.000Z", now), true);
    assert.equal(isVehicleFolderCheckLeaseActive(null, "2026-11-05T12:01:00.000Z", now), false);
});

test("the UI timeout ends loading for resolved and hanging check actions", async () => {
    const completed = await withVehicleFolderCheckTimeout(Promise.resolve({ status: "missing" }), 100);
    assert.deepEqual(completed, { timedOut: false, value: { status: "missing" } });

    const timedOut = await withVehicleFolderCheckTimeout(new Promise<never>(() => {}), 5);
    assert.deepEqual(timedOut, { timedOut: true });

    const card = readFileSync(resolve("components/purchases/vehicle-folder-card.tsx"), "utf8");
    assert.match(card, /finally\s*\{\s*setChecking\(false\)/);
    assert.match(card, /if \(boundedResult\.timedOut\)[\s\S]*?popup\?\.close\(\)/);
    assert.match(card, /window\.location\.assign\(result\.folderUrl\)/);
});

test("database persistence failure after n8n responds returns unavailable instead of leaving dispatch pending", async () => {
    const result = await dispatchVehicleFolderCheck({
        request: checkRequest,
        post: async () => ({ statusCode: 200, body: {
            status: "missing",
            error_code: "ITEM_NOT_FOUND",
            event_id: checkRequest.event_id,
            purchase_id: checkRequest.purchase_id,
            vehicle_id: checkRequest.vehicle_id,
            drive_id: checkRequest.drive_id,
            folder_id: checkRequest.folder_id,
        } }),
        persist: async () => { throw new Error("database unavailable"); },
    });
    assert.deepEqual(result, { status: "unavailable", reason: "UNAVAILABLE" });
});

test("migration serializes concurrent inspection and recreation and preserves stored folder names", () => {
    const migration = readFileSync(
        resolve("supabase/migrations/20261104140000_add_purchase_vehicle_folder_inspection.sql"),
        "utf8",
    );
    assert.match(migration, /claim_purchase_vehicle_folder_check/i);
    assert.match(migration, /check_lease_token is null or coalesce\(j\.check_lease_expires_at, '-infinity'::timestamptz\) <= now\(\)/i);
    assert.doesNotMatch(migration.match(/create or replace function public\.claim_purchase_vehicle_folder_check[\s\S]*?\$\$;/i)?.[0] ?? "", /check_lease_token is null\s*\n\s*returning/i);
    assert.match(migration, /requeue_missing_purchase_vehicle_folder/i);
    assert.match(migration, /last_error_code = 'FOLDER_NOT_FOUND'/i);
    assert.match(migration, /folder_event_id = gen_random_uuid\(\)::text/i);
    assert.match(migration, /check \(status <> 'ready' or \([\s\S]*folder_id is not null/i);
    const requeueFunction = migration.match(/create or replace function public\.requeue_missing_purchase_vehicle_folder[\s\S]*?\$\$;/i)?.[0] ?? "";
    assert.doesNotMatch(requeueFunction, /set[\s\S]*?folder_name\s*=/i);
    assert.match(migration, /p_event_id = j\.folder_event_id/i);

    const expiredLeaseMigration = readFileSync(
        resolve("supabase/migrations/20261105100000_reject_expired_purchase_vehicle_folder_checks.sql"),
        "utf8",
    );
    assert.match(expiredLeaseMigration, /j\.check_lease_token = p_check_lease_token[\s\S]*?j\.check_lease_expires_at > now\(\)/i);
});

test("inspection and recreation UI distinguishes missing folders from connectivity errors", () => {
    const card = readFileSync(resolve("components/purchases/vehicle-folder-card.tsx"), "utf8");
    assert.match(card, /Der OneDrive-Ordner wurde gelöscht oder ist nicht mehr vorhanden\./);
    assert.match(card, /OneDrive-Ordner neu anlegen/);
    assert.match(card, /Ordner konnte gerade nicht geprüft werden\./);
    assert.match(card, /window\.open\("about:blank", "_blank"\)/);
    assert.match(card, /popup\.location\.replace\(result\.folderUrl\)/);
    assert.match(card, /Eine Neuanlage stellt zuvor gelöschte Fahrzeugbilder nicht wieder her\./);
});

test("mocked unsuccessful HTTP status and failed atomic completion do not report ready", async () => {
    const failures: string[] = [];
    const denied = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: "lease-3",
        post: async () => ({ statusCode: 401, body: null }),
        complete: async () => true,
        fail: async (code) => { failures.push(code); },
    });
    const stale = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: "lease-stale",
        post: async () => ({ statusCode: 200, body: validResponse() }),
        complete: async () => false,
        fail: async (code) => { failures.push(code); },
    });

    assert.deepEqual(denied, { status: "error", errorCode: "WEBHOOK_AUTH" });
    assert.deepEqual(stale, { status: "error", errorCode: "SAVE_FAILED" });
    assert.deepEqual(failures, ["WEBHOOK_AUTH", "SAVE_FAILED"]);
});
