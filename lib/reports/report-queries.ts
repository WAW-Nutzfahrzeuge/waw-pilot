import { getCashbookEntries } from "@/lib/cashbook/cashbook-queries";
import {
    calculateBalance,
    calculateTotalExpenses,
    calculateTotalIncome,
} from "@/lib/cashbook/cashbook-helpers";
import { getCurrentCompanyId } from "@/lib/company";
import { getVehicleReportSummary } from "@/lib/vehicles/vehicle-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseRelation<T> = T | T[] | null;

type ReportSaleRow = {
    id: string;
    sale_date: string;
    net_amount: number | string;
    gross_amount: number | string;
    vehicles: {
        manufacturer: string;
        model: string;
        purchase_price_net: number | string;
        additional_costs_net: number | string;
    } | null;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
    invoices: SupabaseRelation<{
        invoice_number: string;
        invoice_type: string | null;
    }>;
};

type ReportInvoiceRow = {
    id: string;
    sale_id: string;
    invoice_number: string;
    invoice_date: string;
    gross_amount: number | string;
    payment_status: string;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
    vehicles: {
        manufacturer: string;
        model: string;
    } | null;
};

type ReportPurchaseRow = {
    id: string;
    purchase_number: string | null;
    purchase_date: string;
    net_amount: number | string;
    gross_amount: number | string;
    payment_status: string;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
    vehicles: {
        manufacturer: string;
        model: string;
    } | null;
};

type ReportSale = {
    id: string;
    invoiceNumber: string | null;
    customerName: string;
    vehicleName: string;
    saleDate: string;
    revenueNet: number;
    salesGross: number;
    profitNet: number;
};

type ReportInvoice = {
    id: string;
    saleId: string;
    invoiceNumber: string;
    customerName: string;
    vehicleName: string;
    grossAmount: number;
    invoiceDate: string;
    paymentStatus: string;
};

type ReportPurchase = {
    id: string;
    purchaseNumber: string | null;
    sellerName: string | null;
    vehicleName: string | null;
    purchaseDate: string;
    netAmount: number;
    grossAmount: number;
    paymentStatus: string;
};

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

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;
    if (Array.isArray(relation)) return relation[0] ?? null;

    return relation;
}

function getManyRelation<T>(relation: SupabaseRelation<T>): T[] {
    if (!relation) return [];
    if (Array.isArray(relation)) return relation;

    return [relation];
}

function getCustomerName(
    customer:
        | ReportSaleRow["customers"]
        | ReportInvoiceRow["customers"]
        | ReportPurchaseRow["customers"],
): string {
    if (!customer) return "Unbekannter Kunde";

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName || "Unbekannte Privatperson";
}

function getVehicleName(
    vehicle:
        | ReportSaleRow["vehicles"]
        | ReportInvoiceRow["vehicles"]
        | ReportPurchaseRow["vehicles"],
): string {
    if (!vehicle) return "Unbekanntes Fahrzeug";

    return `${vehicle.manufacturer} ${vehicle.model}`;
}

function getPrimaryInvoiceNumber(invoices: ReportSaleRow["invoices"]): string | null {
    const invoiceList = getManyRelation(invoices);
    const primaryInvoice =
        invoiceList.find((invoice) => invoice.invoice_type === "standard") ??
        getSingleRelation(invoices);

    return primaryInvoice?.invoice_number ?? null;
}

async function getReportSales(
    dateFrom: string | null,
    dateTo: string | null,
): Promise<ReportSale[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let query = supabase
        .from("sales")
        .select(
            `
      id,
      sale_date,
      net_amount,
      gross_amount,
      vehicles (
        manufacturer,
        model,
        purchase_price_net,
        additional_costs_net
      ),
      customers:buyer_customer_id (
        type,
        company_name,
        first_name,
        last_name
      ),
      invoices (
        invoice_number,
        invoice_type
      )
    `,
        )
        .eq("company_id", companyId);

    if (dateFrom) {
        query = query.gte("sale_date", dateFrom);
    }

    if (dateTo) {
        query = query.lte("sale_date", dateTo);
    }

    const { data, error } = await query.order("sale_date", { ascending: false });

    if (error) {
        throw new Error(`Verkaufsberichte konnten nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as ReportSaleRow[]).map((sale) => {
        const revenueNet = Number(sale.net_amount);
        const purchasePriceNet = Number(sale.vehicles?.purchase_price_net ?? 0);
        const additionalCostsNet = Number(sale.vehicles?.additional_costs_net ?? 0);

        return {
            id: sale.id,
            invoiceNumber: getPrimaryInvoiceNumber(sale.invoices),
            customerName: getCustomerName(sale.customers),
            vehicleName: getVehicleName(sale.vehicles),
            saleDate: sale.sale_date,
            revenueNet,
            salesGross: Number(sale.gross_amount),
            profitNet: revenueNet - purchasePriceNet - additionalCostsNet,
        };
    });
}

async function getReportInvoices(
    dateFrom: string | null,
    dateTo: string | null,
): Promise<ReportInvoice[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let query = supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      invoice_number,
      invoice_date,
      gross_amount,
      payment_status,
      customers (
        type,
        company_name,
        first_name,
        last_name
      ),
      vehicles (
        manufacturer,
        model
      )
    `,
        )
        .eq("company_id", companyId);

    if (dateFrom) {
        query = query.gte("invoice_date", dateFrom);
    }

    if (dateTo) {
        query = query.lte("invoice_date", dateTo);
    }

    const { data, error } = await query.order("invoice_date", { ascending: false });

    if (error) {
        throw new Error(`Rechnungsberichte konnten nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as ReportInvoiceRow[]).map((invoice) => ({
        id: invoice.id,
        saleId: invoice.sale_id,
        invoiceNumber: invoice.invoice_number,
        customerName: getCustomerName(invoice.customers),
        vehicleName: getVehicleName(invoice.vehicles),
        grossAmount: Number(invoice.gross_amount),
        invoiceDate: invoice.invoice_date,
        paymentStatus: invoice.payment_status,
    }));
}

async function getReportPurchases(
    dateFrom: string | null,
    dateTo: string | null,
): Promise<ReportPurchase[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let query = supabase
        .from("purchase_cases")
        .select(
            `
      id,
      purchase_number,
      purchase_date,
      net_amount,
      gross_amount,
      payment_status,
      customers:seller_customer_id (
        type,
        company_name,
        first_name,
        last_name
      ),
      vehicles (
        manufacturer,
        model
      )
    `,
        )
        .eq("company_id", companyId);

    if (dateFrom) {
        query = query.gte("purchase_date", dateFrom);
    }

    if (dateTo) {
        query = query.lte("purchase_date", dateTo);
    }

    const { data, error } = await query.order("purchase_date", { ascending: false });

    if (error) {
        throw new Error(`Ankaufsberichte konnten nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as ReportPurchaseRow[]).map((purchase) => ({
        id: purchase.id,
        purchaseNumber: purchase.purchase_number,
        sellerName: getCustomerName(purchase.customers),
        vehicleName: purchase.vehicles ? getVehicleName(purchase.vehicles) : null,
        purchaseDate: purchase.purchase_date,
        netAmount: Number(purchase.net_amount),
        grossAmount: Number(purchase.gross_amount),
        paymentStatus: purchase.payment_status,
    }));
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

    const [vehicleSummary, sales, invoices, purchases, cashbookEntries] =
        await Promise.all([
            getVehicleReportSummary(),
            getReportSales(dateFrom, dateTo),
            getReportInvoices(dateFrom, dateTo),
            getReportPurchases(dateFrom, dateTo),
            getCashbookEntries({ from: dateFrom, to: dateTo }),
        ]);

    let totalRevenueNet = 0;
    let totalSalesGross = 0;
    let totalProfitNet = 0;

    for (const sale of sales) {
        totalRevenueNet += sale.revenueNet;
        totalSalesGross += sale.salesGross;
        totalProfitNet += sale.profitNet;
    }

    const averageProfitNet =
        sales.length > 0
            ? totalProfitNet / sales.length
            : 0;

    const openPurchasePayments: typeof purchases = [];
    let totalPurchaseNet = 0;
    let totalPurchaseGross = 0;
    let openPurchasePaymentsGross = 0;

    for (const purchase of purchases) {
        const isOpen = purchase.paymentStatus !== "paid";

        totalPurchaseNet += purchase.netAmount;
        totalPurchaseGross += purchase.grossAmount;

        if (!isOpen) continue;

        openPurchasePaymentsGross += purchase.grossAmount;
        if (openPurchasePayments.length < 5) {
            openPurchasePayments.push(purchase);
        }
    }

    const openInvoices: typeof invoices = [];
    let openInvoicesCount = 0;
    let openInvoicesGross = 0;

    for (const invoice of invoices) {
        if (invoice.paymentStatus === "paid") continue;

        openInvoicesCount += 1;
        openInvoicesGross += invoice.grossAmount;
        if (openInvoices.length < 5) {
            openInvoices.push(invoice);
        }
    }

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
        openInvoicesCount,

        cashbookIncome: calculateTotalIncome(cashbookEntries),
        cashbookExpenses: calculateTotalExpenses(cashbookEntries),
        cashbookBalance: calculateBalance(cashbookEntries),

        vehiclesCount: vehicleSummary.vehiclesCount,
        currentVehiclesCount: vehicleSummary.currentVehiclesCount,
        soldVehiclesCount: vehicleSummary.soldVehiclesCount,
        inventoryValueNet: vehicleSummary.inventoryValueNet,

        topSalesByRevenue: [...sales]
            .sort((a, b) => b.revenueNet - a.revenueNet)
            .slice(0, 5),

        topSalesByProfit: [...sales]
            .sort((a, b) => b.profitNet - a.profitNet)
            .slice(0, 5),

        topPurchasesByAmount: purchases
            .map((purchase) => ({
                id: purchase.id,
                purchaseNumber: purchase.purchaseNumber,
                sellerName: purchase.sellerName,
                vehicleName: purchase.vehicleName,
                purchaseDate: purchase.purchaseDate,
                grossAmount: purchase.grossAmount,
                paymentStatus: purchase.paymentStatus,
            }))
            .sort((a, b) => b.grossAmount - a.grossAmount)
            .slice(0, 5),

        openInvoices: openInvoices.map((invoice) => ({
            id: invoice.id,
            saleId: invoice.saleId,
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customerName,
            vehicleName: invoice.vehicleName,
            grossAmount: invoice.grossAmount,
            invoiceDate: invoice.invoiceDate,
        })),

        openPurchases: openPurchasePayments.map((purchase) => ({
            id: purchase.id,
            purchaseNumber: purchase.purchaseNumber,
            sellerName: purchase.sellerName,
            vehicleName: purchase.vehicleName,
            grossAmount: purchase.grossAmount,
            purchaseDate: purchase.purchaseDate,
        })),
    };
}
