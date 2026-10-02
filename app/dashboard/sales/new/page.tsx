import { SaleForm } from "@/components/sales/sale-form";
import { getSaleFormCustomers } from "@/lib/customers/customer-queries";
import { getCompanySettings } from "@/lib/settings/company-settings-queries";
import { getSellableVehicles } from "@/lib/vehicles/vehicle-queries";
import { resolveSalePrefillVehicleId } from "@/lib/sales/sale-create-prefill";

type NewSalePageProps = {
    searchParams: Promise<{
        vehicleId?: string;
        customerId?: string;
    }>;
};

export default async function NewSalePage({ searchParams }: NewSalePageProps) {
    const [{ vehicleId, customerId }, customers, vehicles, company] = await Promise.all([
        searchParams,
        getSaleFormCustomers(),
        getSellableVehicles(),
        getCompanySettings(),
    ]);
    const defaultVehicleId = resolveSalePrefillVehicleId(vehicles, vehicleId);

    return (
        <SaleForm
            customers={customers}
            vehicles={vehicles}
            companyVatId={company.vat_id}
            defaultVehicleId={defaultVehicleId}
            defaultCustomerId={customerId ?? null}
        />
    );
}
