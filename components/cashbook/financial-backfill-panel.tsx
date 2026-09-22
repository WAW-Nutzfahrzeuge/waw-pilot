"use client";

import { useActionState } from "react";
import { AlertTriangle, History, Loader2 } from "lucide-react";

import {
    dismissCashbookEntryAsDuplicateAction,
    executeCashbookBackfillAction,
    forceSyncCashbookEntryAction,
    type BackfillActionState,
    type DismissCashbookEntryState,
    type ForceSyncCashbookEntryState,
} from "@/app/dashboard/cashbook/backfill-actions";
import type {
    BackfillUnresolvedCase,
    FinancialBackfillAnalysis,
} from "@/lib/accounting/financial-backfill";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const initialState: BackfillActionState = { status: "idle" };
const initialForceSyncState: ForceSyncCashbookEntryState = { status: "idle" };
const initialDismissState: DismissCashbookEntryState = { status: "idle" };

type FinancialBackfillPanelProps = {
    analysis: FinancialBackfillAnalysis | null;
    analysisError?: string | null;
};

function sourceLabel(source: string): string {
    const labels: Record<string, string> = {
        sale_payment: "Verkaufszahlungen",
        purchase_payment: "Ankaufzahlungen",
        cashbook_entry: "manuelle Kassenbuch-Einträge",
        sale_refund: "Rückzahlungen",
    };

    return labels[source] ?? source;
}

function UnresolvedCashbookEntryRow({ item }: { item: BackfillUnresolvedCase }) {
    const [forceSyncState, forceSyncAction, isForceSyncing] = useActionState(
        forceSyncCashbookEntryAction,
        initialForceSyncState,
    );
    const [dismissState, dismissAction, isDismissing] = useActionState(
        dismissCashbookEntryAsDuplicateAction,
        initialDismissState,
    );

    if (forceSyncState.status === "success") {
        return (
            <li className="rounded-xl bg-emerald-100 px-2 py-1 text-emerald-800">
                Übernommen: {formatCurrency(item.amount)} am {formatDate(item.date)}
                {item.reference ? ` – ${item.reference}` : ""}. Dieser Eintrag
                verschwindet aus der Liste, sobald du die Seite neu lädst.
            </li>
        );
    }

    if (dismissState.status === "success") {
        return (
            <li className="rounded-xl bg-slate-200 px-2 py-1 text-slate-700">
                Duplikat gelöscht: {formatCurrency(item.amount)} am{" "}
                {formatDate(item.date)}
                {item.reference ? ` – ${item.reference}` : ""}. Dieser Eintrag ist
                entfernt und taucht nicht mehr auf.
            </li>
        );
    }

    return (
        <li className="space-y-1">
            <div>
                <span className="font-semibold">
                    {formatCurrency(item.amount)} am {formatDate(item.date)}
                </span>
                {item.reference ? ` – ${item.reference}` : ""}: {item.reason}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <form
                    action={dismissAction}
                    onSubmit={(event) => {
                        if (
                            !window.confirm(
                                "Diesen Kassenbuch-Eintrag endgültig löschen? Die dazugehörige Zahlung bleibt als eigener Zahlungsdatensatz erhalten – nur dieser doppelte, alte Kassenbuch-Eintrag wird entfernt und kann danach nicht mehr aufaddiert werden.",
                            )
                        ) {
                            event.preventDefault();
                        }
                    }}
                >
                    <input type="hidden" name="cashbook_entry_id" value={item.id} />
                    <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={isDismissing || isForceSyncing}
                        className="h-7 rounded-full border-slate-300 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                    >
                        {isDismissing ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                        ) : null}
                        Ist Duplikat – löschen
                    </Button>
                </form>
                <form action={forceSyncAction}>
                    <input type="hidden" name="cashbook_entry_id" value={item.id} />
                    <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={isForceSyncing || isDismissing}
                        className="h-7 rounded-full border-red-300 px-2.5 text-[11px] font-bold text-red-800 hover:bg-red-100"
                    >
                        {isForceSyncing ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                        ) : null}
                        Kein Duplikat – trotzdem übernehmen
                    </Button>
                </form>
                {forceSyncState.status === "error" ? (
                    <span className="text-[11px] font-semibold text-red-800">
                        {forceSyncState.message}
                    </span>
                ) : null}
                {dismissState.status === "error" ? (
                    <span className="text-[11px] font-semibold text-red-800">
                        {dismissState.message}
                    </span>
                ) : null}
            </div>
        </li>
    );
}

export function FinancialBackfillPanel({
    analysis,
    analysisError = null,
}: FinancialBackfillPanelProps) {
    const [executeState, executeAction, isExecuting] = useActionState(
        executeCashbookBackfillAction,
        initialState,
    );

    return (
        <Card className="rounded-[1.75rem] border-dashed border-amber-300 bg-amber-50/60 print:hidden">
            <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                    <History className="size-5 text-amber-700" />
                    <div>
                        <p className="text-sm font-black text-amber-900">
                            Alte Zahlungen ins Finanzjournal nachtragen
                        </p>
                        <p className="text-xs font-medium text-amber-800">
                            Für den normalen Alltag brauchst du dieses Werkzeug nicht:
                            Wenn du heute einen Verkauf/Ankauf einträgst und eine Zahlung
                            erfasst, landet sie automatisch im Kassenbuch. Dieses
                            Werkzeug findet nur Zahlungen von{" "}
                            <span className="font-bold">vor</span> dieser Umstellung,
                            die es noch nicht ins Kassenbuch geschafft haben, und trägt
                            sie einmalig nach. Sobald unten „keine offenen Altdaten“
                            steht, ist hier nichts mehr zu tun und die Seite kann
                            verlassen werden.
                        </p>
                    </div>
                </div>

                {analysisError ? (
                    <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                        Prüfung fehlgeschlagen: {analysisError}
                    </p>
                ) : null}

                {executeState.status === "error" ? (
                    <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                        {executeState.message}
                    </p>
                ) : null}

                {analysis ? (
                    analysis.totals.toSyncCount === 0 &&
                    analysis.totals.unresolvedCount === 0 ? (
                        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                            Keine offenen Altdaten. Alle bekannten Zahlungen stehen
                            bereits im Kassenbuch.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                                    <p className="text-xs font-bold uppercase text-slate-500">
                                        Zu übernehmen
                                    </p>
                                    <p className="text-lg font-black text-slate-950">
                                        {analysis.totals.toSyncCount}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                                    <p className="text-xs font-bold uppercase text-slate-500">
                                        Summe Bar / Bank
                                    </p>
                                    <p className="text-lg font-black text-slate-950">
                                        {formatCurrency(analysis.totals.cashAmount)} /{" "}
                                        {formatCurrency(analysis.totals.bankAmount)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-white p-3">
                                    <p className="text-xs font-bold uppercase text-slate-500">
                                        Ungeklärte Fälle
                                    </p>
                                    <p className="text-lg font-black text-slate-950">
                                        {analysis.totals.unresolvedCount}
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                {(
                                    [
                                        ["sale_payment", analysis.salePayments],
                                        ["purchase_payment", analysis.purchasePayments],
                                        ["cashbook_entry", analysis.cashbookEntries],
                                        ["sale_refund", analysis.saleRefunds],
                                    ] as const
                                ).map(([source, sourceAnalysis]) => (
                                    <div
                                        key={source}
                                        className="rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                                    >
                                        <p className="font-bold text-slate-900">
                                            {sourceLabel(source)}
                                        </p>
                                        <p className="text-slate-600">
                                            bereits im Kassenbuch:{" "}
                                            {sourceAnalysis.alreadySyncedCount} · zu
                                            übernehmen: {sourceAnalysis.toSync.length}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {analysis.cashbookEntries.unresolved.length > 0 ? (
                                <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-3">
                                    <div className="flex items-center gap-2 text-red-800">
                                        <AlertTriangle className="size-4" />
                                        <p className="text-sm font-black">
                                            Ungeklärte Kassenbuch-Einträge
                                        </p>
                                    </div>
                                    <p className="text-xs text-red-700">
                                        Bei jedem dieser Einträge gibt es bereits eine
                                        erfasste Zahlung mit demselben oder ähnlichem
                                        Betrag für denselben Verkauf/Ankauf – vermutlich
                                        also derselbe Vorgang doppelt gespeichert.
                                        Bestätige nach Prüfung entweder „Ist Duplikat –
                                        löschen“ (entfernt den alten, doppelten
                                        Kassenbuch-Eintrag endgültig, die echte Zahlung
                                        bleibt unangetastet erhalten) oder, falls es
                                        doch eine echte zusätzliche Zahlung war, „Kein
                                        Duplikat – trotzdem übernehmen“.
                                    </p>
                                    <ul className="space-y-2 text-xs text-red-700">
                                        {analysis.cashbookEntries.unresolved.map(
                                            (item) => (
                                                <UnresolvedCashbookEntryRow
                                                    key={item.id}
                                                    item={item}
                                                />
                                            ),
                                        )}
                                    </ul>
                                </div>
                            ) : null}

                            {analysis.totals.toSyncCount > 0 ? (
                                <form action={executeAction}>
                                    <Button
                                        type="submit"
                                        disabled={isExecuting}
                                        className="rounded-2xl bg-amber-700 font-bold text-white hover:bg-amber-800"
                                    >
                                        {isExecuting ? (
                                            <Loader2 className="mr-2 size-4 animate-spin" />
                                        ) : null}
                                        {analysis.totals.toSyncCount} Buchung(en)
                                        übernehmen
                                    </Button>
                                </form>
                            ) : null}
                        </div>
                    )
                ) : null}

                {executeState.status === "executed" ? (
                    <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        <p className="font-black">Übernahme abgeschlossen</p>
                        <p>
                            Verkaufszahlungen: {executeState.result.syncedCounts.salePayments}{" "}
                            · Ankaufzahlungen:{" "}
                            {executeState.result.syncedCounts.purchasePayments} · manuelle
                            Buchungen: {executeState.result.syncedCounts.cashbookEntries} ·
                            Rückzahlungen: {executeState.result.syncedCounts.saleRefunds}
                        </p>
                        {executeState.result.failures.length > 0 ? (
                            <div className="space-y-1">
                                <p className="font-bold text-red-700">
                                    {executeState.result.failures.length} fehlgeschlagen:
                                </p>
                                <ul className="space-y-0.5 text-xs text-red-700">
                                    {executeState.result.failures.map((failure) => (
                                        <li key={`${failure.source}-${failure.id}`}>
                                            <Badge variant="destructive">
                                                {sourceLabel(failure.source)}
                                            </Badge>{" "}
                                            {failure.id}: {failure.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        <p className="text-xs text-emerald-700">
                            Die Seite wurde automatisch aktualisiert; ggf. kurz neu laden,
                            um den bereinigten Stand zu sehen.
                        </p>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
