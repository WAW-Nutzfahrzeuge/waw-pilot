import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

import {
    buildVehicleFolderName,
    validateVehicleFolderResponse,
    type VehicleFolderRequest,
} from "../lib/purchases/vehicle-folder-contract.ts";
import { dispatchVehicleFolderWebhook } from "../lib/purchases/vehicle-folder-dispatch.ts";

const request: VehicleFolderRequest = {
    event_id: "b764f8ac-7d25-4e4b-a411-6f735274a9d0",
    event: "purchase.folder.ensure",
    purchase_id: "a764f8ac-7d25-4e4b-a411-6f735274a9d0",
    vehicle_id: "c764f8ac-7d25-4e4b-a411-6f735274a9d0",
    folder_name: "AK-2026-000421_Mercedes-Actros_3241_Betonmischer",
    drive_id: "drive-1",
    root_folder_id: "root-1",
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
    assert.match(migration, /folder_name is distinct from old\.folder_name/i);
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
