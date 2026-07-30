export const dynamic = "force-dynamic";

import { SalesOverview } from "@/components/sales/sales-overview";
import { getSales } from "@/lib/sales/sale-queries";

type SalesPageProps = {
    searchParams: Promise<{
        paymentStatus?: string;
        month?: string;
    }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
    const [resolvedSearchParams, sales] = await Promise.all([
        searchParams,
        getSales(),
    ]);

    return (
        <SalesOverview
            sales={sales}
            initialPaymentStatus={resolvedSearchParams.paymentStatus ?? null}
            initialMonthFilter={resolvedSearchParams.month ?? null}
        />
    );
}
