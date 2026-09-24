import { PurchaseForm } from "@/components/purchases/purchase-form";
import { getPurchaseFormData } from "@/lib/purchases/purchase-form-data";
import { resolvePurchasePrefillVehicleId } from "@/lib/purchases/vehicle-purchase-eligibility";

export const dynamic = "force-dynamic";

type NewPurchasePageProps = {
    searchParams: Promise<{
        vehicleId?: string;
    }>;
};

export default async function NewPurchasePage({
    searchParams,
}: NewPurchasePageProps) {
    const [{ vehicleId }, formData] = await Promise.all([
        searchParams,
        getPurchaseFormData(),
    ]);

    // Server-side validation: only ever pre-select a vehicle that belongs to
    // this company (implicit, since formData.vehicles is company-scoped),
    // exists, and does not already have an active purchase or "sold" status.
    const preselectedVehicleId = resolvePurchasePrefillVehicleId(
        formData.vehicles,
        vehicleId,
    );

    return (
        <PurchaseForm
            formData={formData}
            initialValues={
                preselectedVehicleId ? { vehicle_id: preselectedVehicleId } : undefined
            }
        />
    );
}
