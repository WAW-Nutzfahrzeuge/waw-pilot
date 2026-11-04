import {
    validateVehicleFolderResponse,
    type VehicleFolderRequest,
    type VehicleFolderResponse,
} from "./vehicle-folder-contract.ts";

export type VehicleFolderDispatchErrorCode =
    | "WEBHOOK_AUTH"
    | "REQUEST_FAILED"
    | "TIMEOUT"
    | "INVALID_RESPONSE"
    | "SAVE_FAILED";

export async function dispatchVehicleFolderWebhook({
    request,
    leaseToken,
    post,
    complete,
    fail,
}: {
    request: VehicleFolderRequest;
    leaseToken: string;
    post: (request: VehicleFolderRequest) => Promise<{ statusCode: number; body: unknown }>;
    complete: (response: VehicleFolderResponse, leaseToken: string) => Promise<boolean>;
    fail: (code: VehicleFolderDispatchErrorCode, leaseToken: string) => Promise<void>;
}): Promise<
    | { status: "ready"; response: VehicleFolderResponse }
    | { status: "error"; errorCode: VehicleFolderDispatchErrorCode }
> {
    try {
        const received = await post(request);
        if (received.statusCode === 401 || received.statusCode === 403) {
            throw new Error("WEBHOOK_AUTH");
        }
        if (received.statusCode < 200 || received.statusCode >= 300) {
            throw new Error("REQUEST_FAILED");
        }

        const response = validateVehicleFolderResponse(received.body, request);
        if (!response) throw new Error("INVALID_RESPONSE");
        if (!(await complete(response, leaseToken))) throw new Error("SAVE_FAILED");

        return { status: "ready", response };
    } catch (error) {
        const explicitCode = error instanceof Error ? error.message : "";
        const errorCode: VehicleFolderDispatchErrorCode = [
            "WEBHOOK_AUTH",
            "REQUEST_FAILED",
            "TIMEOUT",
            "INVALID_RESPONSE",
            "SAVE_FAILED",
        ].includes(explicitCode)
            ? (explicitCode as VehicleFolderDispatchErrorCode)
            : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
                ? "TIMEOUT"
                : "REQUEST_FAILED";

        await fail(errorCode, leaseToken);
        return { status: "error", errorCode };
    }
}
