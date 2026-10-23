type SaleDocumentReferenceData = {
    sale?: {
        invoiceNumber?: string | null;
        saleNumber?: string | null;
    } | null;
};

export function getSaleDocumentReference(
    data: SaleDocumentReferenceData,
): string | null {
    return data.sale?.invoiceNumber?.trim() || data.sale?.saleNumber?.trim() || null;
}
