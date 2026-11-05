"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import {
    checkPurchaseVehicleFolder,
    ensurePurchaseVehicleFolder,
    recreateMissingPurchaseVehicleFolder,
    type VehicleFolderCheckResult,
    type VehicleFolderResult,
} from "@/lib/purchases/vehicle-folder-integration";

export type VehicleFolderActionState = {
    success: boolean;
    status: VehicleFolderResult["status"] | null;
    folderName: string | null;
    folderUrl: string | null;
    lastError: string | null;
    errorCode: string | null;
};

export async function ensurePurchaseVehicleFolderAction(
    _previousState: VehicleFolderActionState,
    formData: FormData,
): Promise<VehicleFolderActionState> {
    const user = await getCurrentUserContext();
    const companyId = getCurrentCompanyId();
    const purchaseId = formData.get("purchase_id");
    const mode = formData.get("mode");

    if (user.companyId !== companyId || typeof purchaseId !== "string" || !/^[0-9a-f-]{36}$/i.test(purchaseId)) {
        return {
            success: false,
            status: "error",
            folderName: null,
            folderUrl: null,
            lastError: "Der Ankauf konnte nicht sicher zugeordnet werden.",
            errorCode: null,
        };
    }

    try {
        const result = mode === "recreate"
            ? await recreateMissingPurchaseVehicleFolder(companyId, purchaseId)
            : await ensurePurchaseVehicleFolder(companyId, purchaseId);
        revalidatePath(`/dashboard/ankauf/${purchaseId}`);
        return {
            success: result.status === "ready",
            status: result.status,
            folderName: result.folder_name,
            folderUrl: result.folder_url,
            lastError: result.last_error,
            errorCode: result.last_error_code,
        };
    } catch (error) {
        const errorCode = error instanceof Error ? error.message : "UNKNOWN";
        console.error("[purchase-vehicle-folder] action failed", { errorCode });
        return {
            success: false,
            status: "error",
            folderName: null,
            folderUrl: null,
            lastError:
                errorCode === "PURCHASE_NOT_FOUND" || errorCode === "VEHICLE_NOT_FOUND"
                    ? "Der Ankauf oder das zugehörige Fahrzeug wurde nicht gefunden."
                    : "Der Fahrzeugordner-Auftrag konnte nicht vorbereitet werden. Bitte versuche es erneut.",
            errorCode,
        };
    }
}

export type VehicleFolderCheckActionResult = VehicleFolderCheckResult;

export async function checkPurchaseVehicleFolderAction(
    purchaseId: string,
): Promise<VehicleFolderCheckActionResult> {
    const user = await getCurrentUserContext();
    const companyId = getCurrentCompanyId();
    if (user.companyId !== companyId || typeof purchaseId !== "string" || !/^[0-9a-f-]{36}$/i.test(purchaseId)) {
        return { status: "unavailable", message: "Ordner konnte gerade nicht geprüft werden." };
    }

    try {
        const result = await checkPurchaseVehicleFolder(companyId, purchaseId);
        try {
            revalidatePath(`/dashboard/ankauf/${purchaseId}`);
        } catch (error) {
            console.error("[purchase-vehicle-folder] inspection revalidation failed", {
                errorCode: error instanceof Error ? error.name : "UNKNOWN",
            });
        }
        return result;
    } catch (error) {
        const errorCode = error instanceof Error ? error.message : "UNKNOWN";
        console.error("[purchase-vehicle-folder] inspection failed", { errorCode });
        return { status: "unavailable", message: "Ordner konnte gerade nicht geprüft werden." };
    }
}
