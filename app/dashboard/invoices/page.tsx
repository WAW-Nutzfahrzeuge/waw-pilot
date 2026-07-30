export const dynamic = "force-dynamic";

import { InvoicesOverview } from "@/components/invoices/invoices-overview";
import { getInvoices } from "@/lib/invoices/invoice-queries";

type InvoicesPageProps = {
    searchParams: Promise<{
        invoiceCreated?: string;
        invoiceRegenerated?: string;
        highlightInvoiceId?: string;
    }>;
};

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
    const [resolvedSearchParams, invoices] = await Promise.all([
        searchParams,
        getInvoices(),
    ]);

    return (
        <InvoicesOverview
            invoices={invoices}
            invoiceCreated={Boolean(resolvedSearchParams.invoiceCreated)}
            invoiceRegenerated={Boolean(resolvedSearchParams.invoiceRegenerated)}
            highlightedInvoiceId={resolvedSearchParams.highlightInvoiceId}
        />
    );
}
