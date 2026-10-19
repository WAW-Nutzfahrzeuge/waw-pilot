type ProformaHistoryInvoice = {
    id: string;
    sale_id: string;
    invoice_type: string;
    status: string;
};

/**
 * A final invoice on the same sale is authoritative evidence that the
 * proforma is historical, even if the best-effort status update was missed.
 */
export function getPastProformaInvoiceIds(
    invoices: readonly ProformaHistoryInvoice[],
): Set<string> {
    const saleIdsWithStandardInvoices = new Set(
        invoices
            .filter((invoice) => invoice.invoice_type === "standard")
            .map((invoice) => invoice.sale_id),
    );

    return new Set(
        invoices
            .filter(
                (invoice) =>
                    invoice.invoice_type === "proforma" &&
                    (invoice.status === "converted" ||
                        saleIdsWithStandardInvoices.has(invoice.sale_id)),
            )
            .map((invoice) => invoice.id),
    );
}
