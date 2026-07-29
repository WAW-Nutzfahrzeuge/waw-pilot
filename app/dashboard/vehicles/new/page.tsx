export const dynamic = "force-dynamic";

import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { getCustomers } from "@/lib/customers/customer-queries";

export default async function NewVehiclePage() {
    const customers = await getCustomers();

    return <VehicleForm customers={customers} />;
}
