"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
    ArrowUpRight,
    Car,
    CheckCircle2,
    FileWarning,
    Plus,
    Search,
    Truck,
} from "lucide-react";

import type { VehicleRow } from "@/lib/vehicles/vehicle-queries";
import {
    getDocumentStatusTone,
    getVehicleDisplayName,
    getVehicleDocumentStatusLabel,
    getVehicleProfit,
    getVehicleStatusLabel,
    getVehicleStatusTone,
} from "@/lib/vehicles/vehicle-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { FlashMessage } from "@/components/shared/flash-message";

type VehicleTab = "current" | "sold";

type VehicleInventoryProps = {
    vehicles: VehicleRow[];
    vehicleCreated?: boolean;
    highlightVehicleId?: string | null;
};

export function VehicleInventory({
                                     vehicles,
                                     vehicleCreated = false,
                                     highlightVehicleId = null,
                                 }: VehicleInventoryProps) {
    const [query, setQuery] = useState("");
    const [activeHighlightId, setActiveHighlightId] = useState(highlightVehicleId);

    useEffect(() => {
        const startTimeoutId = window.setTimeout(() => {
            setActiveHighlightId(highlightVehicleId);
        }, 0);

        if (!highlightVehicleId) {
            return () => window.clearTimeout(startTimeoutId);
        }

        const timeout = window.setTimeout(() => {
            setActiveHighlightId(null);
        }, 3000);

        return () => {
            window.clearTimeout(startTimeoutId);
            window.clearTimeout(timeout);
        };
    }, [highlightVehicleId]);

    const filteredVehicles = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        const sortedVehicles = [...vehicles].sort((firstVehicle, secondVehicle) =>
            secondVehicle.created_at.localeCompare(firstVehicle.created_at),
        );

        if (!normalizedQuery) return sortedVehicles;

        return sortedVehicles.filter((vehicle) => {
            const searchableText = [
                vehicle.manufacturer,
                vehicle.model,
                vehicle.vehicle_type,
                vehicle.vin,
                vehicle.license_plate,
                vehicle.seller_name,
                vehicle.buyer_name,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(normalizedQuery);
        });
    }, [query, vehicles]);

    const currentVehicles = filteredVehicles.filter(
        (vehicle) => vehicle.status === "in_stock" || vehicle.status === "reserved",
    );

    const soldVehicles = filteredVehicles.filter(
        (vehicle) => vehicle.status === "sold",
    );

    const missingDocumentsCount = vehicles.filter(
        (vehicle) => vehicle.document_status !== "complete",
    ).length;

    const totalStockValue = vehicles
        .filter((vehicle) => vehicle.status !== "sold")
        .reduce((sum, vehicle) => sum + vehicle.purchase_price_net, 0);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Bestandsverwaltung"
                title="Fahrzeugbestand"
                description="Alle angekauften Fahrzeuge, Verkaufsstatus, Dokumentenprüfung und Rohgewinn in einer sauberen Übersicht."
                action={
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                            asChild
                            variant="outline"
                            className="rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/vehicles/bestandsliste">
                                Bestandsliste
                            </Link>
                        </Button>

                        <Button
                            asChild
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        >
                            <Link href="/dashboard/vehicles/new">
                                <Plus className="mr-2 size-4" />
                                Ankauf erfassen
                            </Link>
                        </Button>
                    </div>
                }
            />

            {vehicleCreated ? (
                <FlashMessage message="Fahrzeug wurde angelegt." />
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InventoryStatCard
                    label="Fahrzeuge gesamt"
                    value={vehicles.length}
                    description="alle erfassten Fahrzeuge"
                    icon={Truck}
                />
                <InventoryStatCard
                    label="Aktueller Bestand"
                    value={currentVehicles.length}
                    description="nicht verkaufte Fahrzeuge"
                    icon={Car}
                />
                <InventoryStatCard
                    label="Verkauft"
                    value={soldVehicles.length}
                    description="abgeschlossene Fahrzeuge"
                    icon={CheckCircle2}
                />
                <InventoryStatCard
                    label="Offene Dokumente"
                    value={missingDocumentsCount}
                    description="Prüfung erforderlich"
                    icon={FileWarning}
                    href="/dashboard/documents?status=open"
                    danger={missingDocumentsCount > 0}
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Bestandsliste
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Aktueller Bestandswert:{" "}
                                    <span className="font-extrabold text-slate-950">
                    {formatCurrency(totalStockValue)}
                  </span>
                                </p>
                            </div>

                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Suche nach Fahrzeug, VIN, Kunde..."
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    <Tabs defaultValue="current" className="w-full">
                        <div className="border-b border-slate-200 px-5 pt-4">
                            <TabsList className="h-11 rounded-2xl bg-slate-100 p-1">
                                <TabsTrigger value="current" className="rounded-xl font-bold">
                                    Aktueller Bestand
                                </TabsTrigger>
                                <TabsTrigger value="sold" className="rounded-xl font-bold">
                                    Verkaufte LKWs
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="current" className="m-0">
                            <VehicleTable
                                vehicles={currentVehicles}
                                tab="current"
                                highlightedVehicleId={activeHighlightId}
                            />
                        </TabsContent>

                        <TabsContent value="sold" className="m-0">
                            <VehicleTable
                                vehicles={soldVehicles}
                                tab="sold"
                                highlightedVehicleId={activeHighlightId}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}

type InventoryStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Truck;
    href?: string;
    danger?: boolean;
};

function InventoryStatCard({
                               label,
                               value,
                               description,
                               icon: Icon,
                               href,
                               danger = false,
                           }: InventoryStatCardProps) {
    const card = (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={danger ? "danger" : "info"}
        />
    );

    if (!href) return card;

    return <Link href={href}>{card}</Link>;
}

type VehicleTableProps = {
    vehicles: VehicleRow[];
    tab: VehicleTab;
    highlightedVehicleId?: string | null;
};

function VehicleTable({
                          vehicles,
                          tab,
                          highlightedVehicleId = null,
                      }: VehicleTableProps) {
    const router = useRouter();

    if (vehicles.length === 0) {
        return (
            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                    <Car className="size-6" />
                </div>
                <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                    Keine Fahrzeuge gefunden
                </h3>
                <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                    Passe deine Suche an oder erfasse einen neuen Ankauf.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-4 p-4 md:hidden">
                {vehicles.map((vehicle) => {
                    const profit = getVehicleProfit(vehicle);
                    const isHighlighted = highlightedVehicleId === vehicle.id;

                    return (
                        <div
                            key={vehicle.id}
                            onClick={() => {
                                router.push(`/dashboard/vehicles/${vehicle.id}`);
                            }}
                            className={`cursor-pointer rounded-[1.5rem] border p-4 shadow-sm transition-all duration-300 active:scale-[0.99] ${
                                isHighlighted
                                    ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-200"
                                    : "border-slate-200 bg-white"
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <Link
                                        href={`/dashboard/vehicles/${vehicle.id}`}
                                        className="text-lg font-extrabold text-slate-950 hover:text-cyan-700 hover:underline"
                                    >
                                        {getVehicleDisplayName(vehicle)}
                                    </Link>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {vehicle.vehicle_type} · BJ{" "}
                                        {vehicle.construction_year ?? "—"}
                                    </p>
                                </div>

                                <StatusBadge tone={getVehicleStatusTone(vehicle.status)}>
                                    {getVehicleStatusLabel(vehicle.status)}
                                </StatusBadge>
                            </div>

                            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                    VIN
                                </p>
                                <p className="mt-1 break-all font-mono text-xs font-bold text-slate-700">
                                    {vehicle.vin}
                                </p>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <MobileInfoBox
                                    label="Einkauf"
                                    value={formatCurrency(vehicle.purchase_price_net)}
                                />
                                <MobileInfoBox
                                    label="Gewinn"
                                    value={profit !== null ? formatCurrency(profit) : "—"}
                                    valueClassName={
                                        profit && profit > 0
                                            ? "text-emerald-700"
                                            : "text-slate-400"
                                    }
                                />
                                <MobileInfoBox
                                    label="Dokumente"
                                    value={getVehicleDocumentStatusLabel(vehicle.document_status)}
                                    valueClassName={
                                        vehicle.document_status === "complete"
                                            ? "text-emerald-700"
                                            : vehicle.document_status === "partial"
                                                ? "text-amber-700"
                                                : "text-red-700"
                                    }
                                />
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-100 p-3">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                    Verkäufer
                                </p>
                                <p className="mt-1 text-sm font-bold text-slate-700">
                                    {vehicle.seller_name ?? "—"}
                                </p>
                                {vehicle.buyer_name ? (
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        Käufer: {vehicle.buyer_name}
                                    </p>
                                ) : null}
                            </div>

                            <div
                                className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <Button
                                    asChild
                                    variant="outline"
                                    className="h-11 rounded-2xl font-bold"
                                >
                                    <Link href={`/dashboard/vehicles/${vehicle.id}`}>
                                        Fahrzeugakte
                                    </Link>
                                </Button>

                                <Button
                                    asChild
                                    variant="outline"
                                    className="h-11 rounded-2xl font-bold"
                                >
                                    <Link href={`/dashboard/documents?vehicleId=${vehicle.id}`}>
                                        Dokumente
                                    </Link>
                                </Button>

                                {tab === "current" ? (
                                    <Button
                                        asChild
                                        className="h-11 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                    >
                                        <Link href={`/dashboard/sales/new?vehicleId=${vehicle.id}`}>
                                            Verkaufen
                                        </Link>
                                    </Button>
                                ) : (
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="h-11 rounded-2xl font-bold"
                                    >
                                        <Link href={`/dashboard/vehicles/${vehicle.id}`}>Akte</Link>
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1050px] text-left">
                    <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    <tr>
                        <th className="px-5 py-4">Fahrzeug</th>
                        <th className="px-5 py-4">VIN</th>
                        <th className="px-5 py-4">Verkäufer</th>
                        <th className="px-5 py-4">Einkauf</th>
                        <th className="px-5 py-4">Gewinn</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4">Dokumente</th>
                        <th className="px-5 py-4 text-right">Aktionen</th>
                    </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                    {vehicles.map((vehicle) => {
                        const profit = getVehicleProfit(vehicle);
                        const isHighlighted = highlightedVehicleId === vehicle.id;

                        return (
                            <tr
                                key={vehicle.id}
                                onClick={() => {
                                    router.push(`/dashboard/vehicles/${vehicle.id}`);
                                }}
                                className={`group cursor-pointer transition-colors ${
                                    isHighlighted
                                        ? "bg-emerald-50 ring-2 ring-inset ring-emerald-200"
                                        : "bg-white hover:bg-cyan-50/30"
                                }`}
                            >
                                <td className="px-5 py-5">
                                    <div>
                                        <Link
                                            href={`/dashboard/vehicles/${vehicle.id}`}
                                            className="font-extrabold text-slate-950 hover:text-cyan-700 hover:underline"
                                        >
                                            {getVehicleDisplayName(vehicle)}
                                        </Link>
                                        <p className="mt-1 text-xs font-medium text-slate-500">
                                            {vehicle.vehicle_type} · BJ{" "}
                                            {vehicle.construction_year ?? "—"}
                                        </p>
                                    </div>
                                </td>

                                <td className="px-5 py-5">
                                    <p className="font-mono text-sm font-bold text-slate-700">
                                        {vehicle.vin}
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-slate-500">
                                        {vehicle.license_plate ?? "kein Kennzeichen"}
                                    </p>
                                </td>

                                <td className="px-5 py-5">
                                    <p className="text-sm font-bold text-slate-700">
                                        {vehicle.seller_name ?? "—"}
                                    </p>
                                    {vehicle.buyer_name ? (
                                        <p className="mt-1 text-xs font-medium text-slate-500">
                                            Käufer: {vehicle.buyer_name}
                                        </p>
                                    ) : null}
                                </td>

                                <td className="px-5 py-5">
                                    <p className="font-extrabold text-slate-950">
                                        {formatCurrency(vehicle.purchase_price_net)}
                                    </p>
                                </td>

                                <td className="px-5 py-5">
                                    <p
                                        className={
                                            profit && profit > 0
                                                ? "font-extrabold text-emerald-700"
                                                : "font-extrabold text-slate-400"
                                        }
                                    >
                                        {profit !== null ? formatCurrency(profit) : "—"}
                                    </p>
                                </td>

                                <td className="px-5 py-5">
                                    <StatusBadge tone={getVehicleStatusTone(vehicle.status)}>
                                        {getVehicleStatusLabel(vehicle.status)}
                                    </StatusBadge>
                                </td>

                                <td className="px-5 py-5">
                                    <Link
                                        href={`/dashboard/documents?vehicleId=${vehicle.id}`}
                                        onClick={(event) => event.stopPropagation()}
                                        className="inline-flex rounded-full transition hover:opacity-80"
                                    >
                                        <StatusBadge
                                            tone={getDocumentStatusTone(vehicle.document_status)}
                                        >
                                            {getVehicleDocumentStatusLabel(vehicle.document_status)}
                                        </StatusBadge>
                                    </Link>
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
                                                <Link href={`/dashboard/documents?vehicleId=${vehicle.id}`}>
                                                    Dokumente
                                                </Link>
                                            </Button>

                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl font-bold"
                                            >
                                                <Link href={`/dashboard/vehicles/${vehicle.id}`}>
                                                    Fahrzeugakte
                                                </Link>
                                        </Button>

                                        {tab === "current" ? (
                                            <Button
                                                asChild
                                                size="sm"
                                                className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                            >
                                                <Link
                                                    href={`/dashboard/sales/new?vehicleId=${vehicle.id}`}
                                                >
                                                    Verkaufen
                                                    <ArrowUpRight className="ml-1 size-3.5" />
                                                </Link>
                                            </Button>
                                        ) : (
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl font-bold"
                                            >
                                                <Link href={`/dashboard/vehicles/${vehicle.id}`}>
                                                    Akte
                                                </Link>
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function MobileInfoBox({
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
