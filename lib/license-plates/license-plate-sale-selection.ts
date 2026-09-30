export type LicensePlateSaleSelection = {
    id: string;
};

export function getSelectedLicensePlateFormSale<T extends LicensePlateSaleSelection>(
    sales: T[],
    saleId: string,
): T | null {
    return sales.find((sale) => sale.id === saleId) ?? null;
}
