import {
    validateVehicleFolderCheckResponse,
    type VehicleFolderCheckRequest,
    type VehicleFolderCheckResponse,
} from "./vehicle-folder-contract.ts";

export type VehicleFolderCheckFailure = "AUTH" | "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE";

export function isVehicleFolderCheckLeaseActive(
    token: string | null | undefined,
    expiresAt: string | null | undefined,
    now = Date.now(),
): boolean {
    if (!token || !expiresAt) return false;
    const expiresAtMs = Date.parse(expiresAt);
    return Number.isFinite(expiresAtMs) && expiresAtMs > now;
}

export async function withVehicleFolderCheckTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const result = await Promise.race([
            operation.then((value) => ({ timedOut: false as const, value })),
            new Promise<{ timedOut: true }>((resolve) => {
                timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
            }),
        ]);
        return result;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

export async function dispatchVehicleFolderCheck({
    request,
    post,
    persist,
}: {
    request: VehicleFolderCheckRequest;
    post: (request: VehicleFolderCheckRequest) => Promise<{ statusCode: number; body: unknown }>;
    persist: (response: VehicleFolderCheckResponse | null, failure: VehicleFolderCheckFailure | null) => Promise<boolean>;
}): Promise<
    | { status: "found"; folderUrl: string }
    | { status: "missing" }
    | { status: "unavailable"; reason: VehicleFolderCheckFailure }
> {
    let failure: VehicleFolderCheckFailure | null = null;
    let body: unknown = null;

    try {
        const received = await post(request);
        if (received.statusCode === 401 || received.statusCode === 403) {
            failure = "AUTH";
        } else if (received.statusCode < 200 || received.statusCode >= 300) {
            failure = "UNAVAILABLE";
        } else {
            body = received.body;
        }
    } catch (error) {
        failure = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
            ? "TIMEOUT"
            : "UNAVAILABLE";
    }

    const response = failure ? null : validateVehicleFolderCheckResponse(body, request);
    if (!failure && !response) failure = "INVALID_RESPONSE";

    let persisted = false;
    try {
        persisted = await persist(response, failure);
    } catch {
        // A failed persistence call must not leave the Server Action waiting
        // forever. The DB lease expires and a later check can atomically claim it.
        return { status: "unavailable", reason: "UNAVAILABLE" };
    }
    if (!persisted) return { status: "unavailable", reason: "UNAVAILABLE" };

    if (failure) return { status: "unavailable", reason: failure };
    if (response?.status === "missing") return { status: "missing" };
    if (response?.status === "found" && response.folder_url) {
        return { status: "found", folderUrl: response.folder_url };
    }
    return { status: "unavailable", reason: "INVALID_RESPONSE" };
}
