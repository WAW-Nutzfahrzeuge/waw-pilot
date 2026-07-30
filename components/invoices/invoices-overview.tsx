"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
    ArrowUpRight,
    Download,
    ExternalLink,
    FileText,
    Plus,
    Receipt,
    Search,
    Send,
    Wallet,
} from "lucide-react";

import type { InvoiceRow } from "@/lib/invoices/invoice-queries";
import { getInvoiceTypeLabel } from "@/lib/invoices/invoice-numbering";
import {
    getInvoiceDatevStatusLabel,
    getInvoiceDatevStatusTone,
    getInvoicePaymentStatusLabel,
    getInvoicePaymentStatusTone,
    getInvoiceStatusLabel,
} from "@/lib/invoices/invoice-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FlashMessage } from "@/components/shared/flash-message";
import { cn } from "@/lib/utils";

type InvoicesOverviewProps = {
    invoices: InvoiceRow[];
    invoiceCreated?: boolean;
    invoiceRegenerated?: boolean;
    highlightedInvoiceId?: string;
};

type InvoiceFilter = "all" | "standard" | "proforma";

function normalizeSearchText(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/ß/g, "ss")
        .replace(/\s+/g, " ")
        .trim();
}

function parseSearchAmount(value: string): number | null {
    const cleanedValue = value
        .replace(/€/g, "")
        .replace(/\s/g, "")
        .trim();

    if (!cleanedValue || !/[0-9]/.test(cleanedValue)) return null;

    let normalizedValue = cleanedValue;
    const hasComma = normalizedValue.includes(",");
    const hasDot = normalizedValue.includes(".");

    if (hasComma && hasDot) {
        normalizedValue = normalizedValue.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
        normalizedValue = normalizedValue.replace(",", ".");
    } else if (hasDot) {
        const parts = normalizedValue.split(".");
        const lastPart = parts.at(-1);

        if (parts.length > 2 || lastPart?.length === 3) {
            normalizedValue = parts.join("");
        }
    }

    const amount = Number(normalizedValue);

    return Number.isFinite(amount) ? amount : null;
}

function getAmountSearchValues(amount: number): string[] {
    const fixedAmount = amount.toFixed(2);
    const roundedAmount = String(Math.round(amount));
    const germanAmount = new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);

    return [
        fixedAmount,
        fixedAmount.replace(".", ","),
        fixedAmount.replace(".", ""),
        roundedAmount,
        germanAmount,
        germanAmount.replace(/\./g, ""),
        germanAmount.replace(/\./g, "").replace(",", "."),
        `${germanAmount} €`,
        `€${germanAmount}`,
    ].map(normalizeSearchText);
}

function invoiceMatchesAmount(invoice: InvoiceRow, rawQuery: string): boolean {
    const normalizedQuery = normalizeSearchText(rawQuery.replace(/€/g, ""));
    const queryAmount = parseSearchAmount(rawQuery);
    const invoiceAmounts = [
        invoice.net_amount,
        invoice.vat_amount,
        invoice.gross_amount,
    ];

    return invoiceAmounts.some((amount) => {
        if (queryAmount !== null && Math.abs(amount - queryAmount) < 0.005) {
            return true;
        }

        return getAmountSearchValues(amount).some((amountValue) =>
            amountValue.includes(normalizedQuery),
        );
    });
}

function getInvoiceSearchAliases(invoice: InvoiceRow): string[] {
    const aliases = ["datev"];

    if (invoice.invoice_type === "standard") {
        aliases.push("normal", "normale rechnung");
    }

    if (invoice.invoice_type === "proforma") {
        aliases.push("pro forma");
    }

    if (invoice.invoice_type === "down_payment") {
        aliases.push("anzahlung", "anzahlungs rechnung");
    }

    if (invoice.payment_status === "open") {
        aliases.push("offen", "unbezahlt");
    }

    if (invoice.payment_status === "partial") {
        aliases.push("teilweise", "teilweise bezahlt", "teilbezahlt");
    }

    if (invoice.payment_status === "paid") {
        aliases.push("bezahlt");
    }

    if (invoice.datev_status === "sent") {
        aliases.push("datev gesendet");
    }

    if (invoice.datev_status === "not_sent") {
        aliases.push("datev offen", "datev nicht gesendet", "nicht gesendet");
    }

    return aliases;
}

function getInvoiceSearchText(invoice: InvoiceRow): string {
    return normalizeSearchText(
        [
            invoice.invoice_number,
            getInvoiceTypeLabel(invoice.invoice_type),
            invoice.invoice_type,
            getInvoiceStatusLabel(invoice.status),
            invoice.status,
            getInvoicePaymentStatusLabel(invoice.payment_status),
            invoice.payment_status,
            getInvoiceDatevStatusLabel(invoice.datev_status),
            invoice.datev_status,
            invoice.customer_name,
            invoice.customer_country,
            invoice.vehicle_name,
            invoice.vehicle_type,
            invoice.vin,
            invoice.pdf_file_name,
            formatCurrency(invoice.net_amount),
            formatCurrency(invoice.vat_amount),
            formatCurrency(invoice.gross_amount),
            ...getInvoiceSearchAliases(invoice),
        ]
            .filter(Boolean)
            .join(" "),
    );
}

export function InvoicesOverview({
    invoices,
    invoiceCreated = false,
    invoiceRegenerated = false,
    highlightedInvoiceId,
}: InvoicesOverviewProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all");
    const [activeHighlightId, setActiveHighlightId] = useState(
        highlightedInvoiceId,
    );

    useEffect(() => {
        const startTimeoutId = window.setTimeout(() => {
            setActiveHighlightId(highlightedInvoiceId);
        }, 0);

        if (!highlightedInvoiceId) {
            return () => window.clearTimeout(startTimeoutId);
        }

        const timeoutId = window.setTimeout(() => {
            setActiveHighlightId(undefined);
        }, 3000);

        return () => {
            window.clearTimeout(startTimeoutId);
            window.clearTimeout(timeoutId);
        };
    }, [highlightedInvoiceId]);

    const invoiceSummary = useMemo(() => {
        return invoices.reduce(
            (summary, invoice) => {
                if (invoice.invoice_type === "standard") {
                    summary.standardInvoices += 1;
                }

                if (invoice.invoice_type === "proforma") {
                    summary.proformaInvoices += 1;
                }

                if (invoice.payment_status !== "paid") {
                    summary.openInvoices += 1;
                }

                if (invoice.datev_status === "not_sent") {
                    summary.notSentToDatev += 1;
                }

                summary.totalGross += invoice.gross_amount;
                summary.totalNet += invoice.net_amount;

                return summary;
            },
            {
                notSentToDatev: 0,
                openInvoices: 0,
                proformaInvoices: 0,
                standardInvoices: 0,
                totalGross: 0,
                totalNet: 0,
            },
        );
    }, [invoices]);

    const filteredInvoices = useMemo(() => {
        const normalizedQuery = normalizeSearchText(query);

        return invoices.filter((invoice) => {
            const matchesFilter =
                invoiceFilter === "all" || invoice.invoice_type === invoiceFilter;

            if (!matchesFilter) return false;

            if (!normalizedQuery) return true;

            return (
                getInvoiceSearchText(invoice).includes(normalizedQuery) ||
                invoiceMatchesAmount(invoice, query)
            );
        });
    }, [query, invoices, invoiceFilter]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Rechnungsverwaltung"
                title="Rechnungen"
                description="Normale Rechnungen und Proforma-Rechnungen mit PDF, Kunde, Fahrzeug und DATEV-Hinweis."
                action={
                    <Button
                        asChild
                        className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <Link href="/dashboard/sales/new">
                            <Plus className="mr-2 size-4" />
                            Rechnung erzeugen
                        </Link>
                    </Button>
                }
            />

            {invoiceCreated ? (
                <FlashMessage message="Rechnung wurde erstellt." />
            ) : null}

            {invoiceRegenerated ? (
                <FlashMessage message="Rechnung wurde neu generiert." />
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InvoiceStatCard
                    label="Rechnungen"
                    value={invoices.length}
                    description={`${invoiceSummary.standardInvoices} normal · ${invoiceSummary.proformaInvoices} Proforma/Anzahlung`}
                    icon={Receipt}
                />
                <InvoiceStatCard
                    label="Netto-Betrag"
                    value={formatCurrency(invoiceSummary.totalNet)}
                    description={`Brutto: ${formatCurrency(invoiceSummary.totalGross)}`}
                    icon={FileText}
                />
                <InvoiceStatCard
                    label="Offene Rechnungen"
                    value={invoiceSummary.openInvoices}
                    description="Zahlung noch offen"
                    icon={Wallet}
                    danger={invoiceSummary.openInvoices > 0}
                />
                <InvoiceStatCard
                    label="DATEV offen"
                    value={invoiceSummary.notSentToDatev}
                    description="noch nicht markiert"
                    icon={Send}
                    danger={invoiceSummary.notSentToDatev > 0}
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Rechnungsliste
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Suche nach Rechnung, Kunde, Fahrzeug, FIN, Betrag oder Status.
                                </p>
                            </div>

                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Suche nach Rechnung, Kunde, Fahrzeug, FIN, Betrag oder Status..."
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                />
                            </div>
                        </div>

                        <div className="mt-5 overflow-x-auto">
                            <div className="inline-grid min-w-max grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
                                <InvoiceFilterButton
                                    active={invoiceFilter === "all"}
                                    onClick={() => setInvoiceFilter("all")}
                                    label="Alle"
                                    count={invoices.length}
                                />
                                <InvoiceFilterButton
                                    active={invoiceFilter === "standard"}
                                    onClick={() => setInvoiceFilter("standard")}
                                    label="Rechnungen"
                                    count={invoiceSummary.standardInvoices}
                                />
                                <InvoiceFilterButton
                                    active={invoiceFilter === "proforma"}
                                    onClick={() => setInvoiceFilter("proforma")}
                                    label="Proforma"
                                    count={invoiceSummary.proformaInvoices}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="grid gap-4 p-4 md:hidden">
                            {filteredInvoices.map((invoice) => (
                                <div
                                    key={invoice.id}
                                    onClick={() => {
                                        router.push(`/dashboard/sales/${invoice.sale_id}`);
                                    }}
                                    className={cn(
                                        "cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-500 active:scale-[0.99]",
                                        activeHighlightId === invoice.id
                                            ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300 shadow-lg shadow-emerald-900/10"
                                            : "hover:border-cyan-200 hover:bg-cyan-50/30",
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0">
                                            <InvoiceTypePill invoice={invoice} />

                                            <p className="mt-2 break-all text-lg font-extrabold text-cyan-700">
                                                {invoice.invoice_number}
                                            </p>
                                            <p className="mt-1 text-sm font-bold text-slate-950">
                                                {invoice.customer_name}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                {formatDate(invoice.invoice_date)} · fällig{" "}
                                                {formatDate(invoice.due_date)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                            Fahrzeug
                                        </p>
                                        <p className="mt-1 text-left text-sm font-extrabold text-slate-950">
                                            {invoice.vehicle_name}
                                        </p>
                                        <p className="mt-1 break-all font-mono text-xs font-bold text-slate-500">
                                            {invoice.vin}
                                        </p>
                                    </div>

                                    <div className="mt-4 grid grid-cols-3 gap-3">
                                        <InvoiceMobileInfoBox
                                            label="Netto"
                                            value={formatCurrency(invoice.net_amount)}
                                        />
                                        <InvoiceMobileInfoBox
                                            label="MwSt."
                                            value={formatCurrency(invoice.vat_amount)}
                                        />
                                        <InvoiceMobileInfoBox
                                            label="Brutto"
                                            value={formatCurrency(invoice.gross_amount)}
                                        />
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-2">
                                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                                Zahlung
                                            </p>
                                            <StatusBadge
                                                tone={getInvoicePaymentStatusTone(invoice.payment_status)}
                                            >
                                                {getInvoicePaymentStatusLabel(invoice.payment_status)}
                                            </StatusBadge>
                                        </div>

                                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                                                DATEV
                                            </p>
                                            <StatusBadge
                                                tone={getInvoiceDatevStatusTone(invoice.datev_status)}
                                            >
                                                {getInvoiceDatevStatusLabel(invoice.datev_status)}
                                            </StatusBadge>
                                        </div>
                                    </div>

                                    {invoice.pdf_file_name ? (
                                        <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-3">
                                            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
                                                PDF
                                            </p>
                                            <p className="mt-1 break-all text-sm font-extrabold text-cyan-950">
                                                {invoice.pdf_file_name}
                                            </p>
                                        </div>
                                    ) : null}

                                    <div
                                        className={
                                            invoice.invoice_type === "proforma"
                                                ? "mt-4 grid grid-cols-3 gap-2"
                                                : "mt-4 grid grid-cols-2 gap-2"
                                        }
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <MarkInvoicePaidButton invoice={invoice} />
                                        <Button
                                            asChild
                                            variant="outline"
                                            className="h-11 rounded-2xl font-bold"
                                        >
                                            <Link href={`/dashboard/sales/${invoice.sale_id}`}>
                                                Öffnen
                                            </Link>
                                        </Button>

                                        <Button
                                            asChild
                                            variant="outline"
                                            className="h-11 rounded-2xl font-bold"
                                        >
                                            <Link
                                                href={`/api/invoices/${invoice.id}/pdf`}
                                                target="_blank"
                                            >
                                                PDF
                                            </Link>
                                        </Button>

                                        <Button
                                            asChild
                                            className="h-11 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                        >
                                            <Link href={`/api/invoices/${invoice.id}/pdf?download=1`}>
                                                Download
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {filteredInvoices.length === 0 ? <EmptyInvoicesState /> : null}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1220px] text-left">
                                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">Rechnung</th>
                                    <th className="px-5 py-4">Kunde</th>
                                    <th className="px-5 py-4">Fahrzeug</th>
                                    <th className="px-5 py-4">Datum</th>
                                    <th className="px-5 py-4">Netto</th>
                                    <th className="px-5 py-4">MwSt.</th>
                                    <th className="px-5 py-4">Brutto</th>
                                    <th className="px-5 py-4">Zahlung</th>
                                    <th className="px-5 py-4">DATEV</th>
                                    <th className="px-5 py-4 text-right">Aktionen</th>
                                </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                {filteredInvoices.map((invoice) => (
                                    <tr
                                        key={invoice.id}
                                        onClick={() => {
                                            router.push(`/dashboard/sales/${invoice.sale_id}`);
                                        }}
                                        className={cn(
                                            "group cursor-pointer transition-all duration-500 hover:bg-cyan-50/30",
                                            activeHighlightId === invoice.id
                                                ? "bg-emerald-50 shadow-[inset_4px_0_0_#34d399]"
                                                : "bg-white",
                                        )}
                                    >
                                        <td className="px-5 py-5">
                                            <InvoiceTypePill invoice={invoice} />

                                            <p className="mt-2 font-extrabold text-cyan-700">
                                                {invoice.invoice_number}
                                            </p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">
                                                Verkauf: {invoice.sale_id}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-bold text-slate-950">
                                                {invoice.customer_name}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-bold text-slate-950">
                                                {invoice.vehicle_name}
                                            </p>
                                            <p className="mt-1 font-mono text-xs font-semibold text-slate-500">
                                                {invoice.vin}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="text-sm font-semibold text-slate-700">
                                                {formatDate(invoice.invoice_date)}
                                            </p>
                                            <p className="mt-1 text-xs font-medium text-slate-500">
                                                Fällig: {formatDate(invoice.due_date)}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-slate-950">
                                                {formatCurrency(invoice.net_amount)}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-slate-950">
                                                {formatCurrency(invoice.vat_amount)}
                                            </p>
                                            <p className="mt-1 text-xs font-medium text-slate-500">
                                                {invoice.vat_rate}%
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-slate-950">
                                                {formatCurrency(invoice.gross_amount)}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <StatusBadge
                                                tone={getInvoicePaymentStatusTone(
                                                    invoice.payment_status,
                                                )}
                                            >
                                                {getInvoicePaymentStatusLabel(invoice.payment_status)}
                                            </StatusBadge>
                                        </td>

                                        <td className="px-5 py-5">
                                            <StatusBadge
                                                tone={getInvoiceDatevStatusTone(invoice.datev_status)}
                                            >
                                                {getInvoiceDatevStatusLabel(invoice.datev_status)}
                                            </StatusBadge>
                                        </td>

                                        <td
                                            className="px-5 py-5"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <div className="flex justify-end gap-2">
                                                <MarkInvoicePaidButton invoice={invoice} />

                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-xl font-bold"
                                                >
                                                    <Link href={`/dashboard/sales/${invoice.sale_id}`}>
                                                        Öffnen
                                                        <ArrowUpRight className="ml-1 size-3.5" />
                                                    </Link>
                                                </Button>

                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-xl font-bold"
                                                >
                                                    <Link
                                                        href={`/api/invoices/${invoice.id}/pdf`}
                                                        target="_blank"
                                                    >
                                                        <ExternalLink className="mr-1 size-3.5" />
                                                        PDF
                                                    </Link>
                                                </Button>

                                                <Button
                                                    asChild
                                                    size="sm"
                                                    className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                                >
                                                    <Link href={`/api/invoices/${invoice.id}/pdf?download=1`}>
                                                        <Download className="mr-1 size-3.5" />
                                                        Download
                                                    </Link>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>

                            {filteredInvoices.length === 0 ? <EmptyInvoicesState /> : null}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function InvoiceFilterButton({
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

function InvoiceTypePill({ invoice }: { invoice: InvoiceRow }) {
    const classes = {
        standard: "border-cyan-100 bg-cyan-50 text-cyan-700",
        proforma: "border-violet-100 bg-violet-50 text-violet-700",
        down_payment: "border-emerald-100 bg-emerald-50 text-emerald-700",
        cancellation_invoice: "border-red-100 bg-red-50 text-red-700",
        credit_note: "border-amber-100 bg-amber-50 text-amber-700",
    };

    return (
        <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${classes[invoice.invoice_type]}`}
        >
            {getInvoiceTypeLabel(invoice.invoice_type)}
        </span>
    );
}

type InvoiceStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Receipt;
    danger?: boolean;
};

function InvoiceStatCard({
                             label,
                             value,
                             description,
                             icon: Icon,
                             danger = false,
                         }: InvoiceStatCardProps) {
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

function InvoiceMobileInfoBox({
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
            <p className="mt-1 text-sm font-extrabold text-slate-950">{value}</p>
        </div>
    );
}

function MarkInvoicePaidButton({ invoice }: { invoice: InvoiceRow }) {
    if (invoice.invoice_type === "proforma") {
        return null;
    }

    return (
        <Button
            asChild
            variant={invoice.payment_status === "paid" ? "outline" : "default"}
            size="sm"
            className={
                invoice.payment_status === "paid"
                    ? "rounded-xl border-emerald-200 bg-emerald-50 font-bold text-emerald-700"
                    : "rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
            }
        >
            <Link href={`/dashboard/sales/${invoice.sale_id}#payments`}>
                {invoice.payment_status === "paid" ? "Zahlungen öffnen" : "Zahlung erfassen"}
            </Link>
        </Button>
    );
}

function EmptyInvoicesState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <Receipt className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Rechnungen gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Passe deine Suche an oder setze den Filter zurück.
            </p>
        </div>
    );
}
