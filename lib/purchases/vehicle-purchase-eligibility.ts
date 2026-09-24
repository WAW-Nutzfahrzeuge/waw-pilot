export type VehiclePurchaseEligibilityResult = {
    eligible: boolean;
    reason: string | null;
};

export function evaluateVehiclePurchaseEligibility({
    status,
    hasExistingPurchase,
}: {
    status: string | null | undefined;
    hasExistingPurchase: boolean;
}): VehiclePurchaseEligibilityResult {
    if (hasExistingPurchase) {
        return {
            eligible: false,
            reason: "Für dieses Fahrzeug existiert bereits ein Ankauf.",
        };
    }

    if (status === "sold") {
        return {
            eligible: false,
            reason:
                "Dieses Fahrzeug wurde bereits verkauft und kann nicht erneut angekauft werden.",
        };
    }

    return { eligible: true, reason: null };
}

type PrefillVehicle = {
    id: string;
    disabled?: boolean;
};

/**
 * Resolves a `vehicleId` query param against the company-scoped, already
 * eligibility-annotated vehicle list. Returns null for any id that is
 * missing, belongs to a different company (never present in `vehicles`),
 * or is already disabled (sold / already purchased).
 */
export function resolvePurchasePrefillVehicleId(
    vehicles: readonly PrefillVehicle[],
    requestedVehicleId: string | null | undefined,
): string | null {
    if (!requestedVehicleId) return null;

    const vehicle = vehicles.find((item) => item.id === requestedVehicleId);

    if (!vehicle || vehicle.disabled) return null;

    return vehicle.id;
}

type VehicleForPurchaseAction = {
    id: string;
    status: string | null;
    purchase_id: string | null;
};

export type VehiclePurchaseAction =
    | { kind: "create"; href: string; label: "Fahrzeug ankaufen" }
    | { kind: "open"; href: string; label: "Ankauf öffnen" }
    | { kind: "none" };

export function getVehiclePurchaseAction(
    vehicle: VehicleForPurchaseAction,
): VehiclePurchaseAction {
    if (vehicle.purchase_id) {
        return {
            kind: "open",
            href: `/dashboard/ankauf/${vehicle.purchase_id}`,
            label: "Ankauf öffnen",
        };
    }

    const eligibility = evaluateVehiclePurchaseEligibility({
        status: vehicle.status,
        hasExistingPurchase: false,
    });

    if (!eligibility.eligible) {
        return { kind: "none" };
    }

    return {
        kind: "create",
        href: `/dashboard/ankauf/new?vehicleId=${encodeURIComponent(vehicle.id)}`,
        label: "Fahrzeug ankaufen",
    };
}
