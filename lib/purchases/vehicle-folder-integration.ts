import "server-only";

import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import {
    buildVehicleFolderName,
    type VehicleFolderRequest,
} from "@/lib/purchases/vehicle-folder-contract";
import { dispatchVehicleFolderWebhook } from "@/lib/purchases/vehicle-folder-dispatch";
import {
    dispatchVehicleFolderCheck,
    isVehicleFolderCheckLeaseActive,
} from "@/lib/purchases/vehicle-folder-check-dispatch";
import type { VehicleFolderCheckRequest } from "@/lib/purchases/vehicle-folder-contract";

const N8N_TIMEOUT_MS = 25_000;
const VEHICLE_FOLDER_CHECK_TIMEOUT_MS = 15_000;
const AUTOMATION_DB_TIMEOUT_MS = 8_000;
const PROCESSING_LEASE_SECONDS = 120;

type FolderJobStatus = "pending" | "processing" | "ready" | "error";

export type PurchaseVehicleFolderJob = {
    id: string;
    folder_event_id: string;
    check_lease_token: string | null;
    check_lease_expires_at: string | null;
    company_id: string;
    purchase_case_id: string;
    vehicle_id: string;
    folder_name: string;
    drive_id: string | null;
    root_folder_id: string | null;
    folder_id: string | null;
    folder_url: string | null;
    registration_folder_id: string | null;
    images_folder_id: string | null;
    status: FolderJobStatus;
    last_error: string | null;
    last_error_code: string | null;
    attempt_count: number;
    lease_token: string | null;
    lease_expires_at: string | null;
};

export type VehicleFolderResult = Pick<
    PurchaseVehicleFolderJob,
    | "id"
    | "status"
    | "folder_name"
    | "folder_url"
    | "folder_id"
    | "registration_folder_id"
    | "images_folder_id"
    | "last_error"
    | "last_error_code"
    | "attempt_count"
>;

function getPublicErrorMessage(code: string): string {
    const messages: Record<string, string> = {
        CONFIG_MISSING:
            "Die OneDrive-Anbindung ist noch nicht vollständig konfiguriert. Bitte wende dich an die Administration.",
        WEBHOOK_AUTH:
            "Die n8n-Anbindung hat die Anfrage nicht authentifiziert. Bitte wende dich an die Administration.",
        REQUEST_FAILED:
            "Der Fahrzeugordner konnte bei OneDrive gerade nicht bestätigt werden. Du kannst es erneut versuchen.",
        INVALID_RESPONSE:
            "n8n hat keine vollständige, passende Ordnerbestätigung zurückgegeben.",
        ALREADY_PROCESSING:
            "Die Fahrzeugakte wird bereits erstellt. Bitte warte kurz.",
        CLAIM_FAILED:
            "Der Auftrag konnte nicht exklusiv übernommen werden. Bitte versuche es erneut.",
        SAVE_FAILED:
            "Die OneDrive-Antwort konnte nicht sicher gespeichert werden. Bitte versuche es erneut.",
        RECREATE_NOT_ALLOWED:
            "Die Fahrzeugakte kann nur nach einem bestätigten fehlenden OneDrive-Ordner neu angelegt werden.",
    };

    return messages[code] ?? messages.REQUEST_FAILED;
}

function toResult(job: PurchaseVehicleFolderJob): VehicleFolderResult {
    return {
        id: job.id,
        status: job.status,
        folder_name: job.folder_name,
        folder_url: job.folder_url,
        folder_id: job.folder_id,
        registration_folder_id: job.registration_folder_id,
        images_folder_id: job.images_folder_id,
        last_error: job.last_error,
        last_error_code: job.last_error_code,
        attempt_count: job.attempt_count,
    };
}

async function loadPurchaseIdentity(companyId: string, purchaseId: string) {
    const supabase = createAutomationSupabaseClient();
    const { data: purchase, error: purchaseError } = await supabase
        .from("purchase_cases")
        .select("id, company_id, vehicle_id, purchase_number")
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (purchaseError) throw new Error("PURCHASE_LOOKUP_FAILED");
    if (!purchase?.vehicle_id) throw new Error("PURCHASE_NOT_FOUND");

    const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, manufacturer, model, vehicle_type, vehicle_category")
        .eq("id", purchase.vehicle_id)
        .eq("company_id", companyId)
        .maybeSingle();

    if (vehicleError) throw new Error("VEHICLE_LOOKUP_FAILED");
    if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");

    return {
        purchase,
        vehicle,
        folderName: buildVehicleFolderName({
            purchaseId: purchase.id,
            purchaseNumber: purchase.purchase_number,
            manufacturer: vehicle.manufacturer,
            model: vehicle.model,
            vehicleType: vehicle.vehicle_type,
            vehicleCategory: vehicle.vehicle_category,
        }),
    };
}

async function upsertJob({
    companyId,
    purchaseId,
    vehicleId,
    folderName,
}: {
    companyId: string;
    purchaseId: string;
    vehicleId: string;
    folderName: string;
}): Promise<PurchaseVehicleFolderJob> {
    const supabase = createAutomationSupabaseClient();
    const { error: insertError } = await supabase
        .from("purchase_vehicle_folder_jobs")
        .upsert(
            {
                company_id: companyId,
                purchase_case_id: purchaseId,
                vehicle_id: vehicleId,
                folder_name: folderName,
            },
            { onConflict: "company_id,purchase_case_id", ignoreDuplicates: true },
        );

    if (insertError) throw new Error("JOB_CREATE_FAILED");

    const { data, error } = await supabase
        .from("purchase_vehicle_folder_jobs")
        .select("*")
        .eq("company_id", companyId)
        .eq("purchase_case_id", purchaseId)
        .single();

    if (error || !data) throw new Error("JOB_LOOKUP_FAILED");
    return data as PurchaseVehicleFolderJob;
}

async function markJobError(
    jobId: string,
    errorCode: string,
    message: string,
    leaseToken?: string | null,
) {
    const supabase = createAutomationSupabaseClient();
    let query = supabase
        .from("purchase_vehicle_folder_jobs")
        .update({
            status: "error",
            last_error_code: errorCode,
            last_error: message,
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

    if (leaseToken) query = query.eq("lease_token", leaseToken);
    await query;
}

async function runJob(
    job: PurchaseVehicleFolderJob,
    purchaseId: string,
    vehicleId: string,
): Promise<VehicleFolderResult> {
    const webhookUrl = process.env.N8N_VEHICLE_FOLDER_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_VEHICLE_FOLDER_WEBHOOK_SECRET;
    const configuredDriveId = process.env.WAW_ONEDRIVE_DRIVE_ID;
    const configuredRootId = process.env.WAW_ONEDRIVE_ROOT_FOLDER_ID;

    if (!webhookUrl || !webhookSecret || !configuredDriveId || !configuredRootId) {
        await markJobError(
            job.id,
            "CONFIG_MISSING",
            getPublicErrorMessage("CONFIG_MISSING"),
        );
        return {
            ...toResult({ ...job, status: "error" }),
            last_error: getPublicErrorMessage("CONFIG_MISSING"),
        };
    }

    let parsedWebhookUrl: URL;
    try {
        parsedWebhookUrl = new URL(webhookUrl);
    } catch {
        parsedWebhookUrl = new URL("http://invalid.local");
    }
    if (parsedWebhookUrl.protocol !== "https:") {
        await markJobError(job.id, "CONFIG_MISSING", getPublicErrorMessage("CONFIG_MISSING"));
        return { ...toResult({ ...job, status: "error" }), last_error: getPublicErrorMessage("CONFIG_MISSING") };
    }

    const supabase = createAutomationSupabaseClient();
    if (!job.drive_id || !job.root_folder_id) {
        const { error: configError } = await supabase
            .from("purchase_vehicle_folder_jobs")
            .update({
                drive_id: configuredDriveId,
                root_folder_id: configuredRootId,
                updated_at: new Date().toISOString(),
            })
            .eq("id", job.id)
            .or("drive_id.is.null,root_folder_id.is.null");
        if (configError) throw new Error("JOB_CONFIG_SAVE_FAILED");
    }

    const { data: configuredJob, error: configuredJobError } = await supabase
        .from("purchase_vehicle_folder_jobs")
        .select("*")
        .eq("id", job.id)
        .single();
    if (configuredJobError || !configuredJob) throw new Error("JOB_LOOKUP_FAILED");

    const persistedJob = configuredJob as PurchaseVehicleFolderJob;
    const { data: claimedRows, error: claimError } = await supabase.rpc(
        "claim_purchase_vehicle_folder_job",
        {
            p_job_id: persistedJob.id,
            p_lease_seconds: PROCESSING_LEASE_SECONDS,
        },
    );
    if (claimError) throw new Error("JOB_CLAIM_FAILED");

    const claimed = Array.isArray(claimedRows) ? claimedRows[0] as PurchaseVehicleFolderJob | undefined : undefined;
    if (!claimed) {
        const { data: current } = await supabase
            .from("purchase_vehicle_folder_jobs")
            .select("*")
            .eq("id", persistedJob.id)
            .single();
        if (current) {
            const currentJob = current as PurchaseVehicleFolderJob;
            if (currentJob.status === "ready" || currentJob.status === "processing") return toResult(currentJob);
        }
        throw new Error("JOB_CLAIM_FAILED");
    }

    const request: VehicleFolderRequest = {
        event_id: claimed.folder_event_id,
        event: "purchase.folder.ensure",
        purchase_id: purchaseId,
        vehicle_id: vehicleId,
        folder_name: claimed.folder_name,
        drive_id: claimed.drive_id ?? configuredDriveId,
        root_folder_id: claimed.root_folder_id ?? configuredRootId,
    };

    const dispatch = await dispatchVehicleFolderWebhook({
        request,
        leaseToken: claimed.lease_token!,
        post: async (outgoingRequest) => {
            const response = await fetch(webhookUrl, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-waw-webhook-secret": webhookSecret,
                },
                body: JSON.stringify(outgoingRequest),
                signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
                cache: "no-store",
            });
            let body: unknown = null;
            if (response.ok) {
                try {
                    body = await response.json();
                } catch {
                    throw new Error("INVALID_RESPONSE");
                }
            }
            return { statusCode: response.status, body };
        },
        complete: async (result, leaseToken) => {
            const { data, error } = await supabase.rpc(
                "complete_purchase_vehicle_folder_job",
                {
                    p_job_id: claimed.id,
                    p_lease_token: leaseToken,
                    p_event_id: result.event_id,
                    p_purchase_id: result.purchase_id,
                    p_vehicle_id: result.vehicle_id,
                    p_folder_name: result.folder_name,
                    p_drive_id: result.drive_id,
                    p_folder_id: result.folder_id,
                    p_folder_url: result.folder_url,
                    p_registration_folder_id: result.registration_folder_id ?? null,
                    p_images_folder_id: result.images_folder_id,
                },
            );
            return !error && data === true;
        },
        fail: async (code, leaseToken) => {
            await markJobError(claimed.id, code, getPublicErrorMessage(code), leaseToken);
            console.error("[purchase-vehicle-folder] request failed", {
                jobId: claimed.id,
                errorCode: code,
            });
        },
    });

    if (dispatch.status === "error") {
        const message = getPublicErrorMessage(dispatch.errorCode);
        return {
            ...toResult({ ...claimed, status: "error" }),
            last_error: message,
        };
    }

    return {
        ...toResult(claimed),
        status: "ready",
        folder_url: dispatch.response.folder_url,
        folder_id: dispatch.response.folder_id,
        registration_folder_id:
            dispatch.response.registration_folder_id ?? claimed.registration_folder_id,
        images_folder_id: dispatch.response.images_folder_id,
        last_error: null,
    };
}

export async function ensurePurchaseVehicleFolder(
    companyId: string,
    purchaseId: string,
): Promise<VehicleFolderResult> {
    const { purchase, vehicle, folderName } = await loadPurchaseIdentity(companyId, purchaseId);
    const job = await upsertJob({
        companyId,
        purchaseId: purchase.id,
        vehicleId: vehicle.id,
        folderName,
    });

    if (job.status === "ready") return toResult(job);
    if (job.status === "error" && job.last_error_code === "FOLDER_NOT_FOUND") return toResult(job);
    if (job.status === "processing" && job.lease_expires_at && new Date(job.lease_expires_at).getTime() > Date.now()) {
        return toResult(job);
    }

    return runJob(job, purchase.id, job.vehicle_id);
}

export type VehicleFolderCheckResult =
    | { status: "found"; folderUrl: string }
    | { status: "missing" }
    | { status: "unavailable"; message: string }
    | { status: "busy"; message: string }
    | { status: "not_ready"; message: string };

const CHECK_FAILURE_MESSAGE = "Ordner konnte gerade nicht geprüft werden.";

export async function checkPurchaseVehicleFolder(
    companyId: string,
    purchaseId: string,
): Promise<VehicleFolderCheckResult> {
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: AUTOMATION_DB_TIMEOUT_MS });
    const { data: jobData, error: jobError } = await supabase
        .from("purchase_vehicle_folder_jobs")
        .select("*")
        .eq("company_id", companyId)
        .eq("purchase_case_id", purchaseId)
        .maybeSingle();

    if (jobError) throw new Error("JOB_LOOKUP_FAILED");
    if (!jobData) return { status: "not_ready", message: "Für diesen Einkauf ist noch kein OneDrive-Ordner hinterlegt." };
    const job = jobData as PurchaseVehicleFolderJob;
    if (job.status !== "ready" || !job.folder_id || !job.drive_id) {
        return { status: "not_ready", message: "Für diesen Einkauf ist kein prüfbarer OneDrive-Ordner hinterlegt." };
    }

    const { data: claimedRows, error: claimError } = await supabase.rpc(
        "claim_purchase_vehicle_folder_check",
        { p_job_id: job.id, p_company_id: companyId, p_lease_seconds: 60 },
    );
    if (claimError) throw new Error("CHECK_CLAIM_FAILED");
    const claimed = Array.isArray(claimedRows)
        ? claimedRows[0] as PurchaseVehicleFolderJob | undefined
        : undefined;
    if (!claimed?.check_lease_token) {
        if (isVehicleFolderCheckLeaseActive(job.check_lease_token, job.check_lease_expires_at)) {
            return { status: "busy", message: "Die OneDrive-Akte wird bereits geprüft. Bitte warte kurz und versuche es erneut." };
        }
        return { status: "unavailable", message: CHECK_FAILURE_MESSAGE };
    }

    const checkUrl = process.env.N8N_VEHICLE_FOLDER_CHECK_WEBHOOK_URL;
    const secret = process.env.N8N_VEHICLE_FOLDER_WEBHOOK_SECRET;
    let validUrl = false;
    try {
        validUrl = Boolean(checkUrl && new URL(checkUrl).protocol === "https:");
    } catch {
        validUrl = false;
    }

    const request: VehicleFolderCheckRequest = {
        event_id: claimed.folder_event_id,
        event: "purchase.folder.inspect",
        purchase_id: claimed.purchase_case_id,
        vehicle_id: claimed.vehicle_id,
        drive_id: claimed.drive_id!,
        folder_id: claimed.folder_id!,
    };

    const outcome = await dispatchVehicleFolderCheck({
        request,
        post: async (outgoing) => {
            if (!validUrl || !checkUrl || !secret) throw new Error("check configuration unavailable");
            const response = await fetch(checkUrl, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-waw-webhook-secret": secret,
                },
                body: JSON.stringify(outgoing),
                signal: AbortSignal.timeout(VEHICLE_FOLDER_CHECK_TIMEOUT_MS),
                cache: "no-store",
            });
            let body: unknown = null;
            try {
                body = await response.json();
            } catch {
                // The dispatcher treats an unstructured response as unavailable.
            }
            return { statusCode: response.status, body };
        },
        persist: async (response, failure) => {
            const result = failure
                ? "unavailable"
                : response?.status === "missing"
                    ? "missing"
                    : "found";
            const { data, error } = await supabase.rpc("complete_purchase_vehicle_folder_check", {
                p_job_id: claimed.id,
                p_company_id: companyId,
                p_check_lease_token: claimed.check_lease_token,
                p_event_id: request.event_id,
                p_purchase_id: request.purchase_id,
                p_vehicle_id: request.vehicle_id,
                p_drive_id: request.drive_id,
                p_folder_id: request.folder_id,
                p_result: result,
                p_folder_url: result === "found" ? response?.folder_url ?? null : null,
            });
            return !error && data === true;
        },
    });

    if (outcome.status === "found") return outcome;
    if (outcome.status === "missing") return outcome;
    return { status: "unavailable", message: CHECK_FAILURE_MESSAGE };
}

export async function recreateMissingPurchaseVehicleFolder(
    companyId: string,
    purchaseId: string,
): Promise<VehicleFolderResult> {
    const supabase = createAutomationSupabaseClient();
    const { data: job, error: lookupError } = await supabase
        .from("purchase_vehicle_folder_jobs")
        .select("id, status, last_error_code")
        .eq("company_id", companyId)
        .eq("purchase_case_id", purchaseId)
        .maybeSingle();
    if (lookupError || !job) throw new Error("JOB_LOOKUP_FAILED");

    if (job.status === "error" && job.last_error_code === "FOLDER_NOT_FOUND") {
        const { data: requeued, error } = await supabase.rpc(
            "requeue_missing_purchase_vehicle_folder",
            { p_job_id: job.id, p_company_id: companyId },
        );
        if (error) throw new Error("RECREATE_FAILED");
        if (requeued !== true) {
            const { data: current } = await supabase
                .from("purchase_vehicle_folder_jobs")
                .select("*")
                .eq("id", job.id)
                .single();
            if (current && (current.status === "processing" || current.status === "pending")) {
                return toResult(current as PurchaseVehicleFolderJob);
            }
            throw new Error("RECREATE_NOT_ALLOWED");
        }
    } else if (job.status !== "pending" && job.status !== "processing") {
        throw new Error("RECREATE_NOT_ALLOWED");
    }

    // The persisted folder_name and current drive/root IDs are reused. The
    // new event ID was committed atomically by the requeue RPC.
    return ensurePurchaseVehicleFolder(companyId, purchaseId);
}
