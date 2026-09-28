export const dynamic = "force-dynamic";

import { PurchasesOverview } from "@/components/purchases/purchases-overview";
import { getPurchaseCases } from "@/lib/purchases/purchase-queries";
import { getCurrentInventoryValueNet } from "@/lib/vehicles/vehicle-queries";

export default async function PurchasesPage() {
    const [purchases, currentInventoryValueNet] = await Promise.all([
        getPurchaseCases(),
        getCurrentInventoryValueNet(),
    ]);

    return (
        <PurchasesOverview
            purchases={purchases}
            currentInventoryValueNet={currentInventoryValueNet}
        />
    );
}
