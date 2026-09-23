import type { SaleStatus } from "@/lib/sales/sale-queries";
import type { VehicleStatus } from "@/lib/vehicles/vehicle-queries";

/**
 * Zentrale Regeln dafür, was bei einer vollständigen Stornorechnung mit dem
 * zugehörigen Verkauf und Fahrzeug passiert. Wird sowohl von
 * `SupabaseInvoiceCorrectionRepository.createCancellationInvoice()` als auch
 * von den Tests verwendet, damit Produktionslogik und Tests nicht auseinanderlaufen.
 */

export const SALE_STATUS_AFTER_CANCELLATION: SaleStatus = "cancelled";

export const VEHICLE_STATUS_AFTER_CANCELLATION: VehicleStatus = "in_stock";

export const VEHICLE_STATUS_REQUIRED_FOR_RELEASE: VehicleStatus = "sold";

/** Spiegelt den Bestandsfilter aus lib/vehicles/vehicle-queries.ts (Zeile ~433). */
const PURCHASABLE_VEHICLE_STATUSES: readonly VehicleStatus[] = ["in_stock", "reserved"];

/**
 * Nur ein Fahrzeug, das aktuell als "sold" markiert ist, darf durch eine
 * Stornierung automatisch wieder freigegeben werden. Das verhindert, dass ein
 * bereits anderweitig freigegebenes oder reserviertes Fahrzeug versehentlich
 * überschrieben wird.
 */
export function canVehicleBeReleasedAfterCancellation(currentVehicleStatus: VehicleStatus): boolean {
    return currentVehicleStatus === VEHICLE_STATUS_REQUIRED_FOR_RELEASE;
}

/** Erneut käuflich = taucht wieder in den Bestandslisten auf. */
export function isVehiclePurchasableAgain(status: VehicleStatus): boolean {
    return PURCHASABLE_VEHICLE_STATUSES.includes(status);
}
