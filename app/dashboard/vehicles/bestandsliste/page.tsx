export const dynamic = "force-dynamic";

import { VehicleStockOverview } from "@/components/vehicles/vehicle-stock-overview";
import { getInventoryListRows } from "@/lib/vehicles/inventory-list-queries";

export default async function VehicleInventoryListPage() {
    const rows = await getInventoryListRows();

    return <VehicleStockOverview rows={rows} />;
}