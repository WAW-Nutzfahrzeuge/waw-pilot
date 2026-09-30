export const saleCustomDocumentType = "sale_custom_document";
export const maxSaleCustomDocumentLabelLength = 120;

export function isSaleCustomDocument(documentType: string | null | undefined): boolean {
    return documentType === saleCustomDocumentType;
}

export function normalizeSaleCustomDocumentLabel(
    value: string | null | undefined,
): string | null {
    const label = value?.trim().replace(/\s+/g, " ") ?? "";

    if (!label || label.length > maxSaleCustomDocumentLabelLength) return null;

    return label;
}
