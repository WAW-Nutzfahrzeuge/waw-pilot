import { SaleForm } from "@/components/sales/sale-form";
import { getSaleFormCustomers } from "@/lib/customers/customer-queries";
import { getSellableVehicles } from "@/lib/vehicles/vehicle-queries";

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

    return (
        <SaleForm
            customers={customers}
            vehicles={vehicles}
            defaultVehicleId={vehicleId ?? null}
            defaultCustomerId={customerId ?? null}
        />
    );
}
