"use client";

import Link from "next/link";
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
    Wallet,
} from "lucide-react";

import type {
    CashRegisterSummary,
    FinancialEntryRow,
} from "@/lib/accounting/financial-queries";
import {
    getAccountingStatusLabel,
    getAccountingStatusTone,
    getFinancialCategoryLabel,
} from "@/lib/accounting/financial-categories";
import { createSemicolonCsv, formatCsvDecimal } from "@/lib/accounting/csv";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FinancialOverviewProps = {
    entries: FinancialEntryRow[];
    cashSummary: CashRegisterSummary;
    activeTab: "cash" | "accounting";
    dateFrom?: string | null;
    dateTo?: string | null;
};

function getPeriodLabel(dateFrom?: string | null, dateTo?: string | null): string {
    if (dateFrom && dateTo) return `${formatDate(dateFrom)} bis ${formatDate(dateTo)}`;
    if (dateFrom) return `ab ${formatDate(dateFrom)}`;
    if (dateTo) return `bis ${formatDate(dateTo)}`;
    return "Alle Buchungen";
}

function getEntryTypeLabel(entryType: string): string {
    const labels: Record<string, string> = {
        sale_payment: "Verkaufszahlung",
        purchase_payment: "Ankaufzahlung",
        manual_income: "Manuelle Einnahme",
        manual_expense: "Manuelle Ausgabe",
        owner_deposit: "Bareinlage",
        owner_withdrawal: "Barentnahme",
    };

    return labels[entryType] ?? entryType;
}

function getPaymentMethodLabel(method: string | null): string {
    if (method === "cash") return "Bar";
    if (method === "bank") return "Bank";
    return "—";
}

function createFinancialCsv(entries: FinancialEntryRow[]): string {
    const rows: (string | number | null | undefined)[][] = [
        [
            "Buchungsdatum",
            "Belegdatum",
            "Referenz",
            "Buchungstext",
            "Betrag",
            "Richtung",
            "Netto",
            "Steuer",
            "Brutto",
            "Steuersatz",
            "Steuerkennzeichen",
            "Sollkonto",
            "Habenkonto",
            "Kategorie",
            "Zahlungsart",
            "Geschäftspartner",
            "Fahrzeug",
            "Rechnung",
            "Ankauf",
            "Verkauf",
            "Quelldatensatz",
        ],
        ...entries.map((entry) => [
            entry.booking_date,
            entry.document_date ?? "",
            entry.entry_reference,
            entry.description,
            formatCsvDecimal(entry.amount),
            entry.direction === "in" ? "Einnahme" : "Ausgabe",
            formatCsvDecimal(entry.net_amount),
            formatCsvDecimal(entry.tax_amount),
            formatCsvDecimal(entry.gross_amount ?? entry.amount),
            entry.tax_rate ?? "",
            entry.tax_code ?? "",
            entry.debit_account ?? "",
            entry.credit_account ?? "",
            getFinancialCategoryLabel(entry.category_code),
            getPaymentMethodLabel(entry.payment_method),
            entry.customer_name ?? "",
            entry.vehicle_label ?? "",
            entry.invoice_number ?? "",
            entry.purchase_number ?? "",
            entry.sale_id ?? "",
            `${entry.source_type}:${entry.source_reference ?? entry.source_id ?? ""}`,
        ]),
    ];

    return createSemicolonCsv(rows);
}

function getExportFilename(activeTab: "cash" | "accounting", dateFrom?: string | null, dateTo?: string | null) {
    const prefix = activeTab === "cash" ? "waw-barseite" : "waw-buchhaltung";
    if (dateFrom || dateTo) return `${prefix}-${dateFrom ?? "start"}-bis-${dateTo ?? "heute"}.csv`;
    return `${prefix}.csv`;
}

export function FinancialOverview({
    entries,
    cashSummary,
    activeTab,
    dateFrom,
    dateTo,
}: FinancialOverviewProps) {
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const periodLabel = getPeriodLabel(dateFrom, dateTo);
    const visibleBaseEntries = useMemo(
        () => activeTab === "cash"
            ? entries.filter((entry) => entry.is_cash_relevant)
            : entries,
        [activeTab, entries],
    );

    const filteredEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return visibleBaseEntries.filter((entry) => {
            if (statusFilter !== "all" && entry.accounting_status !== statusFilter) {
                return false;
            }

            if (!normalizedQuery) return true;

            return [
                entry.entry_reference,
                entry.source_reference,
                entry.description,
                getEntryTypeLabel(entry.entry_type),
                getFinancialCategoryLabel(entry.category_code),
                getPaymentMethodLabel(entry.payment_method),
                entry.customer_name,
                entry.vehicle_label,
                entry.invoice_number,
                entry.purchase_number,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(normalizedQuery);
        });
    }, [query, statusFilter, visibleBaseEntries]);

    const financialSummary = useMemo(() => {
        let income = 0;
        let expenses = 0;
        let unreviewedCount = 0;

        for (const entry of entries) {
            if (
                entry.accounting_status === "UNREVIEWED" ||
                entry.accounting_status === "REVIEW_REQUIRED"
            ) {
                unreviewedCount += 1;
            }
        }

        for (const entry of filteredEntries) {
            if (entry.status !== "active") continue;

            if (entry.direction === "in") {
                income += entry.amount;
            } else {
                expenses += entry.amount;
            }
        }

        return {
            income,
            expenses,
            unreviewedCount,
        };
    }, [entries, filteredEntries]);

    function handlePrint() {
        window.print();
    }

    function handleCsvExport() {
        const csv = createFinancialCsv(filteredEntries);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = getExportFilename(activeTab, dateFrom, dateTo);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    return (
        <div className="cashbook-print-area space-y-6 print:space-y-4">
            <div className="hidden print:block">
                <h1 className="text-2xl font-black text-slate-950">
                    {activeTab === "cash" ? "Barseite" : "Buchhaltung & DATEV"}
                </h1>
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
                    title={activeTab === "cash" ? "Barseite" : "Buchhaltung & DATEV"}
                    description={
                        activeTab === "cash"
                            ? "Nachvollziehbares Kassenjournal ausschließlich für echte Bargeldbewegungen."
                            : "Buchhaltungsvorbereitung und strukturierter CSV-Export. Keine automatische DATEV-Übertragung."
                    }
                    action={
                        <Button
                            asChild
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        >
                            <Link href="/dashboard/cashbook/new">
                                <Plus className="mr-2 size-4" />
                                Finanzvorgang erfassen
                            </Link>
                        </Button>
                    }
                />
            </div>

            <div className="grid gap-3 rounded-[1.75rem] border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-2 print:hidden">
                <TabLink active={activeTab === "cash"} href="/dashboard/cashbook?tab=cash">
                    <Coins className="size-4" />
                    Barseite
                </TabLink>
                <TabLink active={activeTab === "accounting"} href="/dashboard/cashbook?tab=accounting">
                    <BookOpenCheck className="size-4" />
                    Buchhaltung & DATEV
                </TabLink>
            </div>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 print:hidden">
                {activeTab === "cash" ? (
                    <>
                        <FinancialStatCard
                            label="Anfangsbestand"
                            value={formatCurrency(cashSummary.openingBalance)}
                            description="aktive Hauptkasse"
                            icon={Wallet}
                            tone="info"
                        />
                        <FinancialStatCard
                            label="Bareinnahmen"
                            value={formatCurrency(cashSummary.income)}
                            description={periodLabel}
                            icon={Coins}
                            tone="success"
                        />
                        <FinancialStatCard
                            label="Barausgaben"
                            value={formatCurrency(cashSummary.expenses)}
                            description={periodLabel}
                            icon={Banknote}
                            tone="danger"
                        />
                        <FinancialStatCard
                            label="Endbestand"
                            value={formatCurrency(cashSummary.endingBalance)}
                            description={`${cashSummary.movementCount} Bewegungen`}
                            icon={BookOpenCheck}
                            tone={cashSummary.endingBalance >= 0 ? "success" : "danger"}
                        />
                    </>
                ) : (
                    <>
                        <FinancialStatCard
                            label="Einnahmen"
                            value={formatCurrency(financialSummary.income)}
                            description="Zahlungs- und Einnahmeströme"
                            icon={Coins}
                            tone="success"
                        />
                        <FinancialStatCard
                            label="Ausgaben"
                            value={formatCurrency(financialSummary.expenses)}
                            description="Zahlungs- und Ausgabeströme"
                            icon={Banknote}
                            tone="danger"
                        />
                        <FinancialStatCard
                            label="Zu prüfen"
                            value={financialSummary.unreviewedCount}
                            description="Kontierung offen"
                            icon={BookOpenCheck}
                            tone={financialSummary.unreviewedCount > 0 ? "warning" : "success"}
                        />
                        <FinancialStatCard
                            label="Einträge"
                            value={entries.length}
                            description="Buchhaltungsvorgänge"
                            icon={Wallet}
                            tone="info"
                        />
                    </>
                )}
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm print:rounded-none print:border-0 print:shadow-none">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5 print:hidden">
                        <form
                            action="/dashboard/cashbook"
                            className="mb-5 grid gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end"
                        >
                            <input type="hidden" name="tab" value={activeTab} />
                            <DateInput id="cashbook-date-from" name="from" label="Von" defaultValue={dateFrom ?? ""} />
                            <DateInput id="cashbook-date-to" name="to" label="Bis" defaultValue={dateTo ?? ""} />
                            <Button type="submit" className="h-11 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                                Anwenden
                            </Button>
                            <Button asChild type="button" variant="outline" className="h-11 rounded-2xl font-bold">
                                <Link href={`/dashboard/cashbook?tab=${activeTab}`}>Zurücksetzen</Link>
                            </Button>
                        </form>

                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    {activeTab === "cash" ? "Kassenjournal" : "Buchungsjournal"}
                                </h2>
                                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                                    {activeTab === "cash"
                                        ? "Bankzahlungen, Forderungen und Pro-forma-Rechnungen sind hier bewusst ausgeblendet."
                                        : "Rechnungen und Zahlungen bleiben getrennte Vorgänge, damit Umsätze nicht doppelt gezählt werden."}
                                </p>
                            </div>

                            <div className="grid gap-3 md:grid-cols-[12rem_minmax(14rem,1fr)_auto_auto]">
                                <div className="space-y-1.5">
                                    <label htmlFor="accounting-status-filter" className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                                        Status
                                    </label>
                                    <select
                                        id="accounting-status-filter"
                                        value={statusFilter}
                                        onChange={(event) => setStatusFilter(event.target.value)}
                                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-extrabold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                                    >
                                        <option value="all">Alle</option>
                                        <option value="UNREVIEWED">Nicht geprüft</option>
                                        <option value="REVIEW_REQUIRED">Zu prüfen</option>
                                        <option value="COMPLETE">Vollständig</option>
                                        <option value="EXPORTED">Exportiert</option>
                                        <option value="ERROR">Fehlerhaft</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="financial-search" className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                                        Suche
                                    </label>
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            id="financial-search"
                                            value={query}
                                            onChange={(event) => setQuery(event.target.value)}
                                            placeholder="Referenz, Kunde, Fahrzeug, Beschreibung..."
                                            className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                        />
                                    </div>
                                </div>
                                <Button type="button" variant="outline" onClick={handlePrint} className="h-11 rounded-2xl px-4 font-bold">
                                    <Printer className="mr-2 size-4" />
                                    Drucken
                                </Button>
                                <Button type="button" onClick={handleCsvExport} className="h-11 rounded-2xl bg-slate-950 px-4 font-bold text-white hover:bg-slate-800">
                                    <Download className="mr-2 size-4" />
                                    {activeTab === "cash" ? "Kassen-CSV" : "Buchhaltungs-CSV"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <FinancialTable entries={filteredEntries} showRunningBalance={activeTab === "cash"} openingBalance={cashSummary.openingBalance} />
                </CardContent>
            </Card>

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
                }
            `}</style>
        </div>
    );
}

function TabLink({
    active,
    href,
    children,
}: {
    active: boolean;
    href: string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className={
                active
                    ? "flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-extrabold text-white"
                    : "flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold text-slate-600 hover:bg-slate-50"
            }
        >
            {children}
        </Link>
    );
}

function DateInput({
    id,
    name,
    label,
    defaultValue,
}: {
    id: string;
    name: string;
    label: string;
    defaultValue: string;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                {label}
            </label>
            <Input
                id={id}
                name={name}
                type="date"
                defaultValue={defaultValue}
                className="h-11 rounded-2xl border-slate-200 bg-white font-semibold"
            />
        </div>
    );
}

function FinancialTable({
    entries,
    showRunningBalance,
    openingBalance,
}: {
    entries: FinancialEntryRow[];
    showRunningBalance: boolean;
    openingBalance: number;
}) {
    const runningBalances = useMemo(() => {
        if (!showRunningBalance) return new Map<string, number>();

        const balances = new Map<string, number>();
        let runningBalance = openingBalance;

        for (const entry of [...entries].reverse()) {
            if (entry.status === "active") {
                runningBalance += entry.direction === "in" ? entry.amount : -entry.amount;
            }
            balances.set(entry.id, runningBalance);
        }

        return balances;
    }, [entries, openingBalance, showRunningBalance]);

    if (entries.length === 0) {
        return (
            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                    <BookOpenCheck className="size-6" />
                </div>
                <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                    Keine Finanzbewegungen gefunden
                </h3>
                <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                    Passe Filter oder Zeitraum an. Verkaufszahlungen werden in der Verkaufsakte erfasst.
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left print:min-w-0 print:text-[8px]">
                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                <tr>
                    <th className="px-5 py-4">Datum</th>
                    <th className="px-5 py-4">Referenz</th>
                    <th className="px-5 py-4">Typ</th>
                    <th className="px-5 py-4">Beschreibung</th>
                    <th className="px-5 py-4">Bezug</th>
                    <th className="px-5 py-4">Kategorie</th>
                    <th className="px-5 py-4">Zahlungsart</th>
                    <th className="px-5 py-4">Kontierung</th>
                    <th className="px-5 py-4 text-right">Einnahme</th>
                    <th className="px-5 py-4 text-right">Ausgabe</th>
                    {showRunningBalance ? <th className="px-5 py-4 text-right">Saldo</th> : null}
                    <th className="px-5 py-4 text-right print:hidden">Aktion</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                    <FinancialRow
                        key={entry.id}
                        entry={entry}
                        runningBalance={runningBalances.get(entry.id) ?? null}
                        showRunningBalance={showRunningBalance}
                    />
                ))}
                </tbody>
            </table>
        </div>
    );
}

function FinancialRow({
    entry,
    runningBalance,
    showRunningBalance,
}: {
    entry: FinancialEntryRow;
    runningBalance: number | null;
    showRunningBalance: boolean;
}) {
    const targetHref = getEntryTargetHref(entry);

    return (
        <tr className={entry.status === "voided" ? "bg-slate-50 opacity-70" : "bg-white"}>
            <td className="px-5 py-5">
                <p className="text-sm font-semibold text-slate-700">{formatDate(entry.booking_date)}</p>
                {entry.document_date ? (
                    <p className="mt-1 text-xs font-semibold text-slate-400">Beleg: {formatDate(entry.document_date)}</p>
                ) : null}
            </td>
            <td className="px-5 py-5">
                <p className="font-mono text-sm font-extrabold text-slate-950">{entry.entry_reference}</p>
                {entry.source_reference ? (
                    <p className="mt-1 text-xs font-semibold text-slate-500">{entry.source_reference}</p>
                ) : null}
            </td>
            <td className="px-5 py-5">
                <StatusBadge tone={entry.direction === "in" ? "success" : "danger"}>
                    {getEntryTypeLabel(entry.entry_type)}
                </StatusBadge>
                {entry.status === "voided" ? (
                    <p className="mt-2 text-xs font-bold text-red-700">Storniert</p>
                ) : null}
            </td>
            <td className="px-5 py-5">
                <p className="max-w-xs font-semibold text-slate-950">{entry.description}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                    {entry.customer_name ?? "Kein Geschäftspartner"}
                </p>
            </td>
            <td className="px-5 py-5">
                <EntryReference entry={entry} />
            </td>
            <td className="px-5 py-5">
                <p className="font-bold text-slate-700">{getFinancialCategoryLabel(entry.category_code)}</p>
            </td>
            <td className="px-5 py-5">
                <StatusBadge tone="neutral">{getPaymentMethodLabel(entry.payment_method)}</StatusBadge>
            </td>
            <td className="px-5 py-5">
                <StatusBadge tone={getAccountingStatusTone(entry.accounting_status)}>
                    {getAccountingStatusLabel(entry.accounting_status)}
                </StatusBadge>
                {(entry.debit_account || entry.credit_account) ? (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        {[entry.debit_account, entry.credit_account].filter(Boolean).join(" / ")}
                    </p>
                ) : null}
            </td>
            <td className="px-5 py-5 text-right">
                {entry.direction === "in" ? (
                    <p className="font-extrabold text-emerald-700">{formatCurrency(entry.amount)}</p>
                ) : (
                    <span className="font-semibold text-slate-300">—</span>
                )}
            </td>
            <td className="px-5 py-5 text-right">
                {entry.direction === "out" ? (
                    <p className="font-extrabold text-red-700">{formatCurrency(entry.amount)}</p>
                ) : (
                    <span className="font-semibold text-slate-300">—</span>
                )}
            </td>
            {showRunningBalance ? (
                <td className="px-5 py-5 text-right">
                    <p className="font-extrabold text-slate-950">
                        {runningBalance === null ? "—" : formatCurrency(runningBalance)}
                    </p>
                </td>
            ) : null}
            <td className="px-5 py-5 text-right print:hidden">
                <div className="flex justify-end gap-2">
                    <DocumentButton entry={entry} />
                    <Button asChild={Boolean(targetHref)} disabled={!targetHref} size="sm" className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                        {targetHref ? (
                            <Link href={targetHref}>
                                Öffnen
                                <ExternalLink className="ml-1 size-3.5" />
                            </Link>
                        ) : (
                            <span>Öffnen</span>
                        )}
                    </Button>
                </div>
            </td>
        </tr>
    );
}

function EntryReference({ entry }: { entry: FinancialEntryRow }) {
    return (
        <div className="space-y-1">
            {entry.purchase_id ? (
                <p className="font-bold text-orange-700">
                    Ankauf {entry.purchase_number ?? entry.purchase_id}
                </p>
            ) : null}
            {entry.sale_id ? <p className="font-bold text-cyan-700">Verkauf</p> : null}
            {entry.vehicle_label ? <p className="font-bold text-cyan-700">{entry.vehicle_label}</p> : null}
            {entry.invoice_number ? (
                <p className="text-xs font-semibold text-slate-500">Rechnung {entry.invoice_number}</p>
            ) : null}
            {!entry.purchase_id && !entry.sale_id && !entry.vehicle_label && !entry.invoice_number ? (
                <span className="font-semibold text-slate-400">—</span>
            ) : null}
        </div>
    );
}

function DocumentButton({ entry }: { entry: FinancialEntryRow }) {
    if (entry.document_id) {
        return (
            <Button asChild variant="outline" size="sm" className="rounded-xl font-bold">
                <Link href={`/api/documents/${entry.document_id}/file`} target="_blank">
                    <ExternalLink className="mr-1 size-3.5" />
                    Beleg
                </Link>
            </Button>
        );
    }

    if (entry.invoice_id) {
        return (
            <Button asChild variant="outline" size="sm" className="rounded-xl font-bold">
                <Link href={`/api/invoices/${entry.invoice_id}/pdf`} target="_blank">
                    <Receipt className="mr-1 size-3.5" />
                    Rechnung
                </Link>
            </Button>
        );
    }

    return (
        <Button disabled variant="outline" size="sm" className="rounded-xl font-bold">
            <Receipt className="mr-1 size-3.5" />
            Kein Beleg
        </Button>
    );
}

function getEntryTargetHref(entry: FinancialEntryRow): string | null {
    if (entry.purchase_id) return `/dashboard/ankauf/${entry.purchase_id}`;
    if (entry.sale_id) return `/dashboard/sales/${entry.sale_id}`;
    if (entry.vehicle_id) return `/dashboard/vehicles/${entry.vehicle_id}`;
    if (entry.customer_id) return `/dashboard/customers/${entry.customer_id}`;
    return null;
}

type FinancialStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Wallet;
    tone: "success" | "warning" | "danger" | "info";
};

function FinancialStatCard({ label, value, description, icon, tone }: FinancialStatCardProps) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={icon}
            tone={tone}
        />
    );
}
