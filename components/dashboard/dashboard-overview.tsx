import Link from "next/link";
import {
    ArrowUpRight,
    BadgeCheck,
    Banknote,
    Car,
    FileArchive,
    FileWarning,
    TrendingUp,
    Truck,
    Users,
    Wallet,
    ShoppingCart,
} from "lucide-react";

import type { DashboardData } from "@/lib/dashboard/dashboard-queries";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthFilter } from "@/components/filters/month-filter";
import { normalizeMonthFilter } from "@/utils/month-filter";

type DashboardOverviewProps = {
    data: DashboardData;
    monthFilter?: string | null;
};

export function DashboardOverview({ data, monthFilter = null }: DashboardOverviewProps) {
    const activeLicensePlateCases =
        data.openLicensePlateCasesCount + data.requestedLicensePlateCasesCount;
    const selectedMonthFilter = normalizeMonthFilter(monthFilter);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Automatisierungs-Cockpit"
                title="Dashboard"
                description="Live-Kennzahlen aus Supabase: Bestand, Kunden, Verkäufe, Dokumente, Kennzeichen und Kassenbuch."
                action={
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-stretch">
                        <Button
                            asChild
                            className="h-10 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        >
                            <Link href="/dashboard/checks">
                                Pflichtprüfung öffnen
                                <ArrowUpRight className="ml-2 size-4" />
                            </Link>
                        </Button>
                        <MonthFilter value={selectedMonthFilter} updateUrl />
                    </div>
                }
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DashboardStatCard
                    label="Fahrzeuge"
                    value={data.vehiclesCount}
                    description={`${data.currentVehiclesCount} im Bestand · ${data.soldVehiclesCount} verkauft`}
                    icon={Truck}
                    href="/dashboard/vehicles"
                />
                <DashboardStatCard
                    label="Kunden"
                    value={data.customersCount}
                    description="Firmen & Privatpersonen"
                    icon={Users}
                    href="/dashboard/customers"
                />
                <DashboardStatCard
                    label="Umsatz netto"
                    value={formatCurrency(data.totalRevenueNet)}
                    description={`${data.salesCount} Verkauf(e)`}
                    icon={TrendingUp}
                    href="/dashboard/sales"
                />
                <DashboardStatCard
                    label="Rohgewinn netto"
                    value={formatCurrency(data.totalProfitNet)}
                    description="Verkauf minus Einkauf/Nebenkosten"
                    icon={Banknote}
                    href="/dashboard/sales"
                />
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DashboardStatCard
                    label="Dokumente"
                    value={data.documentsCount}
                    description={`${data.incompleteDocumentsCount} prüfen`}
                    icon={FileArchive}
                    href="/dashboard/documents?filter=needs_review"
                    danger={data.incompleteDocumentsCount > 0}
                />
                <DashboardStatCard
                    label="Kennzeichen"
                    value={data.licensePlateCasesCount}
                    description={`${activeLicensePlateCases} offen/beantragt · ${data.completedLicensePlateCasesCount} abgeschlossen`}
                    icon={BadgeCheck}
                    href="/dashboard/plates"
                    danger={activeLicensePlateCases > 0}
                />
                <DashboardStatCard
                    label="Fahrzeugankäufe"
                    value={data.purchaseCasesCount}
                    description={`${data.openPurchasePaymentsCount} Zahlungen offen · ${data.incompletePurchaseDocumentsCount} Dokumente prüfen`}
                    icon={ShoppingCart}
                    href="/dashboard/ankauf"
                    danger={
                        data.openPurchasePaymentsCount > 0 ||
                        data.incompletePurchaseDocumentsCount > 0
                    }
                />
                <DashboardStatCard
                    label="Kassenbuch"
                    value={formatCurrency(data.cashbookBalance)}
                    description="Gesamtsaldo"
                    icon={Wallet}
                    href="/dashboard/cashbook"
                    danger={data.cashbookBalance < 0}
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
                <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Nächste Aktionen
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Automatisch aus Fahrzeugakten, Kennzeichen, Dokumenten und Zahlungen erkannt.
                            </p>
                        </div>

                        <div id="actions" className="grid gap-3 p-4">
                            {data.openActions.length > 0 ? (
                                data.openActions.map((action) => (
                                    <Link
                                        key={action.label}
                                        href={action.href}
                                        className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="mb-2">
                                                    <StatusBadge tone={action.tone}>
                                                        Prüfen
                                                    </StatusBadge>
                                                </div>
                                                <p className="font-extrabold text-slate-950">
                                                    {action.label}
                                                </p>
                                                <p className="mt-1 text-sm font-medium text-slate-500">
                                                    {action.description}
                                                </p>
                                            </div>

                                            <ArrowUpRight className="size-5 text-slate-400 transition-colors group-hover:text-cyan-700" />
                                        </div>
                                    </Link>
                                ))
                            ) : (
                                <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                    <div className="flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                                        <FileWarning className="size-6" />
                                    </div>
                                    <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                                        Alles sauber
                                    </h3>
                                    <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                                        Aktuell wurden keine offenen Pflichtpunkte erkannt.
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-300/40">
                    <CardContent className="p-6">
                        <p className="text-xs font-extrabold uppercase tracking-[0.32em] text-cyan-200">
                            Finanzüberblick
                        </p>
                        <h2 className="mt-2 text-2xl font-extrabold">WAW Live-KPIs</h2>

                        <div className="mt-6 space-y-4">
                            <SummaryRow
                                label="Umsatz netto"
                                value={formatCurrency(data.totalRevenueNet)}
                            />
                            <SummaryRow
                                label="Rohgewinn netto"
                                value={formatCurrency(data.totalProfitNet)}
                            />
                            <SummaryRow
                                label="Kassenbuchsaldo"
                                value={formatCurrency(data.cashbookBalance)}
                            />
                            <SummaryRow
                                label="Offene Zahlungen"
                                value={String(data.openInvoicesCount)}
                            />
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Letzte Fahrzeuge
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Neueste Fahrzeuge aus dem Bestand.
                            </p>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {data.recentVehicles.length > 0 ? (
                                data.recentVehicles.map((vehicle) => (
                                    <Link
                                        key={vehicle.id}
                                        href={`/dashboard/vehicles/${vehicle.id}`}
                                        className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-cyan-50/40"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                                <Car className="size-5" />
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    {vehicle.internalNumber}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                                    {vehicle.name} · {formatDate(vehicle.createdAt)}
                                                </p>
                                            </div>
                                        </div>

                                        <StatusBadge tone={vehicle.status === "sold" ? "success" : "info"}>
                                            {vehicle.status === "sold" ? "Verkauft" : "Bestand"}
                                        </StatusBadge>
                                    </Link>
                                ))
                            ) : (
                                <EmptyList text="Noch keine Fahrzeuge vorhanden." />
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Letzte Verkäufe
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Neueste Verkaufsakten aus Supabase.
                            </p>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {data.recentSales.length > 0 ? (
                                data.recentSales.map((sale) => (
                                    <Link
                                        key={sale.id}
                                        href={`/dashboard/sales/${sale.id}`}
                                        className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-cyan-50/40"
                                    >
                                        <div>
                                            <p className="font-extrabold text-cyan-700">
                                                {sale.invoiceNumber ?? "Noch keine Rechnung"}
                                            </p>
                                            <p className="mt-1 text-sm font-bold text-slate-950">
                                                {sale.customerName}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                {sale.vehicleName} · {formatDate(sale.saleDate)}
                                            </p>
                                        </div>

                                        <p className="text-right font-extrabold text-slate-950">
                                            {formatCurrency(sale.amount)}
                                        </p>
                                    </Link>
                                ))
                            ) : (
                                <EmptyList text="Noch keine Verkäufe vorhanden." />
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Letzte Kennzeichen
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Neueste Kurzzeit-, Export- und Zollkennzeichen.
                            </p>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {data.recentLicensePlateCases.length > 0 ? (
                                data.recentLicensePlateCases.map((plateCase) => (
                                    <Link
                                        key={plateCase.id}
                                        href={`/dashboard/plates/${plateCase.id}`}
                                        className="block p-5 transition-colors hover:bg-cyan-50/40"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-extrabold text-cyan-700">
                                                    {plateCase.licensePlateNumber ?? "Kennzeichen offen"}
                                                </p>
                                                <p className="mt-1 text-sm font-bold text-slate-950">
                                                    {plateCase.typeLabel}
                                                </p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                                    {plateCase.vehicleName}
                                                </p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                                    {plateCase.customerName}
                                                </p>
                                            </div>

                                            <StatusBadge tone="info">
                                                {plateCase.statusLabel}
                                            </StatusBadge>
                                        </div>

                                        <p className="mt-3 text-xs font-semibold text-slate-500">
                                            Gültig bis: {formatDate(plateCase.validUntil)}
                                        </p>
                                    </Link>
                                ))
                            ) : (
                                <EmptyList text="Noch keine Kennzeichen-Vorgänge vorhanden." />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}

type DashboardStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Truck;
    href: string;
    danger?: boolean;
};

function DashboardStatCard({
                               label,
                               value,
                               description,
                               icon: Icon,
                               href,
                               danger = false,
                           }: DashboardStatCardProps) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            href={href}
            tone={danger ? "danger" : "info"}
        />
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-sm font-bold text-slate-300">{label}</p>
            <p className="font-extrabold text-white">{value}</p>
        </div>
    );
}

function EmptyList({ text }: { text: string }) {
    return (
        <div className="p-5">
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <p className="text-sm font-bold text-slate-500">{text}</p>
            </div>
        </div>
    );
}
