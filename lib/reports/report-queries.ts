import { getCashbookEntries } from "@/lib/cashbook/cashbook-queries";
import {
    calculateBalance,
    calculateTotalExpenses,
    calculateTotalIncome,
} from "@/lib/cashbook/cashbook-helpers";
import { getInvoices } from "@/lib/invoices/invoice-queries";
import { getPurchaseCases } from "@/lib/purchases/purchase-queries";
import { getSales } from "@/lib/sales/sale-queries";
import { getSaleProfitNet } from "@/lib/sales/sale-helpers";
import { getVehicles } from "@/lib/vehicles/vehicle-queries";

export type ReportsPeriod =
    | "all"
    | "current_month"
    | "current_year"
    | "last_30_days"
    | "custom";

export type ReportsFilters = {
    period: ReportsPeriod;
    dateFrom: string | null;
    dateTo: string | null;
};

export type ReportsData = {
    period: ReportsPeriod;
    periodLabel: string;
    dateFrom: string | null;
    dateTo: string | null;

    totalRevenueNet: number;
    totalSalesGross: number;
    totalProfitNet: number;
    averageProfitNet: number;

    totalPurchaseNet: number;
    totalPurchaseGross: number;
    openPurchasePaymentsGross: number;

    openInvoicesGross: number;
    openInvoicesCount: number;

    cashbookIncome: number;
    cashbookExpenses: number;
    cashbookBalance: number;

    vehiclesCount: number;
    currentVehiclesCount: number;
    soldVehiclesCount: number;
    inventoryValueNet: number;

    topSalesByRevenue: {
        id: string;
        invoiceNumber: string | null;
        customerName: string;
        vehicleName: string;
        saleDate: string;
        revenueNet: number;
        profitNet: number;
    }[];

    topSalesByProfit: {
        id: string;
        invoiceNumber: string | null;
        customerName: string;
        vehicleName: string;
        saleDate: string;
        revenueNet: number;
        profitNet: number;
    }[];

    topPurchasesByAmount: {
        id: string;
        purchaseNumber: string | null;
        sellerName: string | null;
        vehicleName: string | null;
        purchaseDate: string;
        grossAmount: number;
        paymentStatus: string;
    }[];

    openInvoices: {
        id: string;
        saleId: string;
        invoiceNumber: string;
        customerName: string;
        vehicleName: string;
        grossAmount: number;
        invoiceDate: string;
    }[];

    openPurchases: {
        id: string;
        purchaseNumber: string | null;
        sellerName: string | null;
        vehicleName: string | null;
        grossAmount: number;
        purchaseDate: string;
    }[];
};

function toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function isValidDateString(value: string | null | undefined): value is string {
    if (!value) return false;

    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getSingleSearchParam(
    value: string | string[] | undefined,
): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function getPeriodRange(period: ReportsPeriod): {
    dateFrom: string | null;
    dateTo: string | null;
    label: string;
} {
    const now = new Date();

    if (period === "current_month") {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);

        return {
            dateFrom: toDateString(from),
            dateTo: toDateString(now),
            label: "Aktueller Monat",
        };
    }

    if (period === "current_year") {
        const from = new Date(now.getFullYear(), 0, 1);

        return {
            dateFrom: toDateString(from),
            dateTo: toDateString(now),
            label: "Aktuelles Jahr",
        };
    }

    if (period === "last_30_days") {
        const from = new Date(now);
        from.setDate(from.getDate() - 30);

        return {
            dateFrom: toDateString(from),
            dateTo: toDateString(now),
            label: "Letzte 30 Tage",
        };
    }

    return {
        dateFrom: null,
        dateTo: null,
        label: "Insgesamt",
    };
}

function getCustomPeriodLabel(dateFrom: string | null, dateTo: string | null): string {
    if (dateFrom && dateTo) return "Individueller Zeitraum";
    if (dateFrom) return "Ab ausgewähltem Datum";
    if (dateTo) return "Bis ausgewähltem Datum";

    return "Individueller Zeitraum";
}

function isInDateRange(
    dateString: string | null | undefined,
    dateFrom: string | null,
    dateTo: string | null,
): boolean {
    if (!dateString) return false;
    if (dateFrom && dateString < dateFrom) return false;
    if (dateTo && dateString > dateTo) return false;

    return true;
}

export function parseReportsFilters(searchParams: {
    period?: string | string[];
    date_from?: string | string[];
    date_to?: string | string[];
}): ReportsFilters {
    const rawPeriod = getSingleSearchParam(searchParams.period);

    const requestedDateFrom = getSingleSearchParam(searchParams.date_from);
    const requestedDateTo = getSingleSearchParam(searchParams.date_to);

    const dateFrom = isValidDateString(requestedDateFrom)
        ? requestedDateFrom
        : null;

    const dateTo = isValidDateString(requestedDateTo) ? requestedDateTo : null;

    if (dateFrom || dateTo || rawPeriod === "custom") {
        return {
            period: "custom",
            dateFrom,
            dateTo,
        };
    }

    if (
        rawPeriod === "current_month" ||
        rawPeriod === "current_year" ||
        rawPeriod === "last_30_days"
    ) {
        return {
            period: rawPeriod,
            dateFrom: null,
            dateTo: null,
        };
    }

    return {
        period: "all",
        dateFrom: null,
        dateTo: null,
    };
}

export async function getReportsData(
    filters: ReportsFilters,
): Promise<ReportsData> {
    const presetRange = getPeriodRange(filters.period);

    const dateFrom =
        filters.period === "custom" ? filters.dateFrom : presetRange.dateFrom;

    const dateTo =
        filters.period === "custom" ? filters.dateTo : presetRange.dateTo;

    const periodLabel =
        filters.period === "custom"
            ? getCustomPeriodLabel(dateFrom, dateTo)
            : presetRange.label;

    const [vehicles, sales, invoices, purchases, cashbookEntries] =
        await Promise.all([
            getVehicles(),
            getSales(),
            getInvoices(),
            getPurchaseCases(),
            getCashbookEntries(),
        ]);

    const filteredSales =
        dateFrom || dateTo
            ? sales.filter((sale) => isInDateRange(sale.sale_date, dateFrom, dateTo))
            : sales;

    const filteredInvoices =
        dateFrom || dateTo
            ? invoices.filter((invoice) =>
                isInDateRange(invoice.invoice_date, dateFrom, dateTo),
            )
            : invoices;

    const filteredPurchases =
        dateFrom || dateTo
            ? purchases.filter((purchase) =>
                isInDateRange(purchase.purchase_date, dateFrom, dateTo),
            )
            : purchases;

    const filteredCashbookEntries =
        dateFrom || dateTo
            ? cashbookEntries.filter((entry) =>
                isInDateRange(entry.booking_date, dateFrom, dateTo),
            )
            : cashbookEntries;

    const currentVehicles = vehicles.filter(
        (vehicle) => vehicle.status === "in_stock" || vehicle.status === "reserved",
    );

    const soldVehicles = vehicles.filter((vehicle) => vehicle.status === "sold");

    const totalRevenueNet = filteredSales.reduce(
        (sum, sale) => sum + sale.net_amount,
        0,
    );

    const totalSalesGross = filteredSales.reduce(
        (sum, sale) => sum + sale.gross_amount,
        0,
    );

    const totalProfitNet = filteredSales.reduce(
        (sum, sale) => sum + getSaleProfitNet(sale),
        0,
    );

    const averageProfitNet =
        filteredSales.length > 0 ? totalProfitNet / filteredSales.length : 0;

    const totalPurchaseNet = filteredPurchases.reduce(
        (sum, purchase) => sum + purchase.net_amount,
        0,
    );

    const totalPurchaseGross = filteredPurchases.reduce(
        (sum, purchase) => sum + purchase.gross_amount,
        0,
    );

    const openPurchasePayments = filteredPurchases.filter(
        (purchase) => purchase.payment_status !== "paid",
    );

    const openPurchasePaymentsGross = openPurchasePayments.reduce(
        (sum, purchase) => sum + purchase.gross_amount,
        0,
    );

    const openInvoices = filteredInvoices.filter(
        (invoice) => invoice.payment_status !== "paid",
    );

    const openInvoicesGross = openInvoices.reduce(
        (sum, invoice) => sum + invoice.gross_amount,
        0,
    );

    const inventoryValueNet = currentVehicles.reduce(
        (sum, vehicle) => sum + Number(vehicle.purchase_price_net ?? 0),
        0,
    );

    const mappedSales = filteredSales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoice_number,
        customerName: sale.customer_name,
        vehicleName: sale.vehicle_name,
        saleDate: sale.sale_date,
        revenueNet: sale.net_amount,
        profitNet: getSaleProfitNet(sale),
    }));

    return {
        period: filters.period,
        periodLabel,
        dateFrom,
        dateTo,

        totalRevenueNet,
        totalSalesGross,
        totalProfitNet,
        averageProfitNet,

        totalPurchaseNet,
        totalPurchaseGross,
        openPurchasePaymentsGross,

        openInvoicesGross,
        openInvoicesCount: openInvoices.length,

        cashbookIncome: calculateTotalIncome(filteredCashbookEntries),
        cashbookExpenses: calculateTotalExpenses(filteredCashbookEntries),
        cashbookBalance: calculateBalance(filteredCashbookEntries),

        vehiclesCount: vehicles.length,
        currentVehiclesCount: currentVehicles.length,
        soldVehiclesCount: soldVehicles.length,
        inventoryValueNet,

        topSalesByRevenue: [...mappedSales]
            .sort((a, b) => b.revenueNet - a.revenueNet)
            .slice(0, 5),

        topSalesByProfit: [...mappedSales]
            .sort((a, b) => b.profitNet - a.profitNet)
            .slice(0, 5),

        topPurchasesByAmount: filteredPurchases
            .map((purchase) => ({
                id: purchase.id,
                purchaseNumber: purchase.purchase_number,
                sellerName: purchase.seller_name,
                vehicleName: purchase.vehicle_name,
                purchaseDate: purchase.purchase_date,
                grossAmount: purchase.gross_amount,
                paymentStatus: purchase.payment_status,
            }))
            .sort((a, b) => b.grossAmount - a.grossAmount)
            .slice(0, 5),

        openInvoices: openInvoices.slice(0, 5).map((invoice) => ({
            id: invoice.id,
            saleId: invoice.sale_id,
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            vehicleName: invoice.vehicle_name,
            grossAmount: invoice.gross_amount,
            invoiceDate: invoice.invoice_date,
        })),

        openPurchases: openPurchasePayments.slice(0, 5).map((purchase) => ({
            id: purchase.id,
            purchaseNumber: purchase.purchase_number,
            sellerName: purchase.seller_name,
            vehicleName: purchase.vehicle_name,
            grossAmount: purchase.gross_amount,
            purchaseDate: purchase.purchase_date,
        })),
    };
}
