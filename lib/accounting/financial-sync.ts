import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createServerSupabaseClient>;

type FinancialSourceType =
    | "sale_payment"
    | "purchase_payment"
    | "cashbook_entry"
    | "invoice_correction"
    | "sale_refund";

type FinancialEntryPayload = {
    source_type: FinancialSourceType;
    source_id: string;
    source_reference: string;
    entry_type: string;
    payment_method: "cash" | "bank" | null;
    booking_date: string;
    document_date: string | null;
    amount: number;
    direction: "in" | "out";
    description: string;
    category_code: string;
    customer_id: string | null;
    vehicle_id: string | null;
    sale_id: string | null;
    purchase_id: string | null;
    invoice_id: string | null;
    document_id: string | null;
    status: "active" | "voided" | "sync_error";
    is_cash_relevant: boolean;
    voided_at?: string | null;
    voided_by?: string | null;
    void_reason?: string | null;
};

async function getCategoryId(
    supabase: SupabaseServerClient,
    companyId: string,
    categoryCode: string,
): Promise<string | null> {
    const { data } = await supabase
        .from("financial_categories")
        .select("id")
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .eq("code", categoryCode)
        .order("company_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    return (data?.id as string | undefined) ?? null;
}

async function createFinancialReference(
    supabase: SupabaseServerClient,
    companyId: string,
): Promise<string> {
    const { data, error } = await supabase.rpc("next_financial_entry_reference", {
        target_company_id: companyId,
    });

    if (error || typeof data !== "string") {
        throw new Error("Finanzreferenz konnte nicht erzeugt werden.");
    }

    return data;
}

async function upsertFinancialEntry(
    supabase: SupabaseServerClient,
    companyId: string,
    payload: FinancialEntryPayload,
) {
    const [categoryId, existingEntryResult] = await Promise.all([
        getCategoryId(supabase, companyId, payload.category_code),
        supabase
            .from("financial_entries")
            .select("id")
            .eq("company_id", companyId)
            .eq("source_type", payload.source_type)
            .eq("source_id", payload.source_id)
            .eq("entry_type", payload.entry_type)
            .maybeSingle(),
    ]);
    const existingEntry = existingEntryResult.data;

    const values = {
        ...payload,
        category_id: categoryId,
        accounting_status: "UNREVIEWED",
        is_datev_relevant: true,
        updated_at: new Date().toISOString(),
    };

    if (existingEntry?.id) {
        const { error } = await supabase
            .from("financial_entries")
            .update(values)
            .eq("company_id", companyId)
            .eq("id", existingEntry.id);

        if (error) {
            console.error("[financial-sync] financial entry update failed", error);
            throw new Error("Finanzjournal konnte nicht aktualisiert werden.");
        }

        return existingEntry.id as string;
    }

    const entryReference = await createFinancialReference(supabase, companyId);
    const { data, error } = await supabase
        .from("financial_entries")
        .insert({
            company_id: companyId,
            entry_reference: entryReference,
            ...values,
        })
        .select("id")
        .single();

    if (error || !data) {
        console.error("[financial-sync] financial entry insert failed", error);
        throw new Error("Finanzjournal konnte nicht angelegt werden.");
    }

    return data.id as string;
}

export async function syncSalePaymentFinancialEntry({
    companyId,
    paymentId,
}: {
    companyId: string;
    paymentId: string;
}) {
    const supabase = createServerSupabaseClient();
    const { data: payment, error: paymentError } = await supabase
        .from("sale_payments")
        .select(
            "id, sale_id, payment_reference, amount, payment_method, payment_date, is_voided, voided_at, voided_by, void_reason",
        )
        .eq("company_id", companyId)
        .eq("id", paymentId)
        .single();

    if (paymentError || !payment) {
        throw new Error("Zahlung konnte nicht für das Finanzjournal geladen werden.");
    }

    const [saleResult, invoiceResult] = await Promise.all([
        supabase
            .from("sales")
            .select("id, buyer_customer_id, vehicle_id")
            .eq("company_id", companyId)
            .eq("id", payment.sale_id)
            .single(),
        supabase
            .from("invoices")
            .select("id")
            .eq("company_id", companyId)
            .eq("sale_id", payment.sale_id)
            .neq("invoice_type", "proforma")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    const sale = saleResult.data;
    const saleError = saleResult.error;
    const invoice = invoiceResult.data;

    if (saleError || !sale) {
        throw new Error("Verkauf zur Zahlung konnte nicht geladen werden.");
    }

    const isVoided = Boolean(payment.is_voided);

    return upsertFinancialEntry(supabase, companyId, {
        source_type: "sale_payment",
        source_id: payment.id as string,
        source_reference: payment.payment_reference as string,
        entry_type: "sale_payment",
        payment_method: payment.payment_method as "cash" | "bank",
        booking_date: payment.payment_date as string,
        document_date: payment.payment_date as string,
        amount: Number(payment.amount),
        direction: "in",
        description: `Zahlung ${payment.payment_reference} aus Verkauf`,
        category_code: "vehicle_sale",
        customer_id: (sale.buyer_customer_id as string | null) ?? null,
        vehicle_id: (sale.vehicle_id as string | null) ?? null,
        sale_id: payment.sale_id as string,
        purchase_id: null,
        invoice_id: (invoice?.id as string | undefined) ?? null,
        document_id: null,
        status: isVoided ? "voided" : "active",
        is_cash_relevant: payment.payment_method === "cash" && !isVoided,
        voided_at: (payment.voided_at as string | null) ?? null,
        voided_by: (payment.voided_by as string | null) ?? null,
        void_reason: (payment.void_reason as string | null) ?? null,
    });
}

export async function syncPurchasePaymentFinancialEntry({
    companyId,
    paymentId,
}: {
    companyId: string;
    paymentId: string;
}) {
    const supabase = createServerSupabaseClient();
    const { data: payment, error: paymentError } = await supabase
        .from("purchase_payments")
        .select(
            "id, purchase_id, payment_reference, amount, payment_method, payment_date, is_voided, voided_at, voided_by, void_reason",
        )
        .eq("company_id", companyId)
        .eq("id", paymentId)
        .single();

    if (paymentError || !payment) {
        throw new Error("Ankaufzahlung konnte nicht für das Finanzjournal geladen werden.");
    }

    const [purchaseResult, documentResult] = await Promise.all([
        supabase
            .from("purchase_cases")
            .select("id, vehicle_id, seller_customer_id, purchase_number")
            .eq("company_id", companyId)
            .eq("id", payment.purchase_id)
            .single(),
        supabase
            .from("documents")
            .select("id")
            .eq("company_id", companyId)
            .eq("purchase_case_id", payment.purchase_id)
            .eq("document_type", "purchase_invoice")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    const purchase = purchaseResult.data;
    const purchaseError = purchaseResult.error;
    const document = documentResult.data;

    if (purchaseError || !purchase) {
        throw new Error("Ankauf zur Zahlung konnte nicht geladen werden.");
    }

    const isVoided = Boolean(payment.is_voided);

    return upsertFinancialEntry(supabase, companyId, {
        source_type: "purchase_payment",
        source_id: payment.id as string,
        source_reference: payment.payment_reference as string,
        entry_type: "purchase_payment",
        payment_method: payment.payment_method as "cash" | "bank",
        booking_date: payment.payment_date as string,
        document_date: payment.payment_date as string,
        amount: Number(payment.amount),
        direction: "out",
        description: `Zahlung Ankauf ${purchase.purchase_number ?? payment.purchase_id}`,
        category_code: "vehicle_purchase",
        customer_id: (purchase.seller_customer_id as string | null) ?? null,
        vehicle_id: (purchase.vehicle_id as string | null) ?? null,
        sale_id: null,
        purchase_id: payment.purchase_id as string,
        invoice_id: null,
        document_id: (document?.id as string | undefined) ?? null,
        status: isVoided ? "voided" : "active",
        is_cash_relevant: payment.payment_method === "cash" && !isVoided,
        voided_at: (payment.voided_at as string | null) ?? null,
        voided_by: (payment.voided_by as string | null) ?? null,
        void_reason: (payment.void_reason as string | null) ?? null,
    });
}

export async function syncCashbookEntryFinancialEntry({
    companyId,
    cashbookEntryId,
}: {
    companyId: string;
    cashbookEntryId: string;
}) {
    const supabase = createServerSupabaseClient();
    const { data: entry, error } = await supabase
        .from("cashbook_entries")
        .select(
            "id, entry_type, category, payment_method, amount, booking_date, description, customer_id, vehicle_id, sale_id, invoice_id, document_id, purchase_case_id",
        )
        .eq("company_id", companyId)
        .eq("id", cashbookEntryId)
        .single();

    if (error || !entry) {
        throw new Error("Kassenbuchbuchung konnte nicht für das Finanzjournal geladen werden.");
    }

    const direction = entry.entry_type === "income" ? "in" : "out";
    const knownCategoryCodes = new Set([
        "vehicle_purchase",
        "vehicle_sale",
        "other_income",
        "refund",
        "owner_deposit",
        "owner_withdrawal",
        "repair",
        "parts",
        "transport",
        "fuel",
        "toll",
        "insurance",
        "registration",
        "office",
        "tax_advice",
        "bank_fees",
        "other_expense",
        "other",
    ]);
    const category = entry.category as string;
    const normalizedCategory = knownCategoryCodes.has(category)
        ? category
        : entry.entry_type === "income"
          ? "other_income"
          : "other_expense";

    return upsertFinancialEntry(supabase, companyId, {
        source_type: "cashbook_entry",
        source_id: entry.id as string,
        source_reference: entry.id as string,
        entry_type: entry.entry_type === "income" ? "manual_income" : "manual_expense",
        payment_method: entry.payment_method as "cash" | "bank",
        booking_date: entry.booking_date as string,
        document_date: entry.booking_date as string,
        amount: Number(entry.amount),
        direction,
        description: entry.description as string,
        category_code: normalizedCategory,
        customer_id: (entry.customer_id as string | null) ?? null,
        vehicle_id: (entry.vehicle_id as string | null) ?? null,
        sale_id: (entry.sale_id as string | null) ?? null,
        purchase_id: (entry.purchase_case_id as string | null) ?? null,
        invoice_id: (entry.invoice_id as string | null) ?? null,
        document_id: (entry.document_id as string | null) ?? null,
        status: "active",
        is_cash_relevant: entry.payment_method === "cash",
    });
}

export async function syncCorrectionInvoiceFinancialEntry({
    companyId,
    invoiceId,
}: {
    companyId: string;
    invoiceId: string;
}) {
    const supabase = createServerSupabaseClient();
    const { data: invoice, error } = await supabase
        .from("invoices")
        .select(
            "id, sale_id, customer_id, vehicle_id, invoice_number, invoice_date, gross_amount, invoice_type, correction_status",
        )
        .eq("company_id", companyId)
        .eq("id", invoiceId)
        .single();

    if (error || !invoice) {
        throw new Error("Korrekturbeleg konnte nicht für das Finanzjournal geladen werden.");
    }

    const invoiceType = invoice.invoice_type as string;
    const isCorrection =
        invoiceType === "cancellation_invoice" || invoiceType === "credit_note";

    if (!isCorrection) {
        throw new Error("Nur Korrekturbelege können als Korrektur synchronisiert werden.");
    }

    return upsertFinancialEntry(supabase, companyId, {
        source_type: "invoice_correction",
        source_id: invoice.id as string,
        source_reference: invoice.invoice_number as string,
        entry_type: invoiceType,
        payment_method: null,
        booking_date: invoice.invoice_date as string,
        document_date: invoice.invoice_date as string,
        amount: Math.abs(Number(invoice.gross_amount)),
        direction: "out",
        description: `${invoiceType === "cancellation_invoice" ? "Stornorechnung" : "Gutschrift"} ${invoice.invoice_number}`,
        category_code: "refund",
        customer_id: (invoice.customer_id as string | null) ?? null,
        vehicle_id: (invoice.vehicle_id as string | null) ?? null,
        sale_id: (invoice.sale_id as string | null) ?? null,
        purchase_id: null,
        invoice_id: invoice.id as string,
        document_id: null,
        status: invoice.correction_status === "VOIDED" ? "voided" : "active",
        is_cash_relevant: false,
    });
}

export async function syncSaleRefundFinancialEntry({
    companyId,
    refundId,
}: {
    companyId: string;
    refundId: string;
}) {
    const supabase = createServerSupabaseClient();
    const { data: refund, error } = await supabase
        .from("sale_refunds")
        .select(
            "id, sale_id, invoice_id, correction_invoice_id, customer_id, refund_reference, amount, refund_method, refund_date, reason, status, is_voided, voided_at, voided_by, void_reason",
        )
        .eq("company_id", companyId)
        .eq("id", refundId)
        .single();

    if (error || !refund) {
        throw new Error("Rückzahlung konnte nicht für das Finanzjournal geladen werden.");
    }

    const { data: sale } = await supabase
        .from("sales")
        .select("vehicle_id")
        .eq("company_id", companyId)
        .eq("id", refund.sale_id)
        .maybeSingle();
    const isVoided = Boolean(refund.is_voided);

    return upsertFinancialEntry(supabase, companyId, {
        source_type: "sale_refund",
        source_id: refund.id as string,
        source_reference: refund.refund_reference as string,
        entry_type: "sale_refund",
        payment_method: refund.refund_method as "cash" | "bank",
        booking_date: refund.refund_date as string,
        document_date: refund.refund_date as string,
        amount: Number(refund.amount),
        direction: "out",
        description: `Rückzahlung ${refund.refund_reference}: ${refund.reason}`,
        category_code: "refund",
        customer_id: (refund.customer_id as string | null) ?? null,
        vehicle_id: (sale?.vehicle_id as string | undefined) ?? null,
        sale_id: refund.sale_id as string,
        purchase_id: null,
        invoice_id:
            (refund.correction_invoice_id as string | null) ??
            (refund.invoice_id as string | null) ??
            null,
        document_id: null,
        status: isVoided ? "voided" : "active",
        is_cash_relevant: refund.refund_method === "cash" && !isVoided,
        voided_at: (refund.voided_at as string | null) ?? null,
        voided_by: (refund.voided_by as string | null) ?? null,
        void_reason: (refund.void_reason as string | null) ?? null,
    });
}
