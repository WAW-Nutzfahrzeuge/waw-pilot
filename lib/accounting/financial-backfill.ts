import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    syncCashbookEntryFinancialEntry,
    syncPurchasePaymentFinancialEntry,
    syncSalePaymentFinancialEntry,
    syncSaleRefundFinancialEntry,
} from "@/lib/accounting/financial-sync";

/**
 * Übernahme bestehender Zahlungen in das Finanzjournal (`financial_entries`).
 *
 * Hintergrund: Bis zur Einführung von `financial_entries` ("Phase F") wurden
 * Zahlungen ausschließlich in `sale_payments`, `purchase_payments` und
 * `cashbook_entries` erfasst. Das Kassenbuch liest inzwischen ausschließlich
 * aus `financial_entries`. Zahlungen, die vor dieser Umstellung entstanden
 * sind – oder über Code-Pfade, die (mittlerweile behoben) nie
 * `syncXFinancialEntry()` aufgerufen haben – besitzen daher keinen
 * Finanzjournal-Eintrag und fehlen im Kassenbuch.
 *
 * Diese Datei implementiert KEINE eigene, zweite Buchungslogik. Sie nutzt
 * ausschließlich die bestehenden `syncXFinancialEntry`-Funktionen aus
 * financial-sync.ts, die bereits Beträge, Zahlungsart, Datum und
 * Dedupliziertheit (pro company_id/source_type/source_id/entry_type)
 * korrekt handhaben.
 */

export type BackfillPaymentMethod = "cash" | "bank" | null;

export type BackfillCandidate = {
    id: string;
    amount: number;
    paymentMethod: BackfillPaymentMethod;
    date: string;
    reference: string | null;
    isVoided: boolean;
};

export type BackfillUnresolvedCase = {
    id: string;
    amount: number;
    date: string;
    reference: string | null;
    reason: string;
};

export type BackfillSourceAnalysis = {
    alreadySyncedCount: number;
    toSync: BackfillCandidate[];
    unresolved: BackfillUnresolvedCase[];
};

export type FinancialBackfillAnalysis = {
    salePayments: BackfillSourceAnalysis;
    purchasePayments: BackfillSourceAnalysis;
    cashbookEntries: BackfillSourceAnalysis;
    saleRefunds: BackfillSourceAnalysis;
    totals: {
        toSyncCount: number;
        unresolvedCount: number;
        cashAmount: number;
        bankAmount: number;
    };
};

type SalePaymentRow = {
    id: string;
    sale_id: string;
    amount: number | string;
    payment_method: string;
    payment_date: string;
    payment_reference: string;
    is_voided: boolean | null;
};

type PurchasePaymentRow = {
    id: string;
    purchase_id: string;
    amount: number | string;
    payment_method: string;
    payment_date: string;
    payment_reference: string;
    is_voided: boolean | null;
};

type CashbookEntryRow = {
    id: string;
    entry_type: "income" | "expense";
    payment_method: string;
    amount: number | string;
    booking_date: string;
    description: string;
    sale_id: string | null;
    purchase_case_id: string | null;
    invoice_id: string | null;
};

type SaleRefundRow = {
    id: string;
    sale_id: string;
    refund_reference: string;
    amount: number | string;
    refund_method: string;
    refund_date: string;
    is_voided: boolean | null;
};

function toAmount(value: number | string): number {
    return Number(value);
}

function toPaymentMethod(value: string | null): BackfillPaymentMethod {
    return value === "cash" || value === "bank" ? value : null;
}

async function loadSyncedSourceIds(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
    sourceType: string,
): Promise<Set<string>> {
    const { data, error } = await supabase
        .from("financial_entries")
        .select("source_id")
        .eq("company_id", companyId)
        .eq("source_type", sourceType);

    if (error) {
        throw new Error(
            `Bestehende Finanzjournal-Einträge (${sourceType}) konnten nicht geladen werden: ${error.message}`,
        );
    }

    return new Set((data ?? []).map((row) => row.source_id as string));
}

export async function analyzeFinancialBackfill(): Promise<FinancialBackfillAnalysis> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [
        syncedSalePaymentIds,
        syncedPurchasePaymentIds,
        syncedCashbookEntryIds,
        syncedSaleRefundIds,
    ] = await Promise.all([
        loadSyncedSourceIds(supabase, companyId, "sale_payment"),
        loadSyncedSourceIds(supabase, companyId, "purchase_payment"),
        loadSyncedSourceIds(supabase, companyId, "cashbook_entry"),
        loadSyncedSourceIds(supabase, companyId, "sale_refund"),
    ]);

    const [
        { data: salePayments, error: salePaymentsError },
        { data: purchasePayments, error: purchasePaymentsError },
        { data: cashbookEntries, error: cashbookEntriesError },
        { data: saleRefunds, error: saleRefundsError },
    ] = await Promise.all([
        supabase
            .from("sale_payments")
            .select(
                "id, sale_id, amount, payment_method, payment_date, payment_reference, is_voided",
            )
            .eq("company_id", companyId),
        supabase
            .from("purchase_payments")
            .select(
                "id, purchase_id, amount, payment_method, payment_date, payment_reference, is_voided",
            )
            .eq("company_id", companyId),
        supabase
            .from("cashbook_entries")
            .select(
                "id, entry_type, payment_method, amount, booking_date, description, sale_id, purchase_case_id, invoice_id",
            )
            .eq("company_id", companyId),
        supabase
            .from("sale_refunds")
            .select(
                "id, sale_id, refund_reference, amount, refund_method, refund_date, is_voided",
            )
            .eq("company_id", companyId),
    ]);

    if (salePaymentsError) {
        throw new Error(`Verkaufszahlungen konnten nicht geladen werden: ${salePaymentsError.message}`);
    }
    if (purchasePaymentsError) {
        throw new Error(`Ankaufzahlungen konnten nicht geladen werden: ${purchasePaymentsError.message}`);
    }
    if (cashbookEntriesError) {
        throw new Error(`Kassenbuch-Einträge konnten nicht geladen werden: ${cashbookEntriesError.message}`);
    }
    if (saleRefundsError) {
        throw new Error(`Rückzahlungen konnten nicht geladen werden: ${saleRefundsError.message}`);
    }

    const salePaymentRows = (salePayments ?? []) as SalePaymentRow[];
    const purchasePaymentRows = (purchasePayments ?? []) as PurchasePaymentRow[];
    const cashbookEntryRows = (cashbookEntries ?? []) as CashbookEntryRow[];
    const saleRefundRows = (saleRefunds ?? []) as SaleRefundRow[];

    const AMOUNT_EPSILON = 0.005;

    const salePaymentAmountsBySale = new Map<string, number[]>();
    for (const payment of salePaymentRows) {
        const amounts = salePaymentAmountsBySale.get(payment.sale_id) ?? [];
        amounts.push(toAmount(payment.amount));
        salePaymentAmountsBySale.set(payment.sale_id, amounts);
    }

    const purchasePaymentAmountsByPurchase = new Map<string, number[]>();
    for (const payment of purchasePaymentRows) {
        const amounts = purchasePaymentAmountsByPurchase.get(payment.purchase_id) ?? [];
        amounts.push(toAmount(payment.amount));
        purchasePaymentAmountsByPurchase.set(payment.purchase_id, amounts);
    }

    function hasExactAmountMatch(amounts: number[] | undefined, amount: number): boolean {
        if (!amounts) return false;
        return amounts.some((candidate) => Math.abs(candidate - amount) < AMOUNT_EPSILON);
    }

    // --- sale_payments ---
    const salePaymentsAnalysis: BackfillSourceAnalysis = {
        alreadySyncedCount: 0,
        toSync: [],
        unresolved: [],
    };

    for (const payment of salePaymentRows) {
        if (syncedSalePaymentIds.has(payment.id)) {
            salePaymentsAnalysis.alreadySyncedCount += 1;
            continue;
        }

        salePaymentsAnalysis.toSync.push({
            id: payment.id,
            amount: toAmount(payment.amount),
            paymentMethod: toPaymentMethod(payment.payment_method),
            date: payment.payment_date,
            reference: payment.payment_reference,
            isVoided: Boolean(payment.is_voided),
        });
    }

    // --- purchase_payments ---
    const purchasePaymentsAnalysis: BackfillSourceAnalysis = {
        alreadySyncedCount: 0,
        toSync: [],
        unresolved: [],
    };

    for (const payment of purchasePaymentRows) {
        if (syncedPurchasePaymentIds.has(payment.id)) {
            purchasePaymentsAnalysis.alreadySyncedCount += 1;
            continue;
        }

        purchasePaymentsAnalysis.toSync.push({
            id: payment.id,
            amount: toAmount(payment.amount),
            paymentMethod: toPaymentMethod(payment.payment_method),
            date: payment.payment_date,
            reference: payment.payment_reference,
            isVoided: Boolean(payment.is_voided),
        });
    }

    // --- sale_refunds ---
    const saleRefundsAnalysis: BackfillSourceAnalysis = {
        alreadySyncedCount: 0,
        toSync: [],
        unresolved: [],
    };

    for (const refund of saleRefundRows) {
        if (syncedSaleRefundIds.has(refund.id)) {
            saleRefundsAnalysis.alreadySyncedCount += 1;
            continue;
        }

        saleRefundsAnalysis.toSync.push({
            id: refund.id,
            amount: toAmount(refund.amount),
            paymentMethod: toPaymentMethod(refund.refund_method),
            date: refund.refund_date,
            reference: refund.refund_reference,
            isVoided: Boolean(refund.is_voided),
        });
    }

    // --- cashbook_entries ---
    // Manuelle Buchungen sind grundsätzlich sicher zu übernehmen. Verweist ein
    // Kassenbuch-Eintrag aber auf einen Verkauf/Ankauf, für den bereits ein
    // sale_payments-/purchase_payments-Datensatz existiert, ist unklar, ob es
    // sich um dieselbe Zahlung handelt (z. B. durch den inzwischen behobenen
    // doppelten Buchungspfad beim Verkaufsanlegen) oder um eine echte, davon
    // unabhängige zweite Zahlung. Solche Fälle werden NICHT automatisch
    // übernommen, sondern als ungeklärt gemeldet.
    const cashbookEntriesAnalysis: BackfillSourceAnalysis = {
        alreadySyncedCount: 0,
        toSync: [],
        unresolved: [],
    };

    for (const entry of cashbookEntryRows) {
        if (syncedCashbookEntryIds.has(entry.id)) {
            cashbookEntriesAnalysis.alreadySyncedCount += 1;
            continue;
        }

        const amount = toAmount(entry.amount);

        if (entry.sale_id && salePaymentAmountsBySale.has(entry.sale_id)) {
            const exactMatch = hasExactAmountMatch(
                salePaymentAmountsBySale.get(entry.sale_id),
                amount,
            );
            cashbookEntriesAnalysis.unresolved.push({
                id: entry.id,
                amount,
                date: entry.booking_date,
                reference: entry.description,
                reason: exactMatch
                    ? "Hoher Verdacht auf Doppelbuchung: Betrag stimmt exakt mit einer bereits erfassten Verkaufszahlung (sale_payments) für denselben Verkauf überein. Sehr wahrscheinlich dieselbe Zahlung – nicht übernehmen, bitte prüfen und ggf. diesen Kassenbuch-Eintrag stornieren."
                    : "Verweist auf einen Verkauf, für den bereits eine Zahlung (sale_payments) mit abweichendem Betrag erfasst ist. Könnte eine zusätzliche, echte Zahlung sein – bitte manuell prüfen, bevor eine Übernahme erfolgt.",
            });
            continue;
        }

        if (entry.purchase_case_id && purchasePaymentAmountsByPurchase.has(entry.purchase_case_id)) {
            const exactMatch = hasExactAmountMatch(
                purchasePaymentAmountsByPurchase.get(entry.purchase_case_id),
                amount,
            );
            cashbookEntriesAnalysis.unresolved.push({
                id: entry.id,
                amount,
                date: entry.booking_date,
                reference: entry.description,
                reason: exactMatch
                    ? "Hoher Verdacht auf Doppelbuchung: Betrag stimmt exakt mit einer bereits erfassten Ankaufzahlung (purchase_payments) für dieselbe Ankaufsakte überein. Sehr wahrscheinlich dieselbe Zahlung – nicht übernehmen, bitte prüfen und ggf. diesen Kassenbuch-Eintrag stornieren."
                    : "Verweist auf eine Ankaufsakte, für die bereits eine Zahlung (purchase_payments) mit abweichendem Betrag erfasst ist. Könnte eine zusätzliche, echte Zahlung sein – bitte manuell prüfen, bevor eine Übernahme erfolgt.",
            });
            continue;
        }

        cashbookEntriesAnalysis.toSync.push({
            id: entry.id,
            amount,
            paymentMethod: toPaymentMethod(entry.payment_method),
            date: entry.booking_date,
            reference: entry.description,
            isVoided: false,
        });
    }

    const allToSync = [
        ...salePaymentsAnalysis.toSync,
        ...purchasePaymentsAnalysis.toSync,
        ...cashbookEntriesAnalysis.toSync,
        ...saleRefundsAnalysis.toSync,
    ];

    let cashAmount = 0;
    let bankAmount = 0;

    for (const candidate of allToSync) {
        if (candidate.isVoided) continue;

        if (candidate.paymentMethod === "cash") {
            cashAmount += candidate.amount;
        } else if (candidate.paymentMethod === "bank") {
            bankAmount += candidate.amount;
        }
    }

    return {
        salePayments: salePaymentsAnalysis,
        purchasePayments: purchasePaymentsAnalysis,
        cashbookEntries: cashbookEntriesAnalysis,
        saleRefunds: saleRefundsAnalysis,
        totals: {
            toSyncCount: allToSync.length,
            unresolvedCount: cashbookEntriesAnalysis.unresolved.length,
            cashAmount,
            bankAmount,
        },
    };
}

export type BackfillExecutionFailure = {
    source: "sale_payment" | "purchase_payment" | "cashbook_entry" | "sale_refund";
    id: string;
    message: string;
};

export type BackfillExecutionResult = {
    syncedCounts: {
        salePayments: number;
        purchasePayments: number;
        cashbookEntries: number;
        saleRefunds: number;
    };
    failures: BackfillExecutionFailure[];
};

export async function executeFinancialBackfill(): Promise<BackfillExecutionResult> {
    const companyId = getCurrentCompanyId();

    // Analyse unmittelbar vor der Ausführung erneut laden, damit zwischen
    // Anzeige und Ausführung entstandene neue Zahlungen korrekt (und nicht
    // doppelt) berücksichtigt werden. Ungeklärte Fälle werden nie ausgeführt.
    const analysis = await analyzeFinancialBackfill();

    const failures: BackfillExecutionFailure[] = [];
    let syncedSalePayments = 0;
    let syncedPurchasePayments = 0;
    let syncedCashbookEntries = 0;
    let syncedSaleRefunds = 0;

    for (const candidate of analysis.salePayments.toSync) {
        try {
            await syncSalePaymentFinancialEntry({ companyId, paymentId: candidate.id });
            syncedSalePayments += 1;
        } catch (error) {
            failures.push({
                source: "sale_payment",
                id: candidate.id,
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
        }
    }

    for (const candidate of analysis.purchasePayments.toSync) {
        try {
            await syncPurchasePaymentFinancialEntry({ companyId, paymentId: candidate.id });
            syncedPurchasePayments += 1;
        } catch (error) {
            failures.push({
                source: "purchase_payment",
                id: candidate.id,
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
        }
    }

    for (const candidate of analysis.cashbookEntries.toSync) {
        try {
            await syncCashbookEntryFinancialEntry({ companyId, cashbookEntryId: candidate.id });
            syncedCashbookEntries += 1;
        } catch (error) {
            failures.push({
                source: "cashbook_entry",
                id: candidate.id,
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
        }
    }

    for (const candidate of analysis.saleRefunds.toSync) {
        try {
            await syncSaleRefundFinancialEntry({ companyId, refundId: candidate.id });
            syncedSaleRefunds += 1;
        } catch (error) {
            failures.push({
                source: "sale_refund",
                id: candidate.id,
                message: error instanceof Error ? error.message : "Unbekannter Fehler",
            });
        }
    }

    return {
        syncedCounts: {
            salePayments: syncedSalePayments,
            purchasePayments: syncedPurchasePayments,
            cashbookEntries: syncedCashbookEntries,
            saleRefunds: syncedSaleRefunds,
        },
        failures,
    };
}
