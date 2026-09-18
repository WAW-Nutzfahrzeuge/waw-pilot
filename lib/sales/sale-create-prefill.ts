import { evaluateVehicleSaleEligibility } from "./vehicle-sale-eligibility.ts";

type SalePrefillVehicle = {
    id: string;
    status: string | null;
};

type VehicleDetailSaleForAction = {
    id: string;
    status?: string | null;
};

type VehicleDetailForSaleAction = {
    id: string;
    status: string | null;
    sales: readonly VehicleDetailSaleForAction[];
};

export type VehicleSaleAction =
    | {
    kind: "create";
    href: string;
    label: "Fahrzeug verkaufen";
}
    | {
    kind: "open";
    href: string;
    label: "Verkauf öffnen";
}
    | {
    kind: "none";
};

export function resolveSalePrefillVehicleId(
    vehicles: readonly SalePrefillVehicle[],
    requestedVehicleId: string | null | undefined,
): string | null {
    if (!requestedVehicleId) return null;

    const vehicle = vehicles.find((item) => item.id === requestedVehicleId);

    if (!vehicle) return null;

    return evaluateVehicleSaleEligibility(vehicle.status).eligible ? vehicle.id : null;
}

export function getVehicleSaleAction(
    vehicle: VehicleDetailForSaleAction,
): VehicleSaleAction {
    const existingSale = vehicle.sales.find((sale) => sale.status !== "cancelled");

    if (existingSale) {
        return {
            kind: "open",
            href: `/dashboard/sales/${existingSale.id}`,
            label: "Verkauf öffnen",
        };
    }

    if (!evaluateVehicleSaleEligibility(vehicle.status).eligible) {
        return { kind: "none" };
    }

    return {
        kind: "create",
        href: `/dashboard/sales/new?vehicleId=${encodeURIComponent(vehicle.id)}`,
        label: "Fahrzeug verkaufen",
    };
}
