export const dynamic = "force-dynamic";

import { FinancialOverview } from "@/components/cashbook/financial-overview";
import { analyzeFinancialBackfill } from "@/lib/accounting/financial-backfill";
import {
    getCashRegisterSummary,
    getFinancialEntries,
} from "@/lib/accounting/financial-queries";
import { getCurrentUserRole } from "@/lib/auth/current-user";

async function hasPendingBackfillWork(isAdmin: boolean): Promise<boolean> {
    if (!isAdmin) {
        return false;
    }

    try {
        const analysis = await analyzeFinancialBackfill();
        // Der Link soll nur auftauchen, solange es tatsächlich etwas zu
        // klären gibt. Sobald alles übernommen oder als Duplikat bestätigt
        // wurde, verschwindet er automatisch wieder – kein Dauerfixpunkt im
        // normalen Kassenbuch.
        return (
            analysis.totals.toSyncCount > 0 || analysis.totals.unresolvedCount > 0
        );
    } catch {
        // Bei einem Prüfungsfehler lieber den Hinweis zeigen (führt zur
        // Detailseite mit der genauen Fehlermeldung), statt ein Problem
        // stillschweigend zu verstecken.
        return true;
    }
}

type CashbookPageProps = {
    searchParams: Promise<{
        from?: string;
        to?: string;
        tab?: string;
    }>;
};

function normalizeDateParam(value: string | undefined): string | null {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function CashbookPage({ searchParams }: CashbookPageProps) {
    const resolvedSearchParams = await searchParams;
    const dateFrom = normalizeDateParam(resolvedSearchParams.from);
    const dateTo = normalizeDateParam(resolvedSearchParams.to);
    const activeTab =
        resolvedSearchParams.tab === "accounting" ? "accounting" : "cash";
    const entries = await getFinancialEntries({
        from: dateFrom,
        to: dateTo,
    });
    const cashSummary = await getCashRegisterSummary(entries);
    const role = await getCurrentUserRole();
    const isAdmin = role === "admin";
    const showBackfillLink = await hasPendingBackfillWork(isAdmin);

    return (
        <FinancialOverview
            entries={entries}
            cashSummary={cashSummary}
            activeTab={activeTab}
            dateFrom={dateFrom}
            dateTo={dateTo}
            isAdmin={isAdmin}
            showBackfillLink={showBackfillLink}
        />
    );
}


