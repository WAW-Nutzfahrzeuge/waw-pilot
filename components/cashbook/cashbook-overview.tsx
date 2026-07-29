"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
    Banknote,
    BookOpenCheck,
    Coins,
    Download,
    ExternalLink,
    Plus,
    Printer,
    Receipt,
    Search,
    ShoppingCart,
    Wallet,
} from "lucide-react";

import type { CashbookEntryRow } from "@/lib/cashbook/cashbook-queries";
import {
    calculateBalance,
    calculatePaymentMethodBalance,
    calculateTotalExpenses,
    calculateTotalIncome,
    getCashbookCategoryLabel,
    getCashbookPaymentMethodLabel,
    getCashbookTypeLabel,
    getCashbookTypeTone,
} from "@/lib/cashbook/cashbook-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CashbookOverviewProps = {
    entries: CashbookEntryRow[];
    dateFrom?: string | null;
    dateTo?: string | null;
};

type CashbookFilter = "all" | "cash" | "bank";
type EntryTypeFilter = "all" | "income" | "expense";

function getPeriodLabel(dateFrom?: string | null, dateTo?: string | null): string {
    if (dateFrom && dateTo) {
        return `${formatDate(dateFrom)} bis ${formatDate(dateTo)}`;
    }

    if (dateFrom) {
        return `ab ${formatDate(dateFrom)}`;
    }

    if (dateTo) {
        return `bis ${formatDate(dateTo)}`;
    }

    return "Alle Buchungen";
}

function escapeCsvValue(value: string | number | null | undefined): string {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
}

function formatCsvAmount(value: number): string {
    return value.toFixed(2).replace(".", ",");
}

function createCashbookCsv(entries: CashbookEntryRow[]): string {
    const header = [
        "Datum",
        "Typ",
        "Kategorie",
        "Beschreibung",
        "Zahlungsart",
        "Betrag",
        "Kunde",
        "Fahrzeug",
        "Verkauf",
        "Rechnung",
    ];

    const rows = entries.map((entry) => [
        formatDate(entry.booking_date),
        getCashbookTypeLabel(entry.entry_type),
        getCashbookCategoryLabel(entry.category),
        entry.description,
        getCashbookPaymentMethodLabel(entry.payment_method),
        `${entry.entry_type === "income" ? "" : "-"}${formatCsvAmount(entry.amount)}`,
        entry.customer_name ?? "",
        entry.vehicle_name ?? "",
        entry.sale_id ?? "",
        entry.invoice_number ?? "",
    ]);

    return [
        header.map(escapeCsvValue).join(";"),
        ...rows.map((row) => row.map(escapeCsvValue).join(";")),
    ].join("\n");
}

function getCashbookExportFilename(
    dateFrom?: string | null,
    dateTo?: string | null,
): string {
    if (dateFrom || dateTo) {
        return `kassenbuch-${dateFrom ?? "start"}-bis-${dateTo ?? "heute"}.csv`;
    }

    return "kassenbuch.csv";
}

export function CashbookOverview({
                                     entries,
                                     dateFrom,
                                     dateTo,
                                 }: CashbookOverviewProps) {
    const [query, setQuery] = useState("");
    const [paymentFilter, setPaymentFilter] = useState<CashbookFilter>("all");
    const [entryTypeFilter, setEntryTypeFilter] =
        useState<EntryTypeFilter>("all");
    const isDateFiltered = Boolean(dateFrom || dateTo);
    const periodLabel = getPeriodLabel(dateFrom, dateTo);

    const filteredEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return entries.filter((entry) => {
            const matchesPaymentFilter =
                paymentFilter === "all" || entry.payment_method === paymentFilter;

            const matchesEntryTypeFilter =
                entryTypeFilter === "all" || entry.entry_type === entryTypeFilter;

            if (!matchesPaymentFilter || !matchesEntryTypeFilter) return false;

            if (!normalizedQuery) return true;

            const searchableText = [
                entry.description,
                entry.vehicle_name,
                entry.invoice_number,
                entry.purchase_number,
                entry.customer_name,
                getCashbookCategoryLabel(entry.category),
                getCashbookPaymentMethodLabel(entry.payment_method),
                getCashbookTypeLabel(entry.entry_type),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(normalizedQuery);
        });
    }, [query, entries, paymentFilter, entryTypeFilter]);

    const totalIncome = calculateTotalIncome(filteredEntries);
    const totalExpenses = calculateTotalExpenses(filteredEntries);
    const totalBalance = calculateBalance(filteredEntries);
    const cashBalance = calculatePaymentMethodBalance(filteredEntries, "cash");
    const bankBalance = calculatePaymentMethodBalance(filteredEntries, "bank");

    const purchaseExpenses = filteredEntries
        .filter(
            (entry) =>
                entry.entry_type === "expense" &&
                (entry.category === "vehicle_purchase" || entry.purchase_case_id),
        )
        .reduce((sum, entry) => sum + entry.amount, 0);

    function handlePrint() {
        window.print();
    }

    function handleCsvExport() {
        const csv = `\uFEFF${createCashbookCsv(filteredEntries)}`;
        const blob = new Blob([csv], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = getCashbookExportFilename(dateFrom, dateTo);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    return (
        <div className="cashbook-print-area space-y-6 print:space-y-4">
            <div className="hidden print:block">
                <h1 className="text-2xl font-black text-slate-950">Kassenbuch</h1>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                    Zeitraum: {periodLabel}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                    Ausdruck: {formatDate(new Date())}
                </p>
            </div>

            <div className="print:hidden">
                <PageHeader
                    eyebrow="Finanzen"
                    title="Kassenbuch"
                    description="Einnahmen, Ausgaben, Barbestand, Bankbestand und Zahlungsbewegungen aus Supabase."
                    action={
                        <Button
                            asChild
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        >
                            <Link href="/dashboard/cashbook/new">
                                <Plus className="mr-2 size-4" />
                                Buchung erfassen
                            </Link>
                        </Button>
                    }
                />
            </div>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 print:hidden">
                <CashbookStatCard
                    label="Gesamtsaldo"
                    value={formatCurrency(totalBalance)}
                    description={`${formatCurrency(totalIncome)} Einnahmen · ${formatCurrency(totalExpenses)} Ausgaben`}
                    icon={BookOpenCheck}
                    tone={totalBalance >= 0 ? "success" : "danger"}
                />
                <CashbookStatCard
                    label="Barbestand"
                    value={formatCurrency(cashBalance)}
                    description="nur Barbuchungen"
                    icon={Coins}
                    tone={cashBalance >= 0 ? "success" : "danger"}
                />
                <CashbookStatCard
                    label="Bankbestand"
                    value={formatCurrency(bankBalance)}
                    description="nur Bankbuchungen"
                    icon={Banknote}
                    tone={bankBalance >= 0 ? "success" : "danger"}
                />
                <CashbookStatCard
                    label="Ankauf-Ausgaben"
                    value={formatCurrency(purchaseExpenses)}
                    description="Fahrzeugeinkäufe"
                    icon={ShoppingCart}
                    tone={purchaseExpenses > 0 ? "danger" : "success"}
                />
                <CashbookStatCard
                    label="Buchungen"
                    value={filteredEntries.length}
                    description={
                        isDateFiltered ? "im gewählten Zeitraum" : "erfasste Bewegungen"
                    }
                    icon={Wallet}
                    tone="success"
                />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px] print:block">
                <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm print:rounded-none print:border-0 print:shadow-none">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-200 bg-white p-5 print:hidden">
                            <form
                                action="/dashboard/cashbook"
                                className="mb-5 grid gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end"
                            >
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="cashbook-date-from"
                                        className="text-xs font-extrabold uppercase tracking-wide text-slate-400"
                                    >
                                        Von
                                    </label>
                                    <Input
                                        id="cashbook-date-from"
                                        name="from"
                                        type="date"
                                        defaultValue={dateFrom ?? ""}
                                        className="h-11 rounded-2xl border-slate-200 bg-white font-semibold"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="cashbook-date-to"
                                        className="text-xs font-extrabold uppercase tracking-wide text-slate-400"
                                    >
                                        Bis
                                    </label>
                                    <Input
                                        id="cashbook-date-to"
                                        name="to"
                                        type="date"
                                        defaultValue={dateTo ?? ""}
                                        className="h-11 rounded-2xl border-slate-200 bg-white font-semibold"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="h-11 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                >
                                    Anwenden
                                </Button>

                                <Button
                                    asChild
                                    type="button"
                                    variant="outline"
                                    className="h-11 rounded-2xl font-bold"
                                >
                                    <Link href="/dashboard/cashbook">Zurücksetzen</Link>
                                </Button>

                                {isDateFiltered ? (
                                    <p className="text-sm font-bold text-cyan-700 lg:col-span-4">
                                        Gefiltert: {periodLabel}
                                    </p>
                                ) : null}
                            </form>

                            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                                <div className="min-w-0">
                                    <h2 className="text-xl font-extrabold text-slate-950">
                                        Buchungsliste
                                    </h2>
                                    <p className="mt-1 max-w-xl text-sm font-medium leading-6 text-slate-500">
                                        Kassenbuch mit Bezug zu Kunde, Fahrzeug, Verkauf, Ankauf, Rechnung und Beleg.
                                    </p>
                                </div>

                                <div className="grid w-full gap-3 sm:grid-cols-2 2xl:w-auto 2xl:min-w-[52rem] 2xl:grid-cols-[10rem_11rem_minmax(14rem,1fr)_auto]">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="payment-filter"
                                            className="text-xs font-extrabold uppercase tracking-wide text-slate-400"
                                        >
                                            Zahlungsart
                                        </label>
                                        <select
                                            id="payment-filter"
                                            value={paymentFilter}
                                            onChange={(event) =>
                                                setPaymentFilter(event.target.value as CashbookFilter)
                                            }
                                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-extrabold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                                        >
                                            <option value="all">Alle</option>
                                            <option value="cash">Bar</option>
                                            <option value="bank">Bank</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="entry-type-filter"
                                            className="text-xs font-extrabold uppercase tracking-wide text-slate-400"
                                        >
                                            Typ
                                        </label>
                                        <select
                                            id="entry-type-filter"
                                            value={entryTypeFilter}
                                            onChange={(event) =>
                                                setEntryTypeFilter(event.target.value as EntryTypeFilter)
                                            }
                                            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-extrabold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                                        >
                                            <option value="all">Alles</option>
                                            <option value="income">Einnahmen</option>
                                            <option value="expense">Ausgaben</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1.5 sm:col-span-2 2xl:col-span-1">
                                        <label
                                            htmlFor="cashbook-search"
                                            className="text-xs font-extrabold uppercase tracking-wide text-slate-400"
                                        >
                                            Suche
                                        </label>
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                            <Input
                                                id="cashbook-search"
                                                value={query}
                                                onChange={(event) => setQuery(event.target.value)}
                                                placeholder="Buchung suchen..."
                                                className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 2xl:col-span-1 2xl:flex 2xl:items-end">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handlePrint}
                                            className="h-11 rounded-2xl px-4 font-bold"
                                            aria-label="Kassenbuch drucken"
                                            title="Drucken"
                                        >
                                            <Printer className="mr-2 size-4" />
                                            Drucken
                                        </Button>

                                        <Button
                                            type="button"
                                            onClick={handleCsvExport}
                                            className="h-11 rounded-2xl bg-slate-950 px-4 font-bold text-white hover:bg-slate-800"
                                            aria-label="Kassenbuch als CSV exportieren"
                                            title="Herunterladen"
                                        >
                                            <Download className="mr-2 size-4" />
                                            Herunterladen
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="grid gap-4 p-4 md:hidden print:hidden">
                                {filteredEntries.map((entry) => (
                                    <CashbookMobileCard key={entry.id} entry={entry} />
                                ))}

                                {filteredEntries.length === 0 ? <EmptyCashbookState /> : null}
                            </div>

                            <div className="hidden overflow-x-auto md:block print:block print:overflow-visible">
                                <table className="w-full min-w-[1120px] text-left print:min-w-0 print:text-[8px]">
                                    <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-5 py-4 print:px-1 print:py-1">Datum</th>
                                        <th className="px-5 py-4 print:px-1 print:py-1">Typ</th>
                                        <th className="px-5 py-4 print:px-1 print:py-1">Kategorie</th>
                                        <th className="px-5 py-4 print:px-1 print:py-1">Beschreibung</th>
                                        <th className="px-5 py-4 print:px-1 print:py-1">Bezug</th>
                                        <th className="px-5 py-4 print:px-1 print:py-1">Zahlungsart</th>
                                        <th className="px-5 py-4 text-right print:px-1 print:py-1">Betrag</th>
                                        <th className="px-5 py-4 text-right print:hidden">Aktion</th>
                                    </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                    {filteredEntries.map((entry) => (
                                        <CashbookDesktopRow key={entry.id} entry={entry} />
                                    ))}
                                    </tbody>
                                </table>

                                {filteredEntries.length === 0 ? <EmptyCashbookState /> : null}
                            </div>

                            <div className="hidden border-t border-slate-200 p-4 print:block">
                                <h2 className="text-base font-black text-slate-950">
                                    {isDateFiltered
                                        ? "Zusammenfassung im gewählten Zeitraum"
                                        : "Zusammenfassung gesamt"}
                                </h2>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                    <PrintSummaryItem label="Einnahmen gesamt" value={formatCurrency(totalIncome)} />
                                    <PrintSummaryItem label="Ausgaben gesamt" value={formatCurrency(totalExpenses)} />
                                    <PrintSummaryItem label="Ankauf-Ausgaben" value={formatCurrency(purchaseExpenses)} />
                                    <PrintSummaryItem label="Barbestand" value={formatCurrency(cashBalance)} />
                                    <PrintSummaryItem label="Bankbestand" value={formatCurrency(bankBalance)} />
                                    <PrintSummaryItem label="Gesamtsaldo" value={formatCurrency(totalBalance)} />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4 xl:max-w-[360px] print:hidden">
                    <Card className="rounded-[1.5rem] border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/40">
                        <CardContent className="p-4">
                            <div>
                                <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.28em] text-cyan-200">
                                    {isDateFiltered
                                        ? "Zusammenfassung im gewählten Zeitraum"
                                        : "Zusammenfassung gesamt"}
                                </p>
                                <h2 className="mt-1.5 text-xl font-extrabold">Kasse & Bank</h2>
                            </div>

                            <div className="mt-4 space-y-2.5">
                                <SummaryRow
                                    label="Einnahmen gesamt"
                                    value={formatCurrency(totalIncome)}
                                />
                                <SummaryRow
                                    label="Ausgaben gesamt"
                                    value={formatCurrency(totalExpenses)}
                                />
                                <SummaryRow
                                    label="Ankauf-Ausgaben"
                                    value={formatCurrency(purchaseExpenses)}
                                />
                                <SummaryRow label="Barbestand" value={formatCurrency(cashBalance)} />
                                <SummaryRow label="Bankbestand" value={formatCurrency(bankBalance)} />
                            </div>

                            <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-3">
                                <p className="text-xs font-bold text-slate-200">
                                    {isDateFiltered
                                        ? "Gesamtsaldo im Zeitraum"
                                        : "Aktueller Gesamtsaldo"}
                                </p>
                                <p className="mt-1.5 break-words text-2xl font-extrabold text-cyan-200">
                                    {formatCurrency(totalBalance)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </section>

            <style>{`
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 10mm;
                    }

                    body {
                        background: #ffffff !important;
                    }

                    aside,
                    header,
                    nav {
                        display: none !important;
                    }

                    main {
                        padding: 0 !important;
                    }

                    .cashbook-print-area {
                        color: #0f172a;
                    }
                }
            `}</style>
        </div>
    );
}

function CashbookDesktopRow({ entry }: { entry: CashbookEntryRow }) {
    const router = useRouter();
    const targetHref = getEntryTargetHref(entry);

    return (
        <tr
            onClick={() => {
                if (targetHref) {
                    router.push(targetHref);
                }
            }}
            className={
                targetHref
                    ? "group cursor-pointer bg-white transition-colors hover:bg-cyan-50/30"
                    : "group bg-white transition-colors hover:bg-slate-50"
            }
        >
            <td className="px-5 py-5">
                <p className="text-sm font-semibold text-slate-700">
                    {formatDate(entry.booking_date)}
                </p>
            </td>

            <td className="px-5 py-5">
                <StatusBadge tone={getCashbookTypeTone(entry.entry_type)}>
                    {getCashbookTypeLabel(entry.entry_type)}
                </StatusBadge>
            </td>

            <td className="px-5 py-5">
                <p className="font-bold text-slate-700">
                    {getCashbookCategoryLabel(entry.category)}
                </p>
            </td>

            <td className="px-5 py-5">
                <p className="max-w-xs font-semibold text-slate-950">
                    {entry.description}
                </p>
                {entry.customer_name ? (
                    <p className="mt-1 text-xs font-medium text-slate-500">
                        {entry.customer_name}
                    </p>
                ) : null}
            </td>

            <td className="px-5 py-5">
                <EntryReference entry={entry} />
            </td>

            <td className="px-5 py-5">
                <StatusBadge tone="neutral">
                    {getCashbookPaymentMethodLabel(entry.payment_method)}
                </StatusBadge>
            </td>

            <td className="px-5 py-5 text-right">
                <p
                    className={
                        entry.entry_type === "income"
                            ? "font-extrabold text-emerald-700"
                            : "font-extrabold text-red-700"
                    }
                >
                    {entry.entry_type === "income" ? "+" : "-"}
                    {formatCurrency(entry.amount)}
                </p>
            </td>

            <td
                className="px-5 py-5 print:hidden"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex justify-end gap-2">
                    <EntryDocumentButton entry={entry} />
                    <EntryTargetButton entry={entry} />
                </div>
            </td>
        </tr>
    );
}

function CashbookMobileCard({ entry }: { entry: CashbookEntryRow }) {
    const router = useRouter();
    const targetHref = getEntryTargetHref(entry);

    return (
        <div
            onClick={() => {
                if (targetHref) {
                    router.push(targetHref);
                }
            }}
            className={
                targetHref
                    ? "cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.99]"
                    : "rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200"
            }
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <StatusBadge tone={getCashbookTypeTone(entry.entry_type)}>
                        {getCashbookTypeLabel(entry.entry_type)}
                    </StatusBadge>

                    <p className="mt-3 text-sm font-bold text-slate-500">
                        {formatDate(entry.booking_date)}
                    </p>
                </div>

                <p
                    className={
                        entry.entry_type === "income"
                            ? "text-right text-lg font-extrabold text-emerald-700"
                            : "text-right text-lg font-extrabold text-red-700"
                    }
                >
                    {entry.entry_type === "income" ? "+" : "-"}
                    {formatCurrency(entry.amount)}
                </p>
            </div>

            <div className="mt-4">
                <p className="text-base font-extrabold text-slate-950">
                    {entry.description}
                </p>
                {entry.customer_name ? (
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        {entry.customer_name}
                    </p>
                ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                        Kategorie
                    </p>
                    <p className="text-sm font-extrabold text-slate-950">
                        {getCashbookCategoryLabel(entry.category)}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                        Zahlungsart
                    </p>
                    <StatusBadge tone="neutral">
                        {getCashbookPaymentMethodLabel(entry.payment_method)}
                    </StatusBadge>
                </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Bezug
                </p>

                <div className="mt-1">
                    <EntryReference entry={entry} />
                </div>
            </div>

            <div
                className="mt-4 grid grid-cols-2 gap-2"
                onClick={(event) => event.stopPropagation()}
            >
                <EntryDocumentButton entry={entry} fullWidth />
                <EntryTargetButton entry={entry} fullWidth />
            </div>
        </div>
    );
}

function EntryReference({ entry }: { entry: CashbookEntryRow }) {
    return (
        <div className="space-y-1">
            {entry.purchase_case_id ? (
                <p className="font-bold text-orange-700">
                    Ankauf {entry.purchase_number ?? entry.purchase_case_id}
                </p>
            ) : null}

            {entry.sale_id ? (
                <p className="font-bold text-cyan-700">
                    Verkauf
                </p>
            ) : null}

            {entry.vehicle_name ? (
                <p className="font-bold text-cyan-700">
                    {entry.vehicle_name}
                </p>
            ) : null}

            {entry.invoice_number ? (
                <p className="text-xs font-semibold text-slate-500">
                    Rechnung {entry.invoice_number}
                </p>
            ) : null}

            {!entry.purchase_case_id &&
            !entry.sale_id &&
            !entry.vehicle_name &&
            !entry.invoice_number ? (
                <span className="font-semibold text-slate-400">—</span>
            ) : null}
        </div>
    );
}

function EntryDocumentButton({
                                 entry,
                                 fullWidth = false,
                             }: {
    entry: CashbookEntryRow;
    fullWidth?: boolean;
}) {
    if (entry.document_id) {
        return (
            <Button
                asChild
                variant="outline"
                size="sm"
                className={
                    fullWidth
                        ? "h-11 w-full rounded-2xl font-bold"
                        : "rounded-xl font-bold"
                }
            >
                <Link href={`/api/documents/${entry.document_id}/file`} target="_blank">
                    <ExternalLink className="mr-1 size-3.5" />
                    Beleg
                </Link>
            </Button>
        );
    }

    if (entry.invoice_id) {
        return (
            <Button
                asChild
                variant="outline"
                size="sm"
                className={
                    fullWidth
                        ? "h-11 w-full rounded-2xl font-bold"
                        : "rounded-xl font-bold"
                }
            >
                <Link href={`/api/invoices/${entry.invoice_id}/pdf`} target="_blank">
                    <Receipt className="mr-1 size-3.5" />
                    Rechnung
                </Link>
            </Button>
        );
    }

    if (entry.purchase_case_id) {
        return (
            <Button
                asChild
                variant="outline"
                size="sm"
                className={
                    fullWidth
                        ? "h-11 w-full rounded-2xl font-bold"
                        : "rounded-xl font-bold"
                }
            >
                <Link href={`/dashboard/ankauf/${entry.purchase_case_id}`}>
                    <ShoppingCart className="mr-1 size-3.5" />
                    Ankauf
                </Link>
            </Button>
        );
    }

    return (
        <Button
            disabled
            variant="outline"
            size="sm"
            className={
                fullWidth
                    ? "h-11 w-full rounded-2xl font-bold"
                    : "rounded-xl font-bold"
            }
        >
            <Receipt className="mr-1 size-3.5" />
            Kein Beleg
        </Button>
    );
}

function EntryTargetButton({
                               entry,
                               fullWidth = false,
                           }: {
    entry: CashbookEntryRow;
    fullWidth?: boolean;
}) {
    const href = getEntryTargetHref(entry);

    return (
        <Button
            asChild={Boolean(href)}
            disabled={!href}
            size="sm"
            className={
                fullWidth
                    ? "h-11 w-full rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    : "rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
            }
        >
            {href ? (
                <Link href={href}>
                    Öffnen
                    <ExternalLink className="ml-1 size-3.5" />
                </Link>
            ) : (
                <span>Öffnen</span>
            )}
        </Button>
    );
}

function getEntryTargetHref(entry: CashbookEntryRow): string | null {
    if (entry.purchase_case_id) {
        return `/dashboard/ankauf/${entry.purchase_case_id}`;
    }

    if (entry.sale_id) {
        return `/dashboard/sales/${entry.sale_id}`;
    }

    if (entry.vehicle_id) {
        return `/dashboard/vehicles/${entry.vehicle_id}`;
    }

    if (entry.customer_id) {
        return `/dashboard/customers/${entry.customer_id}`;
    }

    return null;
}

type CashbookStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Wallet;
    tone: "success" | "warning" | "danger";
};

function CashbookStatCard({
                              label,
                              value,
                              description,
                              icon: Icon,
                              tone,
                          }: CashbookStatCardProps) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={tone}
        />
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="min-w-0 text-xs font-bold text-slate-300">{label}</p>
            <p className="shrink-0 text-sm font-extrabold text-white">{value}</p>
        </div>
    );
}

function PrintSummaryItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="font-bold text-slate-600">{label}</span>
            <span className="font-black text-slate-950">{value}</span>
        </div>
    );
}

function EmptyCashbookState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <BookOpenCheck className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Buchungen gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Passe deine Suche an oder erfasse eine neue Buchung über einen Verkauf oder Ankauf.
            </p>
        </div>
    );
}
