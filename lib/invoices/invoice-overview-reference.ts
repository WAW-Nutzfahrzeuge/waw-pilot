type InvoiceOverviewReferenceInput = {
    invoice_number: string;
    sale_number: string | null;
    sale_id: string;
};

export function getInvoiceOverviewReference(
    invoice: InvoiceOverviewReferenceInput,
): { invoiceNumber: string; saleReference: string } {
    return {
        invoiceNumber: invoice.invoice_number,
        saleReference: invoice.sale_number ?? invoice.sale_id,
    };
}
