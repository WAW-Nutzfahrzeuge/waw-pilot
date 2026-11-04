import {
    validateVehicleFolderCheckResponse,
    type VehicleFolderCheckRequest,
    type VehicleFolderCheckResponse,
} from "./vehicle-folder-contract.ts";

export type VehicleFolderCheckFailure = "AUTH" | "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE";

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

    const persisted = await persist(response, failure);
    if (!persisted) return { status: "unavailable", reason: "UNAVAILABLE" };

    if (failure) return { status: "unavailable", reason: failure };
    if (response?.status === "missing") return { status: "missing" };
    if (response?.status === "found" && response.folder_url) {
        return { status: "found", folderUrl: response.folder_url };
    }
    return { status: "unavailable", reason: "INVALID_RESPONSE" };
}
