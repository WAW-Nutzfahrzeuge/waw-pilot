export type InventoryStockStatus = "in_stock" | "reserved" | "sold";

export type InventoryStockDateRow = {
    purchaseDate: string | null;
    saleDate: string | null;
};

export type InventoryValueRow = {
    status: InventoryStockStatus;
    purchaseNetAmount: number;
};

export type InventorySearchRow = {
    stockNumber: string;
    vehicleLabel: string;
    vin: string;
    vinLastSix: string;
    licensePlate: string | null;
    stockStartDate: string | null;
    stockEndDate: string | null;
    purchaseNumber: string | null;
    purchaseDate: string | null;
    sellerName: string | null;
    purchaseNetAmount: number;
    additionalCostsNet: number;
    saleNumber: string | null;
    saleDate: string | null;
    buyerName: string | null;
    saleNetAmount: number | null;
    invoiceNumber: string | null;
    rawProfitNet: number | null;
    statusLabel: string;
};

export function buildInventorySearchText({
    row,
    formatDate,
    formatMoney,
}: {
    row: InventorySearchRow;
    formatDate: (value: string | null) => string;
    formatMoney: (value: number | null) => string;
}): string {
    return [
        row.stockNumber,
        row.vehicleLabel,
        row.vin,
        row.vinLastSix,
        row.licensePlate,
        row.stockStartDate,
        formatDate(row.stockStartDate),
        row.stockEndDate,
        formatDate(row.stockEndDate),
        row.purchaseNumber,
        row.purchaseDate,
        formatDate(row.purchaseDate),
        row.sellerName,
        formatMoney(row.purchaseNetAmount),
        formatMoney(row.additionalCostsNet),
        row.saleNumber,
        row.saleDate,
        formatDate(row.saleDate),
        row.buyerName,
        formatMoney(row.saleNetAmount),
        row.invoiceNumber,
        formatMoney(row.rawProfitNet),
        row.statusLabel,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

export function calculateInventoryValueNet(rows: InventoryValueRow[]): number {
    return rows.reduce((total, row) => {
        if (row.status !== "in_stock" && row.status !== "reserved") {
            return total;
        }

        return total + row.purchaseNetAmount;
    }, 0);
}

export function calculateHistoricalInventoryValueNet(
    rows: Pick<InventoryValueRow, "purchaseNetAmount">[],
): number {
    return rows.reduce((total, row) => total + row.purchaseNetAmount, 0);
}

export function wasVehicleInInventoryPeriod({
    row,
    fromDate,
    toDate,
}: {
    row: InventoryStockDateRow;
    fromDate: string;
    toDate: string;
}): boolean {
    if (!fromDate && !toDate) return true;
    if (!row.purchaseDate) return false;

    const saleDate = row.saleDate;

    if (toDate && (!fromDate || fromDate === toDate)) {
        return row.purchaseDate <= toDate && (!saleDate || saleDate > toDate);
    }

    const filterFromDate = fromDate || "0001-01-01";
    const filterToDate = toDate || "9999-12-31";

    return (
        row.purchaseDate <= filterToDate &&
        (!saleDate || saleDate > filterFromDate)
    );
}
