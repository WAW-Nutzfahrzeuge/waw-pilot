export const dynamic = "force-dynamic";

import { CustomersOverview } from "@/components/customers/customers-overview";
import { getCustomers } from "@/lib/customers/customer-queries";

type CustomersPageProps = {
    searchParams: Promise<{
        customerSaved?: string;
        customerCreated?: string;
        createdCustomerId?: string;
        savedCustomerId?: string;
    }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
    const [resolvedSearchParams, customers] = await Promise.all([
        searchParams,
        getCustomers(),
    ]);

    return (
        <CustomersOverview
            customers={customers}
            customerSaved={resolvedSearchParams.customerSaved === "1"}
            customerCreated={resolvedSearchParams.customerCreated === "1"}
            highlightedCustomerId={
                resolvedSearchParams.createdCustomerId ??
                resolvedSearchParams.savedCustomerId
            }
        />
    );
}
