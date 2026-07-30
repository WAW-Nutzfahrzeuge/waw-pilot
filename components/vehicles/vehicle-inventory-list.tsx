"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
    ArrowLeft,
    CalendarDays,
    ClipboardList,
    Printer,
    Search,
    TrendingUp,
} from "lucide-react";

import type { InventoryListRow } from "@/lib/vehicles/inventory-list-queries";
import { PageHeader } from "@/components/shared/page-header";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type VehicleInventoryListProps = {
    rows: InventoryListRow[];
};

type InventoryListDisplayRow = InventoryListRow & {
    searchableText: string;
    purchaseDateLabel: string;
    saleDateLabel: string;
    purchaseNetAmountLabel: string;
    saleNetAmountLabel: string;
    rawProfitNetLabel: string;
    statusLabel: string;
    statusClassName: string;
};

function formatDate(value: string | null): string {
    if (!value) return "—";

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(value));
}

function formatMoney(value: number | null): string {
    if (value === null) return "—";

    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
    }).format(value);
}

function getStatusLabel(status: InventoryListRow["status"]): string {
    if (status === "in_stock") return "Bestand";
    if (status === "reserved") return "Reserviert";
    if (status === "sold") return "Verkauft";

    return status;
}

function getStatusClassName(status: InventoryListRow["status"]): string {
    if (status === "sold") {
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    }

    if (status === "reserved") {
        return "bg-amber-50 text-amber-700 ring-amber-200";
    }

    return "bg-cyan-50 text-cyan-700 ring-cyan-200";
}

function getSearchableText(row: InventoryListRow): string {
    return [
        row.stockNumber,
        row.vehicleLabel,
        row.vin,
        row.vinLastSix,
        row.licensePlate,
        row.stockStartDate,
        formatDate(row.stockStartDate),
        row.stockEndDate,
        formatDate(row.stockEndDate),
        row.purchaseNumber,
        row.purchaseDate,
        formatDate(row.purchaseDate),
        row.sellerName,
        formatMoney(row.purchaseNetAmount),
        formatMoney(row.additionalCostsNet),
        row.saleNumber,
        row.saleDate,
        formatDate(row.saleDate),
        row.buyerName,
        formatMoney(row.saleNetAmount),
        row.invoiceNumber,
        formatMoney(row.rawProfitNet),
        getStatusLabel(row.status),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function wasInStockDuringPeriod({
                                    row,
                                    fromDate,
                                    toDate,
                                }: {
    row: InventoryListRow;
    fromDate: string;
    toDate: string;
}): boolean {
    if (!fromDate && !toDate) return true;

    const stockStartDate = row.stockStartDate ?? row.purchaseDate;
    const stockEndDate = row.stockEndDate ?? row.saleDate;

    if (!stockStartDate) return true;

    const filterFromDate = fromDate || "0001-01-01";
    const filterToDate = toDate || "9999-12-31";

    return (
        stockStartDate <= filterToDate &&
        (!stockEndDate || stockEndDate >= filterFromDate)
    );
}

function getFilterDescription({
                                  query,
                                  fromDate,
                                  toDate,
                                  totalCount,
                                  filteredCount,
                              }: {
    query: string;
    fromDate: string;
    toDate: string;
    totalCount: number;
    filteredCount: number;
}): string {
    const hasDateFilter = Boolean(fromDate || toDate);
    const hasSearchFilter = query.trim().length > 0;

    if (!hasDateFilter && !hasSearchFilter) {
        return "Alle Fahrzeuge";
    }

    const parts: string[] = [];

    if (fromDate && toDate && fromDate === toDate) {
        parts.push(`Inventur-Stichtag ${formatDate(fromDate)}`);
    } else if (fromDate && toDate) {
        parts.push(`Zeitraum ${formatDate(fromDate)} bis ${formatDate(toDate)}`);
    } else if (fromDate) {
        parts.push(`Bestand ab ${formatDate(fromDate)}`);
    } else if (toDate) {
        parts.push(`Bestand bis ${formatDate(toDate)}`);
    }

    if (hasSearchFilter) {
        parts.push(`Suche: "${query.trim()}"`);
    }

    parts.push(`${filteredCount} von ${totalCount} Fahrzeugen`);

    return parts.join(" · ");
}

export function VehicleInventoryList({ rows }: VehicleInventoryListProps) {
    const [query, setQuery] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const displayRows = useMemo<InventoryListDisplayRow[]>(() => {
        return rows.map((row) => ({
            ...row,
            searchableText: getSearchableText(row),
            purchaseDateLabel: formatDate(row.purchaseDate),
            saleDateLabel: formatDate(row.saleDate),
            purchaseNetAmountLabel: formatMoney(row.purchaseNetAmount),
            saleNetAmountLabel: formatMoney(row.saleNetAmount),
            rawProfitNetLabel: formatMoney(row.rawProfitNet),
            statusLabel: getStatusLabel(row.status),
            statusClassName: getStatusClassName(row.status),
        }));
    }, [rows]);

    const filteredRows = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return displayRows.filter((row) => {
            const matchesSearch =
                !normalizedQuery ||
                row.searchableText.includes(normalizedQuery);

            if (!matchesSearch) return false;

            return wasInStockDuringPeriod({
                row,
                fromDate,
                toDate,
            });
        });
    }, [displayRows, fromDate, query, toDate]);

    const inventorySummary = useMemo(() => {
        let totalPurchaseNet = 0;
        let totalSaleNet = 0;
        let totalRawProfitNet = 0;

        for (const row of filteredRows) {
            totalPurchaseNet += row.purchaseNetAmount;
            totalSaleNet += row.saleNetAmount ?? 0;
            totalRawProfitNet += row.rawProfitNet ?? 0;
        }

        return {
            totalPurchaseNet,
            totalSaleNet,
            totalRawProfitNet,
        };
    }, [filteredRows]);

    const filterDescription = useMemo(
        () => getFilterDescription({
            query,
            fromDate,
            toDate,
            totalCount: rows.length,
            filteredCount: filteredRows.length,
        }),
        [filteredRows.length, fromDate, query, rows.length, toDate],
    );

    return (
        <div className="space-y-6 print:space-y-4">
            <div className="print:hidden">
                <PageHeader
                    eyebrow="Fahrzeugbestand"
                    title="Bestandsliste"
                    description="Kaufmännische Übersicht mit Bestandsnummer, Einkauf, Verkauf, Rechnungsnummer, Rohgewinn und Inventur-Zeitraumfilter."
                    action={
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                asChild
                                variant="outline"
                                className="rounded-2xl border-slate-200 bg-white font-bold"
                            >
                                <Link href="/dashboard/vehicles">
                                    <ArrowLeft className="mr-2 size-4" />
                                    Zurück
                                </Link>
                            </Button>

                            <Button
                                type="button"
                                onClick={() => window.print()}
                                className="rounded-2xl bg-slate-950 font-extrabold text-white hover:bg-slate-800"
                            >
                                <Printer className="mr-2 size-4" />
                                Bestandsliste drucken
                            </Button>
                        </div>
                    }
                />
            </div>

            <div className="hidden print:block">
                <div className="mb-4 border-b border-slate-300 pb-3">
                    <h1 className="text-xl font-black text-slate-950">
                        Bestandsliste
                    </h1>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                        {filterDescription}
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4 print:hidden">
                <SummaryCard
                    title="Fahrzeuge"
                    value={filteredRows.length.toString()}
                    description={filterDescription}
                    icon={ClipboardList}
                />
                <SummaryCard
                    title="Einkauf netto"
                    value={formatMoney(inventorySummary.totalPurchaseNet)}
                    description="Summe Einkauf"
                    icon={TrendingUp}
                />
                <SummaryCard
                    title="Verkauf netto"
                    value={formatMoney(inventorySummary.totalSaleNet)}
                    description="Summe Verkauf"
                    icon={TrendingUp}
                />
                <SummaryCard
                    title="Rohgewinn netto"
                    value={formatMoney(inventorySummary.totalRawProfitNet)}
                    description="Summe Rohgewinn"
                    icon={TrendingUp}
                />
            </div>

            <Card className="rounded-[1.75rem] border-slate-200 bg-white/95 shadow-sm print:rounded-none print:border-0 print:shadow-none">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 p-5 print:hidden">
                        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr_auto] xl:items-end">
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                                    Suche
                                </label>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Suche nach Bestandsnummer, FIN, Verkäufer, Käufer, VK-Nr., Rechnung, Betrag..."
                                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-semibold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="inventory-from-date"
                                    className="text-xs font-black uppercase tracking-wide text-slate-500"
                                >
                                    Bestand von
                                </label>
                                <div className="relative">
                                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        id="inventory-from-date"
                                        type="date"
                                        value={fromDate}
                                        onChange={(event) => setFromDate(event.target.value)}
                                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-semibold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="inventory-to-date"
                                    className="text-xs font-black uppercase tracking-wide text-slate-500"
                                >
                                    Bestand bis
                                </label>
                                <div className="relative">
                                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        id="inventory-to-date"
                                        type="date"
                                        value={toDate}
                                        onChange={(event) => setToDate(event.target.value)}
                                        className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-semibold"
                                    />
                                </div>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setQuery("");
                                    setFromDate("");
                                    setToDate("");
                                }}
                                className="h-12 rounded-2xl border-slate-200 bg-white font-extrabold"
                            >
                                Filter zurücksetzen
                            </Button>
                        </div>

                        <p className="mt-3 text-xs font-semibold text-slate-500">
                            Zeitraumfilter für Inventur: Ein Fahrzeug wird angezeigt,
                            wenn es im gewählten Zeitraum im Bestand war. Für einen
                            Stichtag bei „Bestand von“ und „Bestand bis“ dasselbe Datum
                            eintragen.
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1450px] border-collapse text-left text-sm print:min-w-0 print:text-[8px]">
                            <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 print:bg-white print:text-[7px]">
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Bestand
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Fahrzeug
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Fahrgestellnummer
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Einkauf
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Verkäufer
                                </th>
                                <th className="px-4 py-3 text-right font-black print:px-1 print:py-1">
                                    EK netto
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    VK-Nr.
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Verkauf
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Rechnung
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Käufer
                                </th>
                                <th className="px-4 py-3 text-right font-black print:px-1 print:py-1">
                                    VK netto
                                </th>
                                <th className="px-4 py-3 text-right font-black print:px-1 print:py-1">
                                    Rohgewinn
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Status
                                </th>
                            </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                            {filteredRows.length > 0 ? (
                                filteredRows.map((row) => (
                                    <tr
                                        key={row.vehicleId}
                                        className="align-top transition hover:bg-slate-50 print:hover:bg-white"
                                    >
                                        <td className="px-4 py-3 font-black text-slate-950 print:px-1 print:py-1">
                                            {row.stockNumber}
                                        </td>

                                        <td className="px-4 py-3 print:px-1 print:py-1">
                                            <div className="font-extrabold text-slate-950">
                                                {row.vehicleLabel}
                                            </div>
                                            <div className="mt-1 text-xs font-medium text-slate-500 print:text-[7px]">
                                                {row.licensePlate ?? "Ohne Kennzeichen"}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600 print:px-1 print:py-1 print:text-[7px]">
                                            {row.vin}
                                            {row.vinLastSix ? (
                                                <div className="mt-1 text-[10px] font-black text-slate-400 print:hidden">
                                                    Ende: {row.vinLastSix}
                                                </div>
                                            ) : null}
                                        </td>

                                        <td className="px-4 py-3 print:px-1 print:py-1">
                                            <div className="font-bold text-slate-950">
                                                {row.purchaseDateLabel}
                                            </div>
                                            <div className="mt-1 text-xs font-medium text-slate-500 print:text-[7px]">
                                                {row.purchaseNumber ?? "—"}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 font-semibold text-slate-700 print:px-1 print:py-1">
                                            {row.sellerName ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 text-right font-bold text-slate-950 print:px-1 print:py-1">
                                            {row.purchaseNetAmountLabel}
                                        </td>

                                        <td className="px-4 py-3 font-black text-slate-950 print:px-1 print:py-1">
                                            {row.saleNumber ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 font-bold text-slate-950 print:px-1 print:py-1">
                                            {row.saleDateLabel}
                                        </td>

                                        <td className="px-4 py-3 font-black text-slate-950 print:px-1 print:py-1">
                                            {row.invoiceNumber ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 font-semibold text-slate-700 print:px-1 print:py-1">
                                            {row.buyerName ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 text-right font-bold text-slate-950 print:px-1 print:py-1">
                                            {row.saleNetAmountLabel}
                                        </td>

                                        <td
                                            className={cn(
                                                "px-4 py-3 text-right font-black print:px-1 print:py-1",
                                                row.rawProfitNet === null
                                                    ? "text-slate-400"
                                                    : row.rawProfitNet >= 0
                                                        ? "text-emerald-700"
                                                        : "text-red-700",
                                            )}
                                        >
                                            {row.rawProfitNetLabel}
                                        </td>

                                        <td className="px-4 py-3 print:px-1 print:py-1">
                                                <span
                                                    className={cn(
                                                        "inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1 print:px-1 print:py-0.5 print:text-[7px]",
                                                        row.statusClassName,
                                                    )}
                                                >
                                                    {row.statusLabel}
                                                </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={13}
                                        className="px-4 py-12 text-center text-sm font-bold text-slate-500"
                                    >
                                        Keine passenden Fahrzeuge gefunden.
                                    </td>
                                </tr>
                            )}
                            </tbody>

                            {filteredRows.length > 0 ? (
                                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-950 print:bg-white">
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-3 text-right print:px-1 print:py-1"
                                    >
                                        Summe
                                    </td>
                                    <td className="px-4 py-3 text-right print:px-1 print:py-1">
                                        {formatMoney(inventorySummary.totalPurchaseNet)}
                                    </td>
                                    <td
                                        colSpan={4}
                                        className="px-4 py-3 print:px-1 print:py-1"
                                    />
                                    <td className="px-4 py-3 text-right print:px-1 print:py-1">
                                        {formatMoney(inventorySummary.totalSaleNet)}
                                    </td>
                                    <td className="px-4 py-3 text-right print:px-1 print:py-1">
                                        {formatMoney(inventorySummary.totalRawProfitNet)}
                                    </td>
                                    <td className="px-4 py-3 print:px-1 print:py-1" />
                                </tr>
                                </tfoot>
                            ) : null}
                        </table>
                    </div>
                </CardContent>
            </Card>

            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 8mm;
                    }

                    body {
                        background: white !important;
                    }

                    aside,
                    header,
                    nav {
                        display: none !important;
                    }

                    main {
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }
            `}</style>
        </div>
    );
}

function SummaryCard({
                         title,
                         value,
                         description,
                         icon: Icon,
                     }: {
    title: string;
    value: string;
    description: string;
    icon: typeof ClipboardList;
}) {
    return (
        <CompactStatCard
            label={title}
            value={value}
            description={description}
            icon={Icon}
            tone="info"
        />
    );
}
