import { SaleForm } from "@/components/sales/sale-form";
import { getSaleFormCustomers } from "@/lib/customers/customer-queries";
import { getSellableVehicles } from "@/lib/vehicles/vehicle-queries";
import { resolveSalePrefillVehicleId } from "@/lib/sales/sale-create-prefill";

type NewSalePageProps = {
    searchParams: Promise<{
        vehicleId?: string;
        customerId?: string;
    }>;
};

export default async function NewSalePage({ searchParams }: NewSalePageProps) {
    const [{ vehicleId, customerId }, customers, vehicles] = await Promise.all([
        searchParams,
        getSaleFormCustomers(),
        getSellableVehicles(),
    ]);
    const defaultVehicleId = resolveSalePrefillVehicleId(vehicles, vehicleId);

    return (
        <SaleForm
            customers={customers}
            vehicles={vehicles}
            defaultVehicleId={defaultVehicleId}
            defaultCustomerId={customerId ?? null}
        />
    );
}
