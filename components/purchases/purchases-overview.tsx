"use client";

import Link from "next/link";
import { useState } from "react";
import {
    ArrowUpRight,
    FileWarning,
    Plus,
    Search,
    ShoppingCart,
    Wallet,
} from "lucide-react";

import type { PurchaseCaseRow } from "@/lib/purchases/purchase-queries";
import {
    getPurchaseDocumentStatusLabel,
    getPurchaseDocumentStatusTone,
    getPurchasePaymentStatusLabel,
    getPurchasePaymentStatusTone,
    getPurchaseStatusLabel,
    getPurchaseStatusTone,
} from "@/lib/purchases/purchase-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PurchasesOverviewProps = {
    purchases: PurchaseCaseRow[];
};

type PurchaseFilter = "all" | "open" | "paid" | "documents" | "completed";

export function PurchasesOverview({ purchases }: PurchasesOverviewProps) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<PurchaseFilter>("all");

    const openPayments = purchases.filter(
        (purchase) => purchase.payment_status !== "paid",
    ).length;

    const paidPurchases = purchases.filter(
        (purchase) => purchase.payment_status === "paid",
    ).length;

    const incompleteDocuments = purchases.filter(
        (purchase) => purchase.document_check_status !== "complete",
    ).length;

    const completedPurchases = purchases.filter(
        (purchase) => purchase.status === "completed",
    ).length;

    const totalGross = purchases.reduce(
        (sum, purchase) => sum + purchase.gross_amount,
        0,
    );

    const filteredPurchases = (() => {
        const normalizedQuery = query.trim().toLowerCase();

        return purchases.filter((purchase) => {
            const matchesFilter =
                filter === "all" ||
                (filter === "open" && purchase.payment_status !== "paid") ||
                (filter === "paid" && purchase.payment_status === "paid") ||
                (filter === "documents" &&
                    purchase.document_check_status !== "complete") ||
                (filter === "completed" && purchase.status === "completed");

            if (!matchesFilter) return false;

            if (!normalizedQuery) return true;

            const searchableText = [
                purchase.purchase_number,
                purchase.seller_name,
                purchase.vehicle_name,
                purchase.vin,
                purchase.notes,
                getPurchaseStatusLabel(purchase.status),
                getPurchasePaymentStatusLabel(purchase.payment_status),
                getPurchaseDocumentStatusLabel(purchase.document_check_status),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(normalizedQuery);
        });
    })();

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Fahrzeug ankaufen"
                title="Fahrzeugankäufe"
                description="Erfasse gekaufte Fahrzeuge inklusive Verkäuferdaten, Einkaufspreis, Zahlung und Dokumenten. Das Fahrzeug wird anschließend im Bestand geführt."
                action={
                    <Button
                        asChild
                        className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <Link href="/dashboard/ankauf/new">
                            <Plus className="mr-2 size-4" />
                            Neuen Ankauf erfassen
                        </Link>
                    </Button>
                }
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <PurchaseStatCard
                    label="Fahrzeugankäufe"
                    value={purchases.length}
                    description="gesamt erfasst"
                    icon={ShoppingCart}
                />
                <PurchaseStatCard
                    label="Einkauf brutto"
                    value={formatCurrency(totalGross)}
                    description="Summe aller Ankäufe"
                    icon={Wallet}
                />
                <PurchaseStatCard
                    label="Offene Zahlungen"
                    value={openPayments}
                    description={`${paidPurchases} bezahlt`}
                    icon={Wallet}
                    danger={openPayments > 0}
                />
                <PurchaseStatCard
                    label="Dokumente prüfen"
                    value={incompleteDocuments}
                    description="fehlend oder zu prüfen"
                    icon={FileWarning}
                    danger={incompleteDocuments > 0}
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Fahrzeugankäufe
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Suche nach Verkäufer, Fahrzeug, VIN, Ankaufsnummer oder Status.
                                </p>
                            </div>

                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Ankauf suchen..."
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                />
                            </div>
                        </div>

                        <div className="mt-5 overflow-x-auto">
                            <div className="inline-grid min-w-max grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1">
                                <PurchaseFilterButton
                                    active={filter === "all"}
                                    onClick={() => setFilter("all")}
                                    label="Alle Ankäufe"
                                    count={purchases.length}
                                />
                                <PurchaseFilterButton
                                    active={filter === "open"}
                                    onClick={() => setFilter("open")}
                                    label="Offen"
                                    count={openPayments}
                                />
                                <PurchaseFilterButton
                                    active={filter === "paid"}
                                    onClick={() => setFilter("paid")}
                                    label="Bezahlt"
                                    count={paidPurchases}
                                />
                                <PurchaseFilterButton
                                    active={filter === "documents"}
                                    onClick={() => setFilter("documents")}
                                    label="Dokumente"
                                    count={incompleteDocuments}
                                />
                                <PurchaseFilterButton
                                    active={filter === "completed"}
                                    onClick={() => setFilter("completed")}
                                    label="Abgeschlossen"
                                    count={completedPurchases}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="grid gap-4 p-4 md:hidden">
                            {filteredPurchases.map((purchase) => (
                                <PurchaseMobileCard key={purchase.id} purchase={purchase} />
                            ))}

                            {filteredPurchases.length === 0 ? <EmptyPurchasesState /> : null}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1180px] text-left">
                                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">Ankauf</th>
                                    <th className="px-5 py-4">Verkäufer</th>
                                    <th className="px-5 py-4">Fahrzeug</th>
                                    <th className="px-5 py-4">Datum</th>
                                    <th className="px-5 py-4">Betrag</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4">Zahlung</th>
                                    <th className="px-5 py-4">Dokumente</th>
                                    <th className="px-5 py-4 text-right">Aktionen</th>
                                </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                {filteredPurchases.map((purchase) => (
                                    <tr
                                        key={purchase.id}
                                        onClick={() => {
                                            window.location.href = `/dashboard/ankauf/${purchase.id}`;
                                        }}
                                        className="group cursor-pointer bg-white transition-colors hover:bg-cyan-50/30"
                                    >
                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-cyan-700">
                                                {purchase.purchase_number ?? "Ohne Nummer"}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                {purchase.id}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-bold text-slate-950">
                                                {purchase.seller_name ?? "—"}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-bold text-slate-950">
                                                {purchase.vehicle_name ?? "—"}
                                            </p>
                                            <p className="mt-1 font-mono text-xs font-semibold text-slate-500">
                                                {purchase.vin ?? "—"}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="text-sm font-semibold text-slate-700">
                                                {formatDate(purchase.purchase_date)}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-slate-950">
                                                {formatCurrency(purchase.gross_amount)}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                Netto {formatCurrency(purchase.net_amount)}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <StatusBadge tone={getPurchaseStatusTone(purchase.status)}>
                                                {getPurchaseStatusLabel(purchase.status)}
                                            </StatusBadge>
                                        </td>

                                        <td className="px-5 py-5">
                                            <StatusBadge
                                                tone={getPurchasePaymentStatusTone(
                                                    purchase.payment_status,
                                                )}
                                            >
                                                {getPurchasePaymentStatusLabel(purchase.payment_status)}
                                            </StatusBadge>
                                        </td>

                                        <td className="px-5 py-5">
                                            <StatusBadge
                                                tone={getPurchaseDocumentStatusTone(
                                                    purchase.document_check_status,
                                                )}
                                            >
                                                {getPurchaseDocumentStatusLabel(
                                                    purchase.document_check_status,
                                                )}
                                            </StatusBadge>
                                        </td>

                                        <td
                                            className="px-5 py-5"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-xl font-bold"
                                                >
                                                    <Link href={`/dashboard/ankauf/${purchase.id}`}>
                                                        Öffnen
                                                        <ArrowUpRight className="ml-1 size-3.5" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>

                            {filteredPurchases.length === 0 ? <EmptyPurchasesState /> : null}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function PurchaseMobileCard({ purchase }: { purchase: PurchaseCaseRow }) {
    return (
        <div
            onClick={() => {
                window.location.href = `/dashboard/ankauf/${purchase.id}`;
            }}
            className="cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.99]"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-extrabold text-cyan-700">
                        {purchase.purchase_number ?? "Ohne Nummer"}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-950">
                        {purchase.seller_name ?? "—"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        {formatDate(purchase.purchase_date)}
                    </p>
                </div>

                <StatusBadge tone={getPurchaseStatusTone(purchase.status)}>
                    {getPurchaseStatusLabel(purchase.status)}
                </StatusBadge>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Fahrzeug
                </p>
                <p className="mt-1 text-sm font-extrabold text-slate-950">
                    {purchase.vehicle_name ?? "—"}
                </p>
                <p className="mt-1 break-all font-mono text-xs font-bold text-slate-500">
                    {purchase.vin ?? "—"}
                </p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
                <PurchaseMobileInfoBox
                    label="Brutto"
                    value={formatCurrency(purchase.gross_amount)}
                />
                <PurchaseMobileInfoBox
                    label="Zahlung"
                    value={getPurchasePaymentStatusLabel(purchase.payment_status)}
                />
                <PurchaseMobileInfoBox
                    label="Dokumente"
                    value={getPurchaseDocumentStatusLabel(purchase.document_check_status)}
                />
            </div>

            <div
                className="mt-4"
                onClick={(event) => event.stopPropagation()}
            >
                <Button
                    asChild
                    variant="outline"
                    className="h-11 w-full rounded-2xl font-bold"
                >
                    <Link href={`/dashboard/ankauf/${purchase.id}`}>Öffnen</Link>
                </Button>
            </div>
        </div>
    );
}

function PurchaseFilterButton({
                                  active,
                                  onClick,
                                  label,
                                  count,
                              }: {
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                active
                    ? "flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-extrabold text-slate-950 shadow-sm"
                    : "flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold text-slate-500 transition hover:text-slate-950"
            }
        >
            <span>{label}</span>
            <span
                className={
                    active
                        ? "rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-extrabold text-cyan-700"
                        : "rounded-full bg-white/70 px-2 py-0.5 text-xs font-extrabold text-slate-400"
                }
            >
                {count}
            </span>
        </button>
    );
}

function PurchaseStatCard({
                              label,
                              value,
                              description,
                              icon: Icon,
                              danger = false,
                          }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof ShoppingCart;
    danger?: boolean;
}) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={danger ? "danger" : "info"}
        />
    );
}

function PurchaseMobileInfoBox({
                                   label,
                                   value,
                               }: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-extrabold text-slate-950">
                {value}
            </p>
        </div>
    );
}

function EmptyPurchasesState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <ShoppingCart className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Noch keine Ankäufe erfasst.
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Lege einen Ankauf an, um ein gekauftes Fahrzeug in den Bestand
                aufzunehmen.
            </p>
        </div>
    );
}
