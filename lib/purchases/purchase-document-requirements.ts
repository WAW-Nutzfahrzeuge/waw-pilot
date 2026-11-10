export type PurchaseDocumentType = "vehicle_registration" | "purchase_invoice";

type VehicleClassification = {
    vehicle_type?: string | null;
    vehicle_category?: string | null;
};

type PurchaseDocumentStatusInput = {
    document_type: string;
    status: string;
};

const BAUMASCHINE_PATTERN = /\bbaumaschinen?\b/i;

export function isConstructionMachine(
    vehicle: VehicleClassification | null | undefined,
): boolean {
    return [vehicle?.vehicle_type, vehicle?.vehicle_category].some((value) =>
        BAUMASCHINE_PATTERN.test(value?.trim() ?? ""),
    );
}

export function getRequiredPurchaseDocumentTypes(
    vehicle: VehicleClassification | null | undefined,
): PurchaseDocumentType[] {
    return isConstructionMachine(vehicle)
        ? ["purchase_invoice"]
        : ["vehicle_registration", "purchase_invoice"];
}

export function hasRequiredPurchaseDocuments(params: {
    vehicle: VehicleClassification | null | undefined;
    documents: PurchaseDocumentStatusInput[];
}): boolean {
    const availableTypes = new Set(
        params.documents
            .filter((document) => document.status === "available")
            .map((document) => document.document_type),
    );

    return getRequiredPurchaseDocumentTypes(params.vehicle).every((documentType) =>
        availableTypes.has(documentType),
    );
}
