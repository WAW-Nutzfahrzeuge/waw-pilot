import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type FinancialEntryDirection = "in" | "out";
export type FinancialEntryStatus = "active" | "voided" | "sync_error";

export type FinancialEntryRow = {
    id: string;
    entry_reference: string;
    source_type: string;
    source_id: string | null;
    source_reference: string | null;
    entry_type: string;
    payment_method: "cash" | "bank" | null;
    booking_date: string;
    document_date: string | null;
    amount: number;
    currency: string;
    direction: FinancialEntryDirection;
    description: string;
    category_code: string | null;
    debit_account: string | null;
    credit_account: string | null;
    tax_code: string | null;
    tax_rate: number | null;
    net_amount: number | null;
    tax_amount: number | null;
    gross_amount: number | null;
    customer_id: string | null;
    vehicle_id: string | null;
    sale_id: string | null;
    purchase_id: string | null;
    invoice_id: string | null;
    document_id: string | null;
    status: FinancialEntryStatus;
    accounting_status: string;
    is_cash_relevant: boolean;
    is_datev_relevant: boolean;
    exported_at: string | null;
    created_at: string;
    customer_name: string | null;
    vehicle_label: string | null;
    invoice_number: string | null;
    purchase_number: string | null;
};

export type FinancialEntryFilters = {
    from?: string | null;
    to?: string | null;
    cashOnly?: boolean;
};

export type CashRegisterSummary = {
    openingBalance: number;
    income: number;
    expenses: number;
    endingBalance: number;
    movementCount: number;
};

type SupabaseRelation<T> = T | T[] | null;

type FinancialEntryQueryRow = Omit<
    FinancialEntryRow,
    | "amount"
    | "tax_rate"
    | "net_amount"
    | "tax_amount"
    | "gross_amount"
    | "customer_name"
    | "vehicle_label"
    | "invoice_number"
    | "purchase_number"
> & {
    amount: number | string;
    tax_rate: number | string | null;
    net_amount: number | string | null;
    tax_amount: number | string | null;
    gross_amount: number | string | null;
    customers: SupabaseRelation<{
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    }>;
    vehicles: SupabaseRelation<{
        internal_number: string | null;
        manufacturer: string | null;
        model: string | null;
    }>;
    invoices: SupabaseRelation<{ invoice_number: string | null }>;
    purchase_cases: SupabaseRelation<{ purchase_number: string | null }>;
};

function isDateParam(value: string | null | undefined): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;
    if (Array.isArray(relation)) return relation[0] ?? null;
    return relation;
}

function getCustomerName(
    customer: FinancialEntryQueryRow["customers"] extends SupabaseRelation<infer T>
        ? T
        : never,
): string {
    if (customer.type === "company") return customer.company_name ?? "Unbekannte Firma";

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName || "Unbekannte Privatperson";
}

function getVehicleLabel(
    vehicle: FinancialEntryQueryRow["vehicles"] extends SupabaseRelation<infer T>
        ? T
        : never,
): string {
    return [vehicle.manufacturer, vehicle.model]
        .filter(Boolean)
        .join(" ");
}

function mapFinancialEntry(row: FinancialEntryQueryRow): FinancialEntryRow {
    const customer = getSingleRelation(row.customers);
    const vehicle = getSingleRelation(row.vehicles);
    const invoice = getSingleRelation(row.invoices);
    const purchase = getSingleRelation(row.purchase_cases);

    return {
        ...row,
        amount: Number(row.amount),
        tax_rate: row.tax_rate === null ? null : Number(row.tax_rate),
        net_amount: row.net_amount === null ? null : Number(row.net_amount),
        tax_amount: row.tax_amount === null ? null : Number(row.tax_amount),
        gross_amount: row.gross_amount === null ? null : Number(row.gross_amount),
        customer_name: customer ? getCustomerName(customer) : null,
        vehicle_label: vehicle ? getVehicleLabel(vehicle) : null,
        invoice_number: invoice?.invoice_number ?? null,
        purchase_number: purchase?.purchase_number ?? null,
    };
}

export async function getFinancialEntries(
    filters: FinancialEntryFilters = {},
): Promise<FinancialEntryRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let query = supabase
        .from("financial_entries")
        .select(
            `
      id,
      entry_reference,
      source_type,
      source_id,
      source_reference,
      entry_type,
      payment_method,
      booking_date,
      document_date,
      amount,
      currency,
      direction,
      description,
      category_code,
      debit_account,
      credit_account,
      tax_code,
      tax_rate,
      net_amount,
      tax_amount,
      gross_amount,
      customer_id,
      vehicle_id,
      sale_id,
      purchase_id,
      invoice_id,
      document_id,
      status,
      accounting_status,
      is_cash_relevant,
      is_datev_relevant,
      exported_at,
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

    if (filters.cashOnly) {
        query = query.eq("is_cash_relevant", true);
    }

    if (isDateParam(filters.from)) {
        query = query.gte("booking_date", filters.from);
    }

    if (isDateParam(filters.to)) {
        query = query.lte("booking_date", filters.to);
    }

    const { data, error } = await query
        .order("booking_date", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Finanzjournal konnte nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as FinancialEntryQueryRow[]).map(mapFinancialEntry);
}

export async function getCashRegisterSummary(
    entries: FinancialEntryRow[],
): Promise<CashRegisterSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data: cashRegister } = await supabase
        .from("cash_registers")
        .select("opening_balance")
        .eq("company_id", companyId)
        .eq("active", true)
        .maybeSingle();

    const openingBalance = Number(cashRegister?.opening_balance ?? 0);
    let income = 0;
    let expenses = 0;
    let movementCount = 0;

    for (const entry of entries) {
        if (!entry.is_cash_relevant || entry.status !== "active") {
            continue;
        }

        movementCount += 1;

        if (entry.direction === "in") {
            income += entry.amount;
        } else {
            expenses += entry.amount;
        }
    }

    return {
        openingBalance,
        income,
        expenses,
        endingBalance: openingBalance + income - expenses,
        movementCount,
    };
}
