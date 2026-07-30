"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
    CalendarDays,
    ClipboardList,
    FileText,
    Plus,
    Search,
    ShieldCheck,
    Truck,
} from "lucide-react";

import type { LicensePlateCaseRow } from "@/lib/license-plates/license-plate-queries";
import {
    getLicensePlateStatusLabel,
    getLicensePlateStatusTone,
    getLicensePlateTypeLabel,
    getLicensePlateTypeTone,
} from "@/lib/license-plates/license-plate-helpers";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LicensePlatesOverviewProps = {
    cases: LicensePlateCaseRow[];
};

type PlateFilter = "all" | "short_term" | "export" | "customs" | "open";

type LicensePlateOverviewItem = LicensePlateCaseRow & {
    typeLabel: string;
    typeTone: ReturnType<typeof getLicensePlateTypeTone>;
    statusLabel: string;
    statusTone: ReturnType<typeof getLicensePlateStatusTone>;
    validFromLabel: string;
    validUntilLabel: string;
    searchableText: string;
};

export function LicensePlatesOverview({ cases }: LicensePlatesOverviewProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<PlateFilter>("all");

    const overviewData = useMemo(() => {
        const items: LicensePlateOverviewItem[] = cases.map((item) => {
            const typeLabel = getLicensePlateTypeLabel(item.plate_type);
            const statusLabel = getLicensePlateStatusLabel(item.status);

            return {
                ...item,
                typeLabel,
                typeTone: getLicensePlateTypeTone(item.plate_type),
                statusLabel,
                statusTone: getLicensePlateStatusTone(item.status),
                validFromLabel: formatDate(item.valid_from),
                validUntilLabel: formatDate(item.valid_until),
                searchableText: [
                    typeLabel,
                    statusLabel,
                    item.license_plate_number,
                    item.registration_office,
                    item.customer_name,
                    item.vehicle_name,
                    item.vin,
                    item.notes,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase(),
            };
        });
        const counts = cases.reduce(
            (currentCounts, item) => ({
                shortTermCount:
                    currentCounts.shortTermCount +
                    (item.plate_type === "short_term" ? 1 : 0),
                exportCount:
                    currentCounts.exportCount + (item.plate_type === "export" ? 1 : 0),
                customsCount:
                    currentCounts.customsCount + (item.plate_type === "customs" ? 1 : 0),
                openCount:
                    currentCounts.openCount +
                    (item.status === "open" || item.status === "requested" ? 1 : 0),
                completedCount:
                    currentCounts.completedCount + (item.status === "completed" ? 1 : 0),
            }),
            {
                shortTermCount: 0,
                exportCount: 0,
                customsCount: 0,
                openCount: 0,
                completedCount: 0,
            },
        );

        return {
            items,
            ...counts,
        };
    }, [cases]);

    const filteredCases = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return overviewData.items.filter((item) => {
            const matchesFilter =
                filter === "all" ||
                item.plate_type === filter ||
                (filter === "open" &&
                    (item.status === "open" || item.status === "requested"));

            if (!matchesFilter) return false;

            if (!normalizedQuery) return true;

            return item.searchableText.includes(normalizedQuery);
        });
    }, [overviewData.items, query, filter]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kennzeichen"
                title="Kennzeichen-Vorgänge"
                description="Export-/Zollkennzeichen und Kurzzeitkennzeichen für Fahrzeuge, Kunden und Verkaufsakten verwalten."
                action={
                    <Button
                        asChild
                        className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <Link href="/dashboard/plates/new">
                            <Plus className="mr-2 size-4" />
                            Vorgang anlegen
                        </Link>
                    </Button>
                }
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <PlateStatCard
                    label="Vorgänge"
                    value={cases.length}
                    description="gesamt angelegt"
                    icon={ClipboardList}
                />
                <PlateStatCard
                    label="Offen / beantragt"
                    value={overviewData.openCount}
                    description="noch nicht abgeschlossen"
                    icon={CalendarDays}
                    danger={overviewData.openCount > 0}
                />
                <PlateStatCard
                    label="Abgeschlossen"
                    value={overviewData.completedCount}
                    description="fertige Vorgänge"
                    icon={ShieldCheck}
                />
                <PlateStatCard
                    label="Kurzzeit"
                    value={overviewData.shortTermCount}
                    description={`${overviewData.exportCount} Export · ${overviewData.customsCount} Zoll`}
                    icon={Truck}
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Vorgangsliste
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Suche nach Fahrzeug, Kunde, Kennzeichen, VIN oder Zulassungsstelle.
                                </p>
                            </div>

                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Kennzeichen suchen..."
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                />
                            </div>
                        </div>

                        <div className="mt-5 overflow-x-auto">
                            <div className="inline-grid min-w-max grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1">
                                <PlateFilterButton
                                    active={filter === "all"}
                                    onClick={() => setFilter("all")}
                                    label="Alle"
                                    count={cases.length}
                                />
                                <PlateFilterButton
                                    active={filter === "open"}
                                    onClick={() => setFilter("open")}
                                    label="Offen"
                                    count={overviewData.openCount}
                                />
                                <PlateFilterButton
                                    active={filter === "short_term"}
                                    onClick={() => setFilter("short_term")}
                                    label="Kurzzeit"
                                    count={overviewData.shortTermCount}
                                />
                                <PlateFilterButton
                                    active={filter === "export"}
                                    onClick={() => setFilter("export")}
                                    label="Export"
                                    count={overviewData.exportCount}
                                />
                                <PlateFilterButton
                                    active={filter === "customs"}
                                    onClick={() => setFilter("customs")}
                                    label="Zoll"
                                    count={overviewData.customsCount}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="grid gap-4 p-4 md:hidden">
                            {filteredCases.map((item) => (
                                <PlateMobileCard key={item.id} item={item} />
                            ))}

                            {filteredCases.length === 0 ? <EmptyPlatesState /> : null}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1100px] text-left">
                                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">Typ</th>
                                    <th className="px-5 py-4">Fahrzeug</th>
                                    <th className="px-5 py-4">Kunde</th>
                                    <th className="px-5 py-4">Gültigkeit</th>
                                    <th className="px-5 py-4">Kennzeichen</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4 text-right">Aktion</th>
                                </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                {filteredCases.map((item) => (
                                        <tr
                                            key={item.id}
                                            onClick={() => {
                                                router.push(`/dashboard/plates/${item.id}`);
                                            }}
                                        className="group cursor-pointer bg-white transition-colors hover:bg-cyan-50/30"
                                    >
                                        <td className="px-5 py-5">
                                            <StatusBadge
                                                tone={item.typeTone}
                                            >
                                                {item.typeLabel}
                                            </StatusBadge>
                                            {item.duration_days ? (
                                                <p className="mt-2 text-xs font-bold text-slate-500">
                                                    {item.duration_days} Tage
                                                </p>
                                            ) : null}
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-slate-950">
                                                {item.vehicle_name ?? "—"}
                                            </p>
                                            <p className="mt-1 font-mono text-xs font-bold text-slate-500">
                                                {item.vin ?? "—"}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-bold text-slate-950">
                                                {item.customer_name ?? "—"}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="text-sm font-bold text-slate-700">
                                                {item.validFromLabel}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                bis {item.validUntilLabel}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-cyan-700">
                                                {item.license_plate_number ?? "Noch offen"}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                {item.registration_office ?? "Keine Zulassungsstelle"}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <StatusBadge
                                                tone={item.statusTone}
                                            >
                                                {item.statusLabel}
                                            </StatusBadge>
                                        </td>

                                        <td
                                            className="px-5 py-5 text-right"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl font-bold"
                                            >
                                                <Link href={`/dashboard/plates/${item.id}`}>
                                                    Öffnen
                                                </Link>
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>

                            {filteredCases.length === 0 ? <EmptyPlatesState /> : null}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function PlateMobileCard({ item }: { item: LicensePlateOverviewItem }) {
    const router = useRouter();

    return (
        <div
            onClick={() => {
                router.push(`/dashboard/plates/${item.id}`);
            }}
            className="cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.99]"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <StatusBadge tone={item.typeTone}>
                        {item.typeLabel}
                    </StatusBadge>
                    {item.duration_days ? (
                        <p className="mt-2 text-xs font-bold text-slate-500">
                            {item.duration_days} Tage
                        </p>
                    ) : null}
                </div>

                <StatusBadge tone={item.statusTone}>
                    {item.statusLabel}
                </StatusBadge>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Fahrzeug
                </p>
                <p className="mt-1 text-sm font-extrabold text-slate-950">
                    {item.vehicle_name ?? "—"}
                </p>
                <p className="mt-1 break-all font-mono text-xs font-bold text-slate-500">
                    {item.vin ?? "—"}
                </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <PlateMobileInfoBox label="Kunde" value={item.customer_name ?? "—"} />
                <PlateMobileInfoBox
                    label="Kennzeichen"
                    value={item.license_plate_number ?? "Noch offen"}
                />
                <PlateMobileInfoBox
                    label="Von"
                    value={item.validFromLabel}
                />
                <PlateMobileInfoBox
                    label="Bis"
                    value={item.validUntilLabel}
                />
            </div>

            <div onClick={(event) => event.stopPropagation()}>
                <Button
                    asChild
                    variant="outline"
                    className="mt-4 h-11 w-full rounded-2xl font-bold"
                >
                    <Link href={`/dashboard/plates/${item.id}`}>Öffnen</Link>
                </Button>
            </div>
        </div>
    );
}

function PlateFilterButton({
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

function PlateStatCard({
                           label,
                           value,
                           description,
                           icon: Icon,
                           danger = false,
                       }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Truck;
    danger?: boolean;
}) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={danger ? "warning" : "info"}
        />
    );
}

function PlateMobileInfoBox({ label, value }: { label: string; value: string }) {
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

function EmptyPlatesState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <FileText className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Kennzeichen-Vorgänge gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Lege einen neuen Vorgang für Kurzzeit-, Export- oder Zollkennzeichen an.
            </p>
        </div>
    );
}
