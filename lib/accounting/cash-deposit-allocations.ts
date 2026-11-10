import "server-only";

import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export type CashInflowCandidate = {
    financialEntryId: string;
    allocationType: "sale_payment" | "other_cash_income";
    saleNumber: string | null;
    description: string;
    paymentReference: string;
    paymentDate: string;
    amount: number;
    availableAmount: number;
};

export type CashDepositAllocationInput = {
    type: "sale_payment" | "existing_cash_balance" | "other_cash_income";
    amount: number;
    sourceFinancialEntryId?: string;
    note?: string;
};

export async function getAvailableCashInflows(
    companyId: string,
): Promise<CashInflowCandidate[]> {
    const supabase = createAutomationSupabaseClient();
    const { data: rows, error } = await supabase
        .from("financial_entries")
        .select("id, source_reference, source_type, entry_type, sale_id, booking_date, amount, description")
        .eq("company_id", companyId)
        .eq("payment_method", "cash")
        .eq("direction", "in")
        .eq("is_cash_relevant", true)
        .eq("status", "active")
        .neq("category_code", "cash_bank_deposit")
        .order("booking_date", { ascending: false });

    if (error) throw new Error("Bare Zahlungseingänge konnten nicht geladen werden.");
    if (!rows?.length) return [];

    const sourceIds = rows.map((row) => row.id as string);
    const saleIds = Array.from(new Set(rows.map((row) => row.sale_id as string | null).filter((id): id is string => Boolean(id))));
    const [salesResult, allocationsResult] = await Promise.all([
        saleIds.length
            ? supabase.from("sales").select("id, sale_number").eq("company_id", companyId).in("id", saleIds)
            : Promise.resolve({ data: [], error: null }),
        supabase
            .from("cash_bank_deposit_allocations")
            .select("deposit_cashbook_entry_id, source_financial_entry_id, allocation_amount")
            .eq("company_id", companyId)
            .in("source_financial_entry_id", sourceIds),
    ]);

    if (salesResult.error || allocationsResult.error) {
        throw new Error("Zuordnungen der Bareinnahmen konnten nicht geladen werden.");
    }

    const depositIds = Array.from(new Set(
        (allocationsResult.data ?? []).map((allocation) => allocation.deposit_cashbook_entry_id as string),
    ));
    const activeDepositsResult = depositIds.length
        ? await supabase
            .from("financial_entries")
            .select("source_id")
            .eq("company_id", companyId)
            .eq("source_type", "cashbook_entry")
            .eq("category_code", "cash_bank_deposit")
            .eq("status", "active")
            .in("source_id", depositIds)
        : { data: [], error: null };
    if (activeDepositsResult.error) {
        throw new Error("Aktive Bankeinzahlungen konnten nicht geprüft werden.");
    }
    const activeDepositIds = new Set(
        (activeDepositsResult.data ?? []).map((entry) => entry.source_id as string),
    );

    const saleRows = (salesResult.data ?? []) as Array<{ id: string; sale_number: string }>;
    const saleNumbers = new Map<string, string>(
        saleRows.map((sale) => [sale.id, sale.sale_number]),
    );
    const allocatedCents = new Map<string, number>();
    for (const allocation of allocationsResult.data ?? []) {
        if (!activeDepositIds.has(allocation.deposit_cashbook_entry_id as string)) continue;
        const sourceId = allocation.source_financial_entry_id as string;
        allocatedCents.set(
            sourceId,
            (allocatedCents.get(sourceId) ?? 0) + Math.round(Number(allocation.allocation_amount) * 100),
        );
    }

    return rows.flatMap((row) => {
        const financialEntryId = row.id as string;
        const isSalePayment = row.source_type === "sale_payment" && row.entry_type === "sale_payment" && Boolean(row.sale_id);
        const saleNumber = isSalePayment ? saleNumbers.get(row.sale_id as string) ?? null : null;
        if (isSalePayment && !saleNumber) return [];
        const amountCents = Math.round(Number(row.amount) * 100);
        const availableCents = amountCents - (allocatedCents.get(financialEntryId) ?? 0);
        if (availableCents <= 0) return [];
        return [{
            financialEntryId,
            allocationType: isSalePayment ? "sale_payment" as const : "other_cash_income" as const,
            saleNumber,
            description: isSalePayment
                ? `Verkauf ${saleNumber}`
                : (row.description as string | null) ?? "Sonstige Bareinnahme",
            paymentReference: (row.source_reference as string | null) ?? financialEntryId.slice(0, 8),
            paymentDate: row.booking_date as string,
            amount: amountCents / 100,
            availableAmount: availableCents / 100,
        }];
    });
}
