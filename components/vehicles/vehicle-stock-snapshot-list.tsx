"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Printer, TrendingUp } from "lucide-react";

import type { InventoryListRow } from "@/lib/vehicles/inventory-list-queries";
import {
    calculateInventorySnapshotTotals,
    isVehicleInStockAtDate,
} from "@/lib/vehicles/inventory-domain";
import { InventoryPrintStyles } from "@/components/vehicles/inventory-print-styles";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTodayDateOnly } from "@/lib/format/date";

type VehicleStockSnapshotListProps = {
    rows: InventoryListRow[];
};

type SnapshotDisplayRow = InventoryListRow & {
    position: number;
    purchaseDateLabel: string;
    purchaseNetAmountLabel: string;
    purchaseVatAmountLabel: string;
    purchaseGrossAmountLabel: string;
};

const snapshotDateFormatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

const snapshotMoneyFormatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
});

function formatDate(value: string | null): string {
    if (!value) return "—";

    return snapshotDateFormatter.format(new Date(value));
}

function formatMoney(value: number): string {
    return snapshotMoneyFormatter.format(value);
}

function getVehicleTypeLabel(row: InventoryListRow): string | null {
    return row.vehicleType && row.vehicleType !== row.vehicleLabel
        ? row.vehicleType
        : null;
}

export function VehicleStockSnapshotList({ rows }: VehicleStockSnapshotListProps) {
    const [asOfDate, setAsOfDate] = useState(() => getTodayDateOnly());

    const snapshotRows = useMemo<SnapshotDisplayRow[]>(() => {
        return rows
            .filter((row) =>
                isVehicleInStockAtDate({
                    purchaseDate: row.purchaseDate,
                    saleDate: row.saleDate,
                    asOfDate,
                }),
            )
            .slice()
            .sort((a, b) => {
                const dateA = a.purchaseDate ?? "";
                const dateB = b.purchaseDate ?? "";

                return dateA.localeCompare(dateB);
            })
            .map((row, index) => ({
                ...row,
                position: index + 1,
                purchaseDateLabel: formatDate(row.purchaseDate),
                purchaseNetAmountLabel: formatMoney(row.purchaseNetAmount),
                purchaseVatAmountLabel: formatMoney(row.purchaseVatAmount),
                purchaseGrossAmountLabel: formatMoney(row.purchaseGrossAmount),
            }));
    }, [asOfDate, rows]);

    const totals = useMemo(
        () => calculateInventorySnapshotTotals(snapshotRows),
        [snapshotRows],
    );

    const asOfDateLabel = formatDate(asOfDate);

    return (
        <div className="space-y-6 print:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div>
                    <h2 className="text-lg font-black text-slate-950">
                        Inventurliste zum {asOfDateLabel}
                    </h2>
                    <p className="text-sm font-medium text-slate-500">
                        Historischer Fahrzeugbestand zu einem frei wählbaren Stichtag,
                        rekonstruiert aus Ankaufs- und Verkaufsdaten.
                    </p>
                </div>

                <Button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-2xl bg-slate-950 font-extrabold text-white hover:bg-slate-800"
                >
                    <Printer className="mr-2 size-4" />
                    Inventurliste drucken
                </Button>
            </div>

            <div className="hidden print:block">
                <div className="inventory-print-header mb-4 border-b border-slate-300 pb-3">
                    <div>
                        <h1 className="text-xl font-black text-slate-950">
                            Inventurliste zum {asOfDateLabel}
                        </h1>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                            WAW Nutzfahrzeuge · {snapshotRows.length} Fahrzeuge im Bestand
                        </p>
                    </div>
                    <Image
                        src="/brand/waw-logo.png"
                        alt="WAW"
                        width={96}
                        height={63}
                        priority
                        className="inventory-print-logo"
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4 print:hidden">
                <CompactStatCard
                    label="Fahrzeuge im Bestand"
                    value={totals.vehicleCount.toString()}
                    description={`Stichtag ${asOfDateLabel}`}
                    icon={ClipboardList}
                    tone="info"
                />
                <CompactStatCard
                    label="Einkaufswert netto"
                    value={formatMoney(totals.totalNetAmount)}
                    description="Summe Einkauf netto"
                    icon={TrendingUp}
                    tone="info"
                />
                <CompactStatCard
                    label="MwSt."
                    value={formatMoney(totals.totalVatAmount)}
                    description="Summe MwSt. auf Einkauf"
                    icon={TrendingUp}
                    tone="info"
                />
                <CompactStatCard
                    label="Einkaufswert brutto"
                    value={formatMoney(totals.totalGrossAmount)}
                    description="Summe Einkauf brutto"
                    icon={TrendingUp}
                    tone="info"
                />
            </div>

            <Card className="rounded-[1.75rem] border-slate-200 bg-white/95 shadow-sm print:rounded-none print:border-0 print:shadow-none">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 p-5 print:hidden">
                        <div className="max-w-xs space-y-2">
                            <label
                                htmlFor="inventory-snapshot-date"
                                className="text-xs font-black uppercase tracking-wide text-slate-500"
                            >
                                Stichtag
                            </label>
                            <div className="relative">
                                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    id="inventory-snapshot-date"
                                    type="date"
                                    value={asOfDate}
                                    onChange={(event) => setAsOfDate(event.target.value)}
                                    className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-semibold"
                                />
                            </div>
                        </div>

                        <p className="mt-3 text-xs font-semibold text-slate-500">
                            Ein Fahrzeug gehört zum Stichtag zum Bestand, wenn es bis
                            spätestens zu diesem Datum angekauft und bis zu diesem Datum
                            noch nicht wirksam verkauft wurde (Verkauf am Stichtag zählt
                            bereits als nicht mehr im Bestand).
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1200px] border-collapse text-left text-sm print:min-w-0 print:text-[8px]">
                            <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 print:bg-white print:text-[7px]">
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Nr.
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Fahrzeug
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Fahrgestellnummer
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Kennzeichen
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Ankaufdatum
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Einkaufsnummer
                                </th>
                                <th className="px-4 py-3 font-black print:px-1 print:py-1">
                                    Verkäufer
                                </th>
                                <th className="px-4 py-3 text-right font-black print:px-1 print:py-1">
                                    EK netto
                                </th>
                                <th className="px-4 py-3 text-right font-black print:px-1 print:py-1">
                                    MwSt.
                                </th>
                                <th className="px-4 py-3 text-right font-black print:px-1 print:py-1">
                                    EK brutto
                                </th>
                            </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                            {snapshotRows.length > 0 ? (
                                snapshotRows.map((row) => (
                                    <tr
                                        key={row.vehicleId}
                                        className="align-top transition hover:bg-slate-50 print:hover:bg-white"
                                    >
                                        <td className="px-4 py-3 font-black text-slate-950 print:px-1 print:py-1">
                                            {row.position}
                                        </td>

                                        <td className="px-4 py-3 print:px-1 print:py-1">
                                            <div className="font-extrabold text-slate-950">
                                                {row.vehicleLabel}
                                            </div>
                                            {getVehicleTypeLabel(row) ? (
                                                <div className="mt-1 text-xs font-medium text-slate-500 print:text-[7px]">
                                                    {getVehicleTypeLabel(row)}
                                                </div>
                                            ) : null}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600 print:px-1 print:py-1 print:text-[7px]">
                                            {row.vin}
                                        </td>

                                        <td className="px-4 py-3 font-semibold text-slate-700 print:px-1 print:py-1">
                                            {row.licensePlate ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 font-bold text-slate-950 print:px-1 print:py-1">
                                            {row.purchaseDateLabel}
                                        </td>

                                        <td className="px-4 py-3 font-bold text-slate-700 print:px-1 print:py-1">
                                            {row.purchaseNumber ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 font-semibold text-slate-700 print:px-1 print:py-1">
                                            {row.sellerName ?? "—"}
                                        </td>

                                        <td className="px-4 py-3 text-right font-bold text-slate-950 print:px-1 print:py-1">
                                            {row.purchaseNetAmountLabel}
                                        </td>

                                        <td className="px-4 py-3 text-right font-semibold text-slate-700 print:px-1 print:py-1">
                                            {row.purchaseVatAmountLabel}
                                        </td>

                                        <td className="px-4 py-3 text-right font-black text-slate-950 print:px-1 print:py-1">
                                            {row.purchaseGrossAmountLabel}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={10}
                                        className="px-4 py-12 text-center text-sm font-bold text-slate-500"
                                    >
                                        Keine Fahrzeuge am {asOfDateLabel} im Bestand.
                                    </td>
                                </tr>
                            )}
                            </tbody>

                            {snapshotRows.length > 0 ? (
                                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-950 print:bg-white">
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-4 py-3 text-right print:px-1 print:py-1"
                                    >
                                        Summe ({totals.vehicleCount} Fahrzeuge)
                                    </td>
                                    <td className="px-4 py-3 text-right print:px-1 print:py-1">
                                        {formatMoney(totals.totalNetAmount)}
                                    </td>
                                    <td className="px-4 py-3 text-right print:px-1 print:py-1">
                                        {formatMoney(totals.totalVatAmount)}
                                    </td>
                                    <td className="px-4 py-3 text-right print:px-1 print:py-1">
                                        {formatMoney(totals.totalGrossAmount)}
                                    </td>
                                </tr>
                                </tfoot>
                            ) : null}
                        </table>
                    </div>
                </CardContent>
            </Card>

            <InventoryPrintStyles />
        </div>
    );
}
