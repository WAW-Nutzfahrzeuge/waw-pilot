export type VehicleFolderIdentity = {
    purchaseId: string;
    purchaseNumber: string | null;
    manufacturer: string | null;
    model: string | null;
    vehicleType: string | null;
    vehicleCategory: string | null;
};

export type VehicleFolderRequest = {
    event_id: string;
    event: "purchase.folder.ensure";
    purchase_id: string;
    vehicle_id: string;
    folder_name: string;
    drive_id: string;
    root_folder_id: string;
};

export type VehicleFolderResponse = {
    status: "ready";
    event_id: string;
    purchase_id: string;
    vehicle_id: string;
    folder_name: string;
    drive_id: string;
    folder_id: string;
    folder_url: string;
    registration_folder_id?: string | null;
    images_folder_id: string;
};

function safeFolderSegment(value: string, maxLength = 64): string {
    const normalized = value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/\.{2,}/g, ".")
        .replace(/^[.\s-]+|[.\s-]+$/g, "")
        .slice(0, maxLength)
        .replace(/[.\s-]+$/g, "");

    return normalized && normalized !== "." && normalized !== ".."
        ? normalized
        : "Fahrzeug";
}

export function buildVehicleFolderName(identity: VehicleFolderIdentity): string {
    const purchaseReference = identity.purchaseNumber
        ? safeFolderSegment(identity.purchaseNumber, 40)
        : `EK-${safeFolderSegment(identity.purchaseId, 36)}`;
    const vehicleName = [identity.manufacturer, identity.model]
        .filter((part): part is string => Boolean(part?.trim()))
        .join("-");
    const vehicleDescription = identity.vehicleCategory?.trim() || identity.vehicleType?.trim();
    const segments = [
        purchaseReference,
        vehicleName ? safeFolderSegment(vehicleName, 72) : null,
        vehicleDescription ? safeFolderSegment(vehicleDescription, 48) : null,
    ].filter((value): value is string => Boolean(value));

    return segments.join("_").slice(0, 220).replace(/[.\s]+$/g, "");
}

function isValidOneDriveFolderUrl(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2048) return false;

    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        const allowedHost =
            hostname === "1drv.ms" ||
            hostname === "onedrive.live.com" ||
            hostname === "sharepoint.com" ||
            hostname.endsWith(".sharepoint.com");

        return url.protocol === "https:" && allowedHost && !url.username && !url.password;
    } catch {
        return false;
    }
}

function nonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 1024;
}

export function validateVehicleFolderResponse(
    value: unknown,
    expected: VehicleFolderRequest,
): VehicleFolderResponse | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const response = value as Record<string, unknown>;
    const registrationFolderId = response.registration_folder_id;
    const validOptionalRegistrationFolderId =
        registrationFolderId === undefined ||
        registrationFolderId === null ||
        nonEmptyString(registrationFolderId);

    if (
        response.status !== "ready" ||
        response.event_id !== expected.event_id ||
        response.purchase_id !== expected.purchase_id ||
        response.vehicle_id !== expected.vehicle_id ||
        response.folder_name !== expected.folder_name ||
        response.drive_id !== expected.drive_id ||
        !nonEmptyString(response.folder_id) ||
        !validOptionalRegistrationFolderId ||
        !nonEmptyString(response.images_folder_id) ||
        !isValidOneDriveFolderUrl(response.folder_url)
    ) {
        return null;
    }

    return response as VehicleFolderResponse;
}
