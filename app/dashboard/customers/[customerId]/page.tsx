import { CustomerDetail } from "@/components/customers/customer-detail";
import { getCustomerDetail } from "@/lib/customers/customer-detail-queries";

type CustomerDetailPageProps = {
    params: Promise<{
        customerId: string;
    }>;
    searchParams: Promise<{
        customerSaved?: string;
        customerCreated?: string;
        highlight?: string;
    }>;
};

export default async function CustomerDetailPage({
                                                     params,
                                                     searchParams,
                                                 }: CustomerDetailPageProps) {
    const { customerId } = await params;
    const [resolvedSearchParams, customer] = await Promise.all([
        searchParams,
        getCustomerDetail(customerId),
    ]);

    return (
        <CustomerDetail
            customer={customer}
            customerSaved={resolvedSearchParams.customerSaved === "1"}
            customerCreated={resolvedSearchParams.customerCreated === "1"}
            highlight={resolvedSearchParams.highlight === "1"}
        />
    );
}
