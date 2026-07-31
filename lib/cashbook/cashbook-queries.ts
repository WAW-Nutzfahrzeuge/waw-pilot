import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CashbookEntryType = "income" | "expense";
export type CashbookPaymentMethod = "cash" | "bank";

export type CashbookEntryRow = {
    id: string;
    entry_type: CashbookEntryType;
    category: string;
    payment_method: CashbookPaymentMethod;
    amount: number;
    booking_date: string;
    description: string;

    customer_id: string | null;
    vehicle_id: string | null;
    sale_id: string | null;
    invoice_id: string | null;
    document_id: string | null;
    purchase_case_id: string | null;

    created_at: string;

    customer_name: string | null;
    vehicle_internal_number: string | null;
    vehicle_name: string | null;
    invoice_number: string | null;
    purchase_number: string | null;
};

type CustomerRelation = {
    type: "company" | "private";
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
};

type VehicleRelation = {
    internal_number: string;
    manufacturer: string;
    model: string;
};

type InvoiceRelation = {
    invoice_number: string;
};

type PurchaseCaseRelation = {
    purchase_number: string | null;
};

type SupabaseRelation<T> = T | T[] | null;

type CashbookQueryRow = {
    id: string;
    entry_type: CashbookEntryType;
    category: string;
    payment_method: CashbookPaymentMethod;
    amount: number | string;
    booking_date: string;
    description: string;

    customer_id: string | null;
    vehicle_id: string | null;
    sale_id: string | null;
    invoice_id: string | null;
    document_id: string | null;
    purchase_case_id: string | null;

    created_at: string;

    customers: SupabaseRelation<CustomerRelation>;
    vehicles: SupabaseRelation<VehicleRelation>;
    invoices: SupabaseRelation<InvoiceRelation>;
    purchase_cases: SupabaseRelation<PurchaseCaseRelation>;
};

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

function getCustomerName(customer: CustomerRelation | null): string | null {
    if (!customer) return null;

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

export type CashbookEntryFilters = {
    from?: string | null;
    to?: string | null;
};

export type CashbookSummary = {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
};

type CashbookSummaryRow = {
    entry_type: CashbookEntryType;
    amount: number | string;
};

function isDateParam(value: string | null | undefined): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function getCashbookEntries(
    filters: CashbookEntryFilters = {},
): Promise<CashbookEntryRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let query = supabase
        .from("cashbook_entries")
        .select(
            `
      id,
      entry_type,
      category,
      payment_method,
      amount,
      booking_date,
      description,
      customer_id,
      vehicle_id,
      sale_id,
      invoice_id,
      document_id,
      purchase_case_id,
      created_at,
      customers (
        type,
        company_name,
        first_name,
        last_name
      ),
      vehicles (
        internal_number,
        manufacturer,
        model
      ),
      invoices (
        invoice_number
      ),
      purchase_cases (
        purchase_number
      )
    `,
        )
        .eq("company_id", companyId);

    if (isDateParam(filters.from)) {
        query = query.gte("booking_date", filters.from);
    }

    if (isDateParam(filters.to)) {
        query = query.lte("booking_date", filters.to);
    }

    const { data, error } = await query.order("booking_date", {
        ascending: false,
    });

    if (error) {
        throw new Error(`Kassenbuch konnte nicht geladen werden: ${error.message}`);
    }

    const entries = (data ?? []) as unknown as CashbookQueryRow[];

    return entries.map((entry) => {
        const customer = getSingleRelation(entry.customers);
        const vehicle = getSingleRelation(entry.vehicles);
        const invoice = getSingleRelation(entry.invoices);
        const purchaseCase = getSingleRelation(entry.purchase_cases);

        return {
            id: entry.id,
            entry_type: entry.entry_type,
            category: entry.category,
            payment_method: entry.payment_method,
            amount: Number(entry.amount),
            booking_date: entry.booking_date,
            description: entry.description,

            customer_id: entry.customer_id,
            vehicle_id: entry.vehicle_id,
            sale_id: entry.sale_id,
            invoice_id: entry.invoice_id,
            document_id: entry.document_id,
            purchase_case_id: entry.purchase_case_id,

            created_at: entry.created_at,

            customer_name: getCustomerName(customer),
            vehicle_internal_number: vehicle?.internal_number ?? null,
            vehicle_name: vehicle
                ? `${vehicle.manufacturer} ${vehicle.model}`
                : null,
            invoice_number: invoice?.invoice_number ?? null,
            purchase_number: purchaseCase?.purchase_number ?? null,
        };
    });
}

export async function getCashbookSummary(
    filters: CashbookEntryFilters = {},
): Promise<CashbookSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let query = supabase
        .from("cashbook_entries")
        .select("entry_type, amount")
        .eq("company_id", companyId);

    if (isDateParam(filters.from)) {
        query = query.gte("booking_date", filters.from);
    }

    if (isDateParam(filters.to)) {
        query = query.lte("booking_date", filters.to);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Kassenbuch-Summe konnte nicht geladen werden: ${error.message}`);
    }

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const entry of (data ?? []) as CashbookSummaryRow[]) {
        const amount = Number(entry.amount);

        if (entry.entry_type === "income") {
            totalIncome += amount;
            continue;
        }

        totalExpenses += amount;
    }

    return {
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
    };
}
