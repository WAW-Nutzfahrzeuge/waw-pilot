"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import {
    ensurePurchaseVehicleFolder,
    type VehicleFolderResult,
} from "@/lib/purchases/vehicle-folder-integration";

export type VehicleFolderActionState = {
    success: boolean;
    status: VehicleFolderResult["status"] | null;
    folderName: string | null;
    folderUrl: string | null;
    lastError: string | null;
};

export async function ensurePurchaseVehicleFolderAction(
    _previousState: VehicleFolderActionState,
    formData: FormData,
): Promise<VehicleFolderActionState> {
    const user = await getCurrentUserContext();
    const companyId = getCurrentCompanyId();
    const purchaseId = formData.get("purchase_id");

    if (user.companyId !== companyId || typeof purchaseId !== "string" || !/^[0-9a-f-]{36}$/i.test(purchaseId)) {
        return {
            success: false,
            status: "error",
            folderName: null,
            folderUrl: null,
            lastError: "Der Ankauf konnte nicht sicher zugeordnet werden.",
        };
    }

    try {
        const result = await ensurePurchaseVehicleFolder(companyId, purchaseId);
        revalidatePath(`/dashboard/ankauf/${purchaseId}`);
        return {
            success: result.status === "ready",
            status: result.status,
            folderName: result.folder_name,
            folderUrl: result.folder_url,
            lastError: result.last_error,
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
        };
    }
}
