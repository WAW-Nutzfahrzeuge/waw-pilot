"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
    ArrowUpRight,
    CheckCircle2,
    FileWarning,
    Plus,
    Receipt,
    Search,
    Send,
    Wallet,
} from "lucide-react";

import type { SaleRow } from "@/lib/sales/sale-queries";
import {
    getDatevStatusLabel,
    getDatevStatusTone,
    getDocumentCheckLabel,
    getDocumentCheckTone,
    getPaymentStatusLabel,
    getPaymentStatusTone,
    getSaleProfitNet,
    getSaleStatusLabel,
    getSaleStatusTone,
    getSaleTypeLabel,
    getSaleTypeTone,
} from "@/lib/sales/sale-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MonthFilter } from "@/components/filters/month-filter";
import { StatusFilter } from "@/components/filters/status-filter";
import { matchesMonthFilter, normalizeMonthFilter } from "@/utils/month-filter";

type SalesOverviewProps = {
    sales: SaleRow[];
    initialPaymentStatus?: string | null;
    initialMonthFilter?: string | null;
};

type PaymentFilter = "all" | "open" | "paid" | "overpaid" | "proforma";

function getInitialPaymentFilter(paymentStatus: string | null | undefined): PaymentFilter {
    if (paymentStatus === "open" || paymentStatus === "unpaid") return "open";
    if (paymentStatus === "paid") return "paid";
    if (paymentStatus === "overpaid") return "overpaid";
    if (paymentStatus === "proforma") return "proforma";

    return "all";
}

export function SalesOverview({
                                  sales,
                                  initialPaymentStatus = null,
                                  initialMonthFilter = null,
}: SalesOverviewProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(() =>
        getInitialPaymentFilter(initialPaymentStatus),
    );
    const [monthFilter, setMonthFilter] = useState(() =>
        normalizeMonthFilter(initialMonthFilter),
    );
    const saleSearchIndex = useMemo(() => {
        const index = new Map<string, string>();

        for (const sale of sales) {
            index.set(
                sale.id,
                [
                    sale.invoice_number,
                    sale.vehicle_name,
                    sale.vin,
                    sale.customer_name,
                    sale.customer_country,
                    getSaleTypeLabel(sale.sale_type),
                    ...sale.missing_required_document_labels,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase(),
            );
        }

        return index;
    }, [sales]);

    const monthSalesData = useMemo(() => {
        const monthFilteredSales: SaleRow[] = [];
        const summary = {
            incompleteDocuments: 0,
            notSentToDatev: 0,
            openPayments: 0,
            totalProfitNet: 0,
            totalRevenueNet: 0,
            totalSales: 0,
        };

        for (const sale of sales) {
            if (!matchesMonthFilter(sale.sale_date, monthFilter)) continue;

            monthFilteredSales.push(sale);

            if (
                sale.payment_status === "open" ||
                sale.payment_status === "partial"
            ) {
                summary.openPayments += 1;
            }

            if (sale.missing_required_documents_count > 0) {
                summary.incompleteDocuments += 1;
            }

            if (sale.datev_status === "not_sent") {
                summary.notSentToDatev += 1;
            }

            summary.totalRevenueNet += sale.net_amount;
            summary.totalProfitNet += getSaleProfitNet(sale);
            summary.totalSales += 1;
        }

        return {
            sales: monthFilteredSales,
            summary,
        };
    }, [monthFilter, sales]);

    const filteredSales = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return monthSalesData.sales.filter((sale) => {
            const matchesPaymentFilter =
                paymentFilter === "all" ||
                (paymentFilter === "open" &&
                    (sale.payment_status === "open" ||
                        sale.payment_status === "partial")) ||
                (paymentFilter === "paid" && sale.payment_status === "paid") ||
                (paymentFilter === "overpaid" &&
                    sale.payment_status === "overpaid") ||
                (paymentFilter === "proforma" && sale.has_proforma_invoice);

            if (!matchesPaymentFilter) return false;

            if (!normalizedQuery) return true;

            return saleSearchIndex.get(sale.id)?.includes(normalizedQuery) ?? false;
        });
    }, [query, monthSalesData.sales, paymentFilter, saleSearchIndex]);

    const salesSummary = monthSalesData.summary;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Verkaufsverwaltung"
                title="Verkäufe"
                description="Verkäufe, Rechnungsnummern, Zahlungsstatus, Pflichtdokumente und DATEV-Hinweise zentral prüfen."
                action={
                    <Button
                        asChild
                        className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <Link href="/dashboard/sales/new">
                            <Plus className="mr-2 size-4" />
                            Verkauf anlegen
                        </Link>
                    </Button>
                }
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SaleStatCard
                    label="Verkäufe gesamt"
                    value={salesSummary.totalSales}
                    description={formatCurrency(salesSummary.totalRevenueNet)}
                    icon={Receipt}
                />
                <SaleStatCard
                    label="Rohgewinn netto"
                    value={formatCurrency(salesSummary.totalProfitNet)}
                    description="nach Einkauf & Nebenkosten"
                    icon={CheckCircle2}
                />
                <SaleStatCard
                    label="Offene Zahlungen"
                    value={salesSummary.openPayments}
                    description="Kassenbuch prüfen"
                    icon={Wallet}
                    href="/dashboard/sales?paymentStatus=open"
                    danger={salesSummary.openPayments > 0}
                />
                <SaleStatCard
                    label="Akte prüfen"
                    value={salesSummary.incompleteDocuments}
                    description={`${salesSummary.notSentToDatev} DATEV offen`}
                    icon={Send}
                    danger={
                        salesSummary.incompleteDocuments > 0 ||
                        salesSummary.notSentToDatev > 0
                    }
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Verkaufsübersicht
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Verkäufe aus Supabase mit automatischer Pflichtdokument-Prüfung.
                                </p>
                            </div>

                            <div className="flex w-full flex-col gap-3 xl:max-w-2xl xl:flex-row xl:items-end">
                                <MonthFilter
                                    value={monthFilter}
                                    onChange={(value) => setMonthFilter(normalizeMonthFilter(value))}
                                    updateUrl
                                />
                                <div className="relative w-full">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Verkauf suchen..."
                                        className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <StatusFilter
                                activeValue={paymentFilter}
                                onChange={(value) => setPaymentFilter(value as PaymentFilter)}
                                options={[
                                    { value: "all", label: "Alle" },
                                    { value: "open", label: "Offene Zahlungen" },
                                    { value: "paid", label: "Bezahlt" },
                                    { value: "overpaid", label: "Überzahlt" },
                                    { value: "proforma", label: "Proforma" },
                                ]}
                            />
                        </div>
                    </div>

                    <div>
                        <div className="grid gap-4 p-4 md:hidden">
                            {filteredSales.map((sale) => {
                                const profit = getSaleProfitNet(sale);

                                return (
                                    <div
                                        key={sale.id}
                                        onClick={() => {
                                            router.push(`/dashboard/sales/${sale.id}`);
                                        }}
                                        className="cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.99]"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <button className="text-lg font-extrabold text-cyan-700 hover:underline">
                                                    {sale.invoice_number ?? "Noch keine Rechnung"}
                                                </button>
                                                <p className="mt-1 text-sm font-bold text-slate-950">
                                                    {sale.customer_name}
                                                </p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                                    {formatDate(sale.sale_date)} · {sale.customer_country}
                                                </p>
                                            </div>

                                            <StatusBadge tone={getSaleStatusTone(sale.status)}>
                                                {getSaleStatusLabel(sale.status)}
                                            </StatusBadge>
                                        </div>

                                        <div className="mt-3">
                                            <StatusBadge tone={getSaleTypeTone(sale.sale_type)}>
                                                {getSaleTypeLabel(sale.sale_type)}
                                            </StatusBadge>
                                        </div>

                                        <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                                Fahrzeug
                                            </p>
                                            <button className="mt-1 text-left text-sm font-extrabold text-slate-950 hover:text-cyan-700 hover:underline">
                                                {sale.vehicle_name}
                                            </button>
                                            <p className="mt-1 break-all font-mono text-xs font-bold text-slate-500">
                                                {sale.vin}
                                            </p>
                                        </div>

                                        <div className="mt-4 grid grid-cols-3 gap-3">
                                            <SaleMobileInfoBox
                                                label="Netto"
                                                value={formatCurrency(sale.net_amount)}
                                            />
                                            <SaleMobileInfoBox
                                                label="Brutto"
                                                value={formatCurrency(sale.gross_amount)}
                                            />
                                            <SaleMobileInfoBox
                                                label="Gewinn"
                                                value={formatCurrency(profit)}
                                                valueClassName={
                                                    profit > 0 ? "text-emerald-700" : "text-red-700"
                                                }
                                            />
                                        </div>

                                        <div className="mt-4 grid grid-cols-3 gap-2">
                                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                                    Zahlung
                                                </p>
                                                <StatusBadge tone={getPaymentStatusTone(sale.payment_status)}>
                                                    {getPaymentStatusLabel(sale.payment_status)}
                                                </StatusBadge>
                                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                                    Bezahlt {formatCurrency(sale.paid_amount)} · Rest{" "}
                                                    {formatCurrency(Math.max(sale.remaining_amount, 0))}
                                                </p>
                                            </div>

                                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                                    Doku
                                                </p>
                                                <StatusBadge
                                                    tone={getDocumentCheckTone(sale.document_check_status)}
                                                >
                                                    {getDocumentCheckLabel(sale.document_check_status)}
                                                </StatusBadge>
                                            </div>

                                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                                    DATEV
                                                </p>
                                                <StatusBadge tone={getDatevStatusTone(sale.datev_status)}>
                                                    {getDatevStatusLabel(sale.datev_status)}
                                                </StatusBadge>
                                            </div>
                                        </div>

                                        <RequiredDocumentsBox sale={sale} />

                                        <div
                                            className="mt-4"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <Button
                                                asChild
                                                className="h-11 w-full rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                            >
                                                <Link href={`/dashboard/sales/${sale.id}`}>Verkaufsakte öffnen</Link>
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}

                            {filteredSales.length === 0 ? <EmptySalesState /> : null}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1220px] text-left">
                                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">Rechnung</th>
                                    <th className="px-5 py-4">Kunde</th>
                                    <th className="px-5 py-4">Fahrzeug</th>
                                    <th className="px-5 py-4">Typ</th>
                                    <th className="px-5 py-4">Datum</th>
                                    <th className="px-5 py-4">Netto</th>
                                    <th className="px-5 py-4">Brutto</th>
                                    <th className="px-5 py-4">Gewinn</th>
                                    <th className="px-5 py-4">Zahlung</th>
                                    <th className="px-5 py-4">Pflichtdokumente</th>
                                    <th className="px-5 py-4">DATEV</th>
                                    <th className="px-5 py-4 text-right">Aktionen</th>
                                </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                {filteredSales.map((sale) => {
                                    const profit = getSaleProfitNet(sale);

                                    return (
                                        <tr
                                            key={sale.id}
                                            onClick={() => {
                                                router.push(`/dashboard/sales/${sale.id}`);
                                            }}
                                            className="group cursor-pointer bg-white transition-colors hover:bg-cyan-50/30"
                                        >
                                            <td className="px-5 py-5">
                                                <button className="font-extrabold text-cyan-700 hover:underline">
                                                    {sale.invoice_number ?? "—"}
                                                </button>
                                                <div className="mt-2">
                                                    <StatusBadge tone={getSaleStatusTone(sale.status)}>
                                                        {getSaleStatusLabel(sale.status)}
                                                    </StatusBadge>
                                                </div>
                                            </td>

                                            <td className="px-5 py-5">
                                                <button className="font-bold text-slate-950 hover:text-cyan-700 hover:underline">
                                                    {sale.customer_name}
                                                </button>
                                                <p className="mt-1 text-xs font-medium text-slate-500">
                                                    Land: {sale.customer_country}
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <button className="font-bold text-slate-950 hover:text-cyan-700 hover:underline">
                                                    {sale.vehicle_name}
                                                </button>
                                                <p className="mt-1 font-mono text-xs font-semibold text-slate-500">
                                                    {sale.vin}
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <StatusBadge tone={getSaleTypeTone(sale.sale_type)}>
                                                    {getSaleTypeLabel(sale.sale_type)}
                                                </StatusBadge>
                                            </td>

                                            <td className="px-5 py-5">
                                                <p className="text-sm font-semibold text-slate-700">
                                                    {formatDate(sale.sale_date)}
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <p className="font-extrabold text-slate-950">
                                                    {formatCurrency(sale.net_amount)}
                                                </p>
                                                <p className="mt-1 text-xs font-medium text-slate-500">
                                                    MwSt. {sale.vat_rate}%
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <p className="font-extrabold text-slate-950">
                                                    {formatCurrency(sale.gross_amount)}
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <p
                                                    className={
                                                        profit > 0
                                                            ? "font-extrabold text-emerald-700"
                                                            : "font-extrabold text-red-700"
                                                    }
                                                >
                                                    {formatCurrency(profit)}
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <StatusBadge tone={getPaymentStatusTone(sale.payment_status)}>
                                                    {getPaymentStatusLabel(sale.payment_status)}
                                                </StatusBadge>
                                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                                    {formatCurrency(sale.paid_amount)} bezahlt
                                                </p>
                                            </td>

                                            <td className="px-5 py-5">
                                                <RequiredDocumentsCell sale={sale} />
                                            </td>

                                            <td className="px-5 py-5">
                                                <StatusBadge tone={getDatevStatusTone(sale.datev_status)}>
                                                    {getDatevStatusLabel(sale.datev_status)}
                                                </StatusBadge>
                                            </td>

                                            <td
                                                className="px-5 py-5"
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                <div className="flex justify-end">
                                                    <Button
                                                        asChild
                                                        size="sm"
                                                        className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                                    >
                                                        <Link href={`/dashboard/sales/${sale.id}`}>
                                                            Öffnen
                                                            <ArrowUpRight className="ml-1 size-3.5" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>

                            {filteredSales.length === 0 ? <EmptySalesState /> : null}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

type SaleStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Receipt;
    href?: string;
    danger?: boolean;
};

function SaleStatCard({
                          label,
                          value,
                          description,
                          icon: Icon,
                          href,
                          danger = false,
                      }: SaleStatCardProps) {
    const card = (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={danger ? "warning" : "info"}
        />
    );

    if (!href) return card;

    return <Link href={href}>{card}</Link>;
}

function RequiredDocumentsCell({ sale }: { sale: SaleRow }) {
    const isComplete = sale.missing_required_documents_count === 0;

    return (
        <div className="min-w-[145px]">
            <StatusBadge tone={isComplete ? "success" : "danger"}>
                {`${sale.available_required_documents_count} von ${sale.required_documents_count} vorhanden`}
            </StatusBadge>
        </div>
    );
}

function RequiredDocumentsBox({ sale }: { sale: SaleRow }) {
    const isComplete = sale.missing_required_documents_count === 0;

    return (
        <div
            className={
                isComplete
                    ? "mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3"
                    : "mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3"
            }
        >
            <div className="flex items-start gap-2">
                {isComplete ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                ) : (
                    <FileWarning className="mt-0.5 size-4 shrink-0 text-amber-700" />
                )}

                <div>
                    <p
                        className={
                            isComplete
                                ? "text-sm font-extrabold text-emerald-900"
                                : "text-sm font-extrabold text-amber-900"
                        }
                    >
                        {sale.available_required_documents_count} von{" "}
                        {sale.required_documents_count} Pflichtdokumenten vorhanden
                    </p>

                    {isComplete ? (
                        <p className="mt-1 text-xs font-semibold text-emerald-800">
                            Verkaufsakte vollständig.
                        </p>
                    ) : (
                        <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                            Fehlt: {sale.missing_required_document_labels.join(", ")}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function SaleMobileInfoBox({
                               label,
                               value,
                               valueClassName,
                           }: {
    label: string;
    value: string;
    valueClassName?: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p
                className={`mt-1 text-sm font-extrabold text-slate-950 ${
                    valueClassName ?? ""
                }`}
            >
                {value}
            </p>
        </div>
    );
}

function EmptySalesState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <Receipt className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Verkäufe gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Passe deine Suche an oder lege einen neuen Verkauf an.
            </p>
        </div>
    );
}
