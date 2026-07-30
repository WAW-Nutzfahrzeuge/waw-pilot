import Link from "next/link";
import {
    ArrowUpRight,
    Banknote,
    BarChart3,
    CalendarDays,
    Car,
    Download,
    FileWarning,
    Receipt,
    ShoppingCart,
    TrendingUp,
    Truck,
    Wallet,
} from "lucide-react";

import type { ReportsData, ReportsPeriod } from "@/lib/reports/report-queries";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReportsOverviewProps = {
    data: ReportsData;
};

const periodOptions: {
    value: ReportsPeriod;
    label: string;
}[] = [
    { value: "all", label: "Insgesamt" },
    { value: "current_month", label: "Aktueller Monat" },
    { value: "current_year", label: "Aktuelles Jahr" },
    { value: "last_30_days", label: "Letzte 30 Tage" },
];

function getReportsExportHref(data: ReportsData): string {
    const params = new URLSearchParams();

    params.set("period", data.period);

    if (data.period === "custom") {
        if (data.dateFrom) params.set("date_from", data.dateFrom);
        if (data.dateTo) params.set("date_to", data.dateTo);
    }

    return `/dashboard/reports/export?${params.toString()}`;
}

export function ReportsOverview({ data }: ReportsOverviewProps) {
    const exportHref = getReportsExportHref(data);
    const openAmountItems = [
        ...data.openInvoices.map((invoice) => ({
            id: `invoice-${invoice.id}`,
            href: `/dashboard/sales/${invoice.saleId}`,
            label: invoice.invoiceNumber,
            subline: `${invoice.customerName} · ${invoice.vehicleName} · ${formatDate(invoice.invoiceDate)}`,
            amount: invoice.grossAmount,
            badge: "Rechnung" as const,
        })),
        ...data.openPurchases.map((purchase) => ({
            id: `purchase-${purchase.id}`,
            href: `/dashboard/ankauf/${purchase.id}`,
            label: purchase.purchaseNumber ?? "Ankauf ohne Nummer",
            subline: `${purchase.sellerName ?? "Kein Verkäufer"} · ${
                purchase.vehicleName ?? "Kein Fahrzeug"
            } · ${formatDate(purchase.purchaseDate)}`,
            amount: purchase.grossAmount,
            badge: "Ankauf" as const,
        })),
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Berichte"
                title="Auswertungen"
                description=""
                action={
                    <Link
                        href={exportHref}
                        className="inline-flex h-11 items-center justify-center rounded-2xl bg-cyan-700 px-4 text-sm font-extrabold text-white transition hover:bg-cyan-800"
                    >
                        <Download className="mr-2 size-4" />
                        CSV exportieren
                    </Link>
                }
            />

            <Card className="rounded-[1.5rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <div className="flex size-9 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                    <CalendarDays className="size-4" />
                                </div>

                                <div>
                                    <h2 className="text-base font-extrabold text-slate-950">
                                        Zeitraum
                                    </h2>
                                    <p className="text-xs font-semibold text-slate-500">
                                        Schnellfilter oder eigenen Zeitraum wählen.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                            <div className="overflow-x-auto">
                                <div className="inline-flex min-w-max gap-1 rounded-2xl bg-slate-100 p-1">
                                    {periodOptions.map((option) => {
                                        const isActive = data.period === option.value;

                                        return (
                                            <Link
                                                key={option.value}
                                                href={`/dashboard/reports?period=${option.value}`}
                                                className={
                                                    isActive
                                                        ? "flex h-9 items-center justify-center rounded-xl bg-white px-3 text-xs font-extrabold text-slate-950 shadow-sm"
                                                        : "flex h-9 items-center justify-center rounded-xl px-3 text-xs font-extrabold text-slate-500 transition hover:text-slate-950"
                                                }
                                            >
                                                {option.label}
                                            </Link>
                                        );
                                    })}

                                    <span
                                        className={
                                            data.period === "custom"
                                                ? "flex h-9 items-center justify-center rounded-xl bg-cyan-700 px-3 text-xs font-extrabold text-white shadow-sm"
                                                : "flex h-9 items-center justify-center rounded-xl px-3 text-xs font-extrabold text-slate-400"
                                        }
                                    >
                                        Individuell
                                    </span>
                                </div>
                            </div>

                            <form
                                action="/dashboard/reports"
                                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center"
                            >
                                <input type="hidden" name="period" value="custom" />

                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="date_from"
                                        className="whitespace-nowrap text-xs font-extrabold text-slate-500"
                                    >
                                        Von
                                    </Label>
                                    <Input
                                        id="date_from"
                                        name="date_from"
                                        type="date"
                                        defaultValue={
                                            data.period === "custom" ? data.dateFrom ?? "" : ""
                                        }
                                        className="h-9 w-full rounded-xl border-slate-200 bg-white px-2 text-xs font-bold sm:w-36"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="date_to"
                                        className="whitespace-nowrap text-xs font-extrabold text-slate-500"
                                    >
                                        Bis
                                    </Label>
                                    <Input
                                        id="date_to"
                                        name="date_to"
                                        type="date"
                                        defaultValue={
                                            data.period === "custom" ? data.dateTo ?? "" : ""
                                        }
                                        className="h-9 w-full rounded-xl border-slate-200 bg-white px-2 text-xs font-bold sm:w-36"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    size="sm"
                                    className="h-9 rounded-xl bg-cyan-700 px-3 text-xs font-extrabold text-white hover:bg-cyan-800"
                                >
                                    Anwenden
                                </Button>
                            </form>
                        </div>
                    </div>

                    {data.dateFrom || data.dateTo ? (
                        <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2">
                            <p className="text-xs font-bold text-cyan-950">
                                Aktiver Zeitraum:{" "}
                                {data.dateFrom ? formatDate(data.dateFrom) : "Anfang"} bis{" "}
                                {data.dateTo ? formatDate(data.dateTo) : "Heute"}
                            </p>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ReportStatCard
                    label="Umsatz netto"
                    value={formatCurrency(data.totalRevenueNet)}
                    description={`Brutto ${formatCurrency(data.totalSalesGross)}`}
                    icon={TrendingUp}
                    tone="success"
                    href="/dashboard/sales"
                />
                <ReportStatCard
                    label="Rohgewinn netto"
                    value={formatCurrency(data.totalProfitNet)}
                    description={`Ø ${formatCurrency(data.averageProfitNet)} pro Verkauf`}
                    icon={Banknote}
                    tone={data.totalProfitNet >= 0 ? "success" : "danger"}
                    href="/dashboard/sales"
                />
                <ReportStatCard
                    label="Einkauf netto"
                    value={formatCurrency(data.totalPurchaseNet)}
                    description={`Brutto ${formatCurrency(data.totalPurchaseGross)}`}
                    icon={ShoppingCart}
                    tone="warning"
                    href="/dashboard/ankauf"
                />
                <ReportStatCard
                    label="Kassenbuchsaldo"
                    value={formatCurrency(data.cashbookBalance)}
                    description={`${formatCurrency(data.cashbookIncome)} rein · ${formatCurrency(data.cashbookExpenses)} raus`}
                    icon={Wallet}
                    tone={data.cashbookBalance >= 0 ? "success" : "danger"}
                    href="/dashboard/cashbook"
                />
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ReportStatCard
                    label="Offene Rechnungen"
                    value={formatCurrency(data.openInvoicesGross)}
                    description={`${data.openInvoicesCount} Rechnung(en) offen`}
                    icon={Receipt}
                    tone={data.openInvoicesGross > 0 ? "danger" : "success"}
                    href="/dashboard/sales?paymentStatus=open"
                />
                <ReportStatCard
                    label="Offene Ankäufe"
                    value={formatCurrency(data.openPurchasePaymentsGross)}
                    description="noch nicht bezahlt"
                    icon={FileWarning}
                    tone={data.openPurchasePaymentsGross > 0 ? "danger" : "success"}
                    href="/dashboard/ankauf"
                />
                <ReportStatCard
                    label="Bestandswert netto"
                    value={formatCurrency(data.inventoryValueNet)}
                    description={`${data.currentVehiclesCount} Fahrzeug(e) im Bestand`}
                    icon={Truck}
                    tone="info"
                    href="/dashboard/vehicles"
                />
                <ReportStatCard
                    label="Fahrzeuge"
                    value={data.vehiclesCount}
                    description={`${data.soldVehiclesCount} verkauft · ${data.currentVehiclesCount} aktiv`}
                    icon={Car}
                    tone="info"
                    href="/dashboard/vehicles"
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
                <ReportListCard
                    title="Top Verkäufe nach Umsatz"
                    description="Die größten Verkaufsakten nach Netto-Umsatz im gewählten Zeitraum."
                    href="/dashboard/sales"
                    emptyText="Keine Verkäufe im Zeitraum vorhanden."
                >
                    {data.topSalesByRevenue.map((sale) => (
                        <Link
                            key={sale.id}
                            href={`/dashboard/sales/${sale.id}`}
                            className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-4">
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

                                <div className="text-right">
                                    <p className="font-extrabold text-slate-950">
                                        {formatCurrency(sale.revenueNet)}
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-emerald-700">
                                        Gewinn {formatCurrency(sale.profitNet)}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </ReportListCard>

                <ReportListCard
                    title="Top Verkäufe nach Rohgewinn"
                    description="Die profitabelsten Verkaufsakten im gewählten Zeitraum."
                    href="/dashboard/sales"
                    emptyText="Keine Verkäufe im Zeitraum vorhanden."
                >
                    {data.topSalesByProfit.map((sale) => (
                        <Link
                            key={sale.id}
                            href={`/dashboard/sales/${sale.id}`}
                            className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-4">
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

                                <div className="text-right">
                                    <p
                                        className={
                                            sale.profitNet >= 0
                                                ? "font-extrabold text-emerald-700"
                                                : "font-extrabold text-red-700"
                                        }
                                    >
                                        {formatCurrency(sale.profitNet)}
                                    </p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">
                                        Umsatz {formatCurrency(sale.revenueNet)}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </ReportListCard>

                <ReportListCard
                    title="Teuerste Ankäufe"
                    description="Die größten Fahrzeugankäufe nach Brutto-Betrag im gewählten Zeitraum."
                    href="/dashboard/ankauf"
                    emptyText="Keine Ankäufe im Zeitraum vorhanden."
                >
                    {data.topPurchasesByAmount.map((purchase) => (
                        <Link
                            key={purchase.id}
                            href={`/dashboard/ankauf/${purchase.id}`}
                            className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="font-extrabold text-orange-700">
                                        {purchase.purchaseNumber ?? "Ankauf ohne Nummer"}
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-slate-950">
                                        {purchase.sellerName ?? "Kein Verkäufer"}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {[purchase.vehicleName, formatDate(purchase.purchaseDate)]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>

                                <div className="text-right">
                                    <p className="font-extrabold text-slate-950">
                                        {formatCurrency(purchase.grossAmount)}
                                    </p>
                                    <StatusBadge
                                        tone={
                                            purchase.paymentStatus === "paid"
                                                ? "success"
                                                : "danger"
                                        }
                                    >
                                        {purchase.paymentStatus === "paid"
                                            ? "Bezahlt"
                                            : "Offen"}
                                    </StatusBadge>
                                </div>
                            </div>
                        </Link>
                    ))}
                </ReportListCard>

                <ReportListCard
                    title="Offene Beträge"
                    description="Offene Kundenrechnungen und offene Ankaufszahlungen im gewählten Zeitraum."
                    href="/dashboard/checks"
                    emptyText="Keine offenen Beträge im Zeitraum vorhanden."
                >
                    {openAmountItems.map((item) => (
                        <Link
                            key={item.id}
                            href={item.href}
                            className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <StatusBadge
                                        tone={item.badge === "Rechnung" ? "warning" : "danger"}
                                    >
                                        {item.badge}
                                    </StatusBadge>
                                    <p className="mt-2 font-extrabold text-slate-950">
                                        {item.label}
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {item.subline}
                                    </p>
                                </div>

                                <p className="text-right font-extrabold text-red-700">
                                    {formatCurrency(item.amount)}
                                </p>
                            </div>
                        </Link>
                    ))}
                </ReportListCard>
            </section>
        </div>
    );
}

function ReportStatCard({
                            label,
                            value,
                            description,
                            icon: Icon,
                            tone,
                            href,
                        }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof BarChart3;
    tone: "success" | "warning" | "danger" | "info";
    href: string;
}) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={tone}
            href={href}
        />
    );
}

function ReportListCard({
                            title,
                            description,
                            href,
                            emptyText,
                            children,
                        }: {
    title: string;
    description: string;
    href: string;
    emptyText: string;
    children: React.ReactNode;
}) {
    const hasChildren = Array.isArray(children)
        ? children.length > 0
        : Boolean(children);

    return (
        <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="p-0">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-950">
                            {title}
                        </h2>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                            {description}
                        </p>
                    </div>

                    <Link
                        href={href}
                        className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-700 transition hover:bg-slate-50"
                    >
                        Alle
                        <ArrowUpRight className="ml-1 size-3.5" />
                    </Link>
                </div>

                <div className="grid gap-3 p-4">
                    {hasChildren ? (
                        children
                    ) : (
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                            <p className="text-sm font-bold text-slate-500">
                                {emptyText}
                            </p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
