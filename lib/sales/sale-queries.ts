import { getCurrentCompanyId } from "@/lib/company";
import {
    evaluateRequiredDocuments,
    getRequiredDocumentsForSale,
} from "@/lib/sales/sale-required-documents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InvoiceType } from "@/lib/invoices/invoice-numbering";
import { getSaleTaxConfiguration } from "@/utils/sale-tax-rules";
import {
    calculatePaidAmount,
    calculatePaymentStatus,
    calculateRemainingAmount,
} from "@/utils/payment-utils";
import type { PaymentMethod } from "@/lib/payments/payment-methods";
import { getSaleDocumentStatus } from "@/utils/sale-document-status";
import {
    getMonthFilterDateRange,
    type MonthFilterValue,
} from "@/utils/month-filter";

export type SaleType = "inland" | "eu" | "export_third_country";
export type SaleStatus = "draft" | "active" | "completed" | "cancelled";
export type PaymentStatus = "open" | "partial" | "paid" | "overpaid";
export type DocumentCheckStatus = "complete" | "missing" | "warning";
export type DatevStatus = "not_sent" | "sent";

export type SaleRow = {
    id: string;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    sale_type: SaleType;
    net_amount: number;
    vat_rate: number;
    vat_amount: number;
    gross_amount: number;
    status: SaleStatus;
    payment_status: PaymentStatus;
    document_check_status: DocumentCheckStatus;
    datev_status: DatevStatus;
    notes: string | null;
    created_at: string;

    invoice_id: string | null;
    invoice_number: string | null;
    has_proforma_invoice: boolean;

    vehicle_internal_number: string;
    vehicle_name: string;
    vin: string;
    purchase_price_net: number;
    additional_costs_net: number;

    customer_name: string;
    customer_country: string;

    required_documents_count: number;
    available_required_documents_count: number;
    missing_required_documents_count: number;
    missing_required_document_labels: string[];
    paid_amount: number;
    remaining_amount: number;
};

type InvoiceRelation = {
    id: string;
    invoice_number: string;
    invoice_type: InvoiceType | null;
};

type DocumentRelation = {
    document_type: string;
    status: "available" | "missing" | "needs_review";
    source: string | null;
};

type PaymentRelation = {
    amount: number | string;
    payment_method: PaymentMethod;
    payment_date: string;
    is_voided: boolean | null;
};

type SupabaseRelation<T> = T | T[] | null;

type SaleQueryRow = {
    id: string;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    sale_type: SaleType | null;
    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    status: SaleStatus;
    payment_status: PaymentStatus;
    document_check_status: DocumentCheckStatus;
    datev_status: DatevStatus;
    notes: string | null;
    created_at: string;

    vehicles: {
        internal_number: string;
        manufacturer: string;
        model: string;
        vin: string;
        purchase_price_net: number | string;
        additional_costs_net: number | string;
    } | null;

    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
        country: string;
        tax_number: string | null;
        vat_id: string | null;
    } | null;

    invoices: SupabaseRelation<InvoiceRelation>;
    documents: SupabaseRelation<DocumentRelation>;
    sale_payments: SupabaseRelation<PaymentRelation>;
};

type SaleSummaryQueryRow = {
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
    invoices: SupabaseRelation<InvoiceRelation>;
    sale_payments: SupabaseRelation<Pick<PaymentRelation, "amount" | "is_voided">>;
};

type SaleCheckQueryRow = {
    id: string;
    sale_date: string;
    sale_type: SaleType | null;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
        country: string;
        tax_number: string | null;
        vat_id: string | null;
    } | null;
    vehicles: {
        manufacturer: string;
        model: string;
    } | null;
    invoices: SupabaseRelation<InvoiceRelation>;
    documents: SupabaseRelation<DocumentRelation>;
};

export type SalesDashboardSummary = {
    salesCount: number;
    openInvoicesCount: number;
    totalRevenueNet: number;
    totalProfitNet: number;
    recentSales: {
        id: string;
        invoiceNumber: string | null;
        customerName: string;
        vehicleName: string;
        amount: number;
        saleDate: string;
    }[];
};

export type SalesToCheckSummary = {
    count: number;
    sales: {
        id: string;
        customer_name: string;
        vehicle_name: string;
        invoice_number: string | null;
        sale_date: string;
        document_check_status: DocumentCheckStatus;
    }[];
};

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

function getManyRelation<T>(relation: SupabaseRelation<T>): T[] {
    if (!relation) return [];

    if (Array.isArray(relation)) {
        return relation;
    }

    return [relation];
}

function getCustomerName(customer: SaleQueryRow["customers"]): string {
    if (!customer) return "Unbekannter Kunde";

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

function getSaleCustomerName(
    customer: SaleQueryRow["customers"] | SaleSummaryQueryRow["customers"],
): string {
    if (!customer) return "Unbekannter Kunde";

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

function getSaleCheckStatus(row: SaleCheckQueryRow): DocumentCheckStatus {
    const saleType = row.sale_type ?? "inland";
    const requiredDocuments = getRequiredDocumentsForSale({
        saleType,
        isCompanyCustomer: row.customers?.type === "company",
    });
    const documentCheck = evaluateRequiredDocuments({
        requiredDocuments,
        documents: getManyRelation(row.documents),
    });
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: row.customers?.type,
        deliveryType: saleType,
        billingCountry: row.customers?.country,
    });
    const missingRequiredDataCount = [
        taxConfiguration.showTaxNumber && !row.customers?.tax_number,
        taxConfiguration.showVatId && !row.customers?.vat_id,
    ].filter(Boolean).length;
    const documentStatus = getSaleDocumentStatus({
        missingRequiredDocuments: documentCheck.missingCount,
        missingRequiredData: missingRequiredDataCount,
    });

    return documentStatus === "complete" ? "complete" : "missing";
}

export async function getSalesDashboardSummary(
    monthFilter: MonthFilterValue,
): Promise<SalesDashboardSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const dateRange = getMonthFilterDateRange(monthFilter);

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
        id,
        invoice_number,
        invoice_type
      ),
      sale_payments (
        amount,
        is_voided
      )
    `,
        )
        .eq("company_id", companyId);

    if (dateRange) {
        query = query
            .gte("sale_date", dateRange.from)
            .lte("sale_date", dateRange.to);
    }

    const { data, error } = await query.order("sale_date", { ascending: false });

    if (error) {
        throw new Error(`Verkaufs-Zusammenfassung konnte nicht geladen werden: ${error.message}`);
    }

    let salesCount = 0;
    let openInvoicesCount = 0;
    let totalRevenueNet = 0;
    let totalProfitNet = 0;
    const recentSales: SalesDashboardSummary["recentSales"] = [];

    for (const sale of (data ?? []) as unknown as SaleSummaryQueryRow[]) {
        const grossAmount = Number(sale.gross_amount);
        const payments = getManyRelation(sale.sale_payments).map((payment) => ({
            amount: Number(payment.amount),
            is_voided: payment.is_voided,
        }));
        const paymentStatus = calculatePaymentStatus(grossAmount, payments);
        const vehicle = sale.vehicles;
        const invoices = getManyRelation(sale.invoices);
        const invoice = getSingleRelation(sale.invoices);
        const purchasePriceNet = Number(vehicle?.purchase_price_net ?? 0);
        const additionalCostsNet = Number(vehicle?.additional_costs_net ?? 0);
        const netAmount = Number(sale.net_amount);

        salesCount += 1;
        totalRevenueNet += netAmount;
        totalProfitNet += netAmount - purchasePriceNet - additionalCostsNet;

        if (paymentStatus !== "paid") {
            openInvoicesCount += 1;
        }

        if (recentSales.length < 4) {
            const primaryInvoice =
                invoices.find((item) => item.invoice_type === "standard") ?? invoice;

            recentSales.push({
                id: sale.id,
                invoiceNumber: primaryInvoice?.invoice_number ?? null,
                customerName: getSaleCustomerName(sale.customers),
                vehicleName: vehicle
                    ? `${vehicle.manufacturer} ${vehicle.model}`
                    : "Unbekanntes Fahrzeug",
                amount: netAmount,
                saleDate: sale.sale_date,
            });
        }
    }

    return {
        salesCount,
        openInvoicesCount,
        totalRevenueNet,
        totalProfitNet,
        recentSales,
    };
}

export async function getSalesToCheckSummary(): Promise<SalesToCheckSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("sales")
        .select(
            `
      id,
      sale_date,
      sale_type,
      customers:buyer_customer_id (
        type,
        company_name,
        first_name,
        last_name,
        country,
        tax_number,
        vat_id
      ),
      vehicles (
        manufacturer,
        model
      ),
      invoices (
        id,
        invoice_number,
        invoice_type
      ),
      documents (
        document_type,
        status,
        source
      )
    `,
        )
        .eq("company_id", companyId)
        .order("sale_date", { ascending: false });

    if (error) {
        throw new Error(`Prüfungsrelevante Verkäufe konnten nicht geladen werden: ${error.message}`);
    }

    let count = 0;
    const sales: SalesToCheckSummary["sales"] = [];

    for (const sale of (data ?? []) as unknown as SaleCheckQueryRow[]) {
        const documentCheckStatus = getSaleCheckStatus(sale);
        if (documentCheckStatus === "complete") continue;

        count += 1;
        if (sales.length >= 8) continue;

        const vehicle = sale.vehicles;
        const invoices = getManyRelation(sale.invoices);
        const invoice =
            invoices.find((item) => item.invoice_type === "standard") ??
            getSingleRelation(sale.invoices);

        sales.push({
            id: sale.id,
            customer_name: getSaleCustomerName(sale.customers),
            vehicle_name: vehicle
                ? `${vehicle.manufacturer} ${vehicle.model}`
                : "Unbekanntes Fahrzeug",
            invoice_number: invoice?.invoice_number ?? null,
            sale_date: sale.sale_date,
            document_check_status: documentCheckStatus,
        });
    }

    return { count, sales };
}

export async function getSales(): Promise<SaleRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("sales")
        .select(
            `
      id,
      vehicle_id,
      buyer_customer_id,
      sale_date,
      sale_type,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      status,
      payment_status,
      document_check_status,
      datev_status,
      notes,
      created_at,
      vehicles (
        internal_number,
        manufacturer,
        model,
        vin,
        purchase_price_net,
        additional_costs_net
      ),
      customers:buyer_customer_id (
        type,
        company_name,
        first_name,
        last_name,
        country,
        tax_number,
        vat_id
      ),
      invoices (
        id,
        invoice_number,
        invoice_type
      ),
      documents (
        document_type,
        status,
        source
      ),
      sale_payments (
        amount,
        payment_method,
        payment_date,
        is_voided
      )
    `,
        )
        .eq("company_id", companyId)
        .order("sale_date", { ascending: false });

    if (error) {
        throw new Error(`Verkäufe konnten nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as SaleQueryRow[]).map((sale) => {
        const vehicle = sale.vehicles;
        const customer = sale.customers;
        const invoice = getSingleRelation(sale.invoices);
        const invoices = getManyRelation(sale.invoices);
        const saleType = sale.sale_type ?? "inland";

        const relatedDocuments = getManyRelation(sale.documents);
        const payments = getManyRelation(sale.sale_payments).map((payment) => ({
            amount: Number(payment.amount),
            is_voided: payment.is_voided,
        }));

        const requiredDocuments = getRequiredDocumentsForSale({
            saleType,
            isCompanyCustomer: customer?.type === "company",
        });

        const documentCheck = evaluateRequiredDocuments({
            requiredDocuments,
            documents: relatedDocuments,
        });
        const taxConfiguration = getSaleTaxConfiguration({
            buyerType: customer?.type,
            deliveryType: saleType,
            billingCountry: customer?.country,
        });
        const missingRequiredDataLabels = [
            taxConfiguration.showTaxNumber && !customer?.tax_number
                ? "Steuernummer beim Kunden fehlt."
                : null,
            taxConfiguration.showVatId && !customer?.vat_id
                ? "USt-IdNr. beim Kunden fehlt."
                : null,
        ].filter((label): label is string => Boolean(label));
        const documentStatus = getSaleDocumentStatus({
            missingRequiredDocuments: documentCheck.missingCount,
            missingRequiredData: missingRequiredDataLabels.length,
        });

        const grossAmount = Number(sale.gross_amount);
        const paidAmount = calculatePaidAmount(payments);
        const remainingAmount = calculateRemainingAmount(grossAmount, payments);
        const paymentStatus = calculatePaymentStatus(grossAmount, payments);

        return {
            id: sale.id,
            vehicle_id: sale.vehicle_id,
            buyer_customer_id: sale.buyer_customer_id,
            sale_date: sale.sale_date,
            sale_type: saleType,
            net_amount: Number(sale.net_amount),
            vat_rate: Number(sale.vat_rate),
            vat_amount: Number(sale.vat_amount),
            gross_amount: grossAmount,
            status: sale.status,
            payment_status: paymentStatus,
            document_check_status:
                documentStatus === "complete" ? "complete" : "missing",
            datev_status: sale.datev_status,
            notes: sale.notes,
            created_at: sale.created_at,

            invoice_id: invoice?.id ?? null,
            invoice_number: invoice?.invoice_number ?? null,
            has_proforma_invoice: invoices.some((item) => item.invoice_type === "proforma"),

            vehicle_internal_number: vehicle?.internal_number ?? "—",
            vehicle_name: vehicle
                ? `${vehicle.manufacturer} ${vehicle.model}`
                : "Unbekanntes Fahrzeug",
            vin: vehicle?.vin ?? "—",
            purchase_price_net: Number(vehicle?.purchase_price_net ?? 0),
            additional_costs_net: Number(vehicle?.additional_costs_net ?? 0),

            customer_name: getCustomerName(customer),
            customer_country: customer?.country ?? "—",

            required_documents_count: documentCheck.requiredCount,
            available_required_documents_count: documentCheck.availableCount,
            missing_required_documents_count: documentCheck.missingCount,
            missing_required_document_labels: [
                ...documentCheck.missingLabels,
                ...missingRequiredDataLabels,
            ],
            paid_amount: paidAmount,
            remaining_amount: remainingAmount,
        };
    });
}
