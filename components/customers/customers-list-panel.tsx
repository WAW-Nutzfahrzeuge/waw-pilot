"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
    ArrowUpRight,
    Building2,
    Mail,
    Phone,
    Search,
    User,
    Users,
} from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    getCustomerAddress,
    getCustomerDisplayName,
    getCustomerSubtitle,
    getCustomerTypeLabel,
    getCustomerTypeTone,
} from "@/lib/customers/customer-helpers";
import type { CustomerRow } from "@/lib/customers/customer-queries";
import { formatDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";

type CustomersListPanelProps = {
    customers: CustomerRow[];
    highlightedCustomerId?: string;
};

export function CustomersListPanel({
    customers,
    highlightedCustomerId,
}: CustomersListPanelProps) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [activeHighlightId, setActiveHighlightId] = useState(
        highlightedCustomerId,
    );

    useEffect(() => {
        const startTimeoutId = window.setTimeout(() => {
            setActiveHighlightId(highlightedCustomerId);
        }, 0);

        if (!highlightedCustomerId) {
            return () => window.clearTimeout(startTimeoutId);
        }

        const timeoutId = window.setTimeout(() => {
            setActiveHighlightId(undefined);
        }, 3000);

        return () => {
            window.clearTimeout(startTimeoutId);
            window.clearTimeout(timeoutId);
        };
    }, [highlightedCustomerId]);

    const filteredCustomers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) return customers;

        return customers.filter((customer) => {
            const searchableText = [
                customer.company_name,
                customer.owner_name,
                customer.first_name,
                customer.last_name,
                customer.street,
                customer.postal_code,
                customer.city,
                customer.country,
                customer.email,
                customer.phone,
                customer.tax_number,
                customer.vat_id,
                customer.commercial_register_number,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(normalizedQuery);
        });
    }, [query, customers]);

    return (
        <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="p-0">
                <div className="border-b border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Kundenliste
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Suche nach Firma, Ansprechpartner, Adresse, Steuerdaten oder Kontakt.
                            </p>
                        </div>

                        <div className="relative w-full xl:max-w-sm">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Kunden suchen..."
                                className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="grid gap-4 p-4 md:hidden">
                        {filteredCustomers.map((customer) => (
                            <div
                                key={customer.id}
                                onClick={() => {
                                    router.push(`/dashboard/customers/${customer.id}`);
                                }}
                                className={cn(
                                    "cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-500 active:scale-[0.99]",
                                    activeHighlightId === customer.id
                                        ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-300 shadow-lg shadow-emerald-900/10"
                                        : "hover:border-cyan-200 hover:bg-cyan-50/30",
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                            {customer.type === "company" ? (
                                                <Building2 className="size-5" />
                                            ) : (
                                                <User className="size-5" />
                                            )}
                                        </div>

                                        <div>
                                            <Link
                                                href={`/dashboard/customers/${customer.id}`}
                                                className="text-base font-extrabold text-slate-950 hover:text-cyan-700 hover:underline"
                                            >
                                                {getCustomerDisplayName(customer)}
                                            </Link>
                                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                                {getCustomerSubtitle(customer)}
                                            </p>
                                        </div>
                                    </div>

                                    <StatusBadge tone={getCustomerTypeTone(customer.type)}>
                                        {getCustomerTypeLabel(customer.type)}
                                    </StatusBadge>
                                </div>

                                <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                        Adresse
                                    </p>
                                    <p className="mt-1 text-sm font-bold leading-6 text-slate-700">
                                        {getCustomerAddress(customer)}
                                    </p>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <CustomerMobileInfoBox
                                        label="Fahrzeuge"
                                        value={String(customer.vehicles_count)}
                                    />
                                    <CustomerMobileInfoBox
                                        label="Verkäufe"
                                        value={String(customer.sales_count)}
                                    />
                                    <CustomerMobileInfoBox
                                        label="USt-ID"
                                        value={customer.vat_id ?? "—"}
                                    />
                                    <CustomerMobileInfoBox
                                        label="HRB"
                                        value={customer.commercial_register_number ?? "—"}
                                    />
                                </div>

                                <div className="mt-4 space-y-2 rounded-2xl border border-slate-100 p-3">
                                    {customer.email ? (
                                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                            <Mail className="size-3.5 text-slate-400" />
                                            {customer.email}
                                        </p>
                                    ) : null}

                                    {customer.phone ? (
                                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                            <Phone className="size-3.5 text-slate-400" />
                                            {customer.phone}
                                        </p>
                                    ) : null}

                                    {!customer.email && !customer.phone ? (
                                        <p className="text-sm font-semibold text-slate-400">
                                            Keine Kontaktdaten
                                        </p>
                                    ) : null}
                                </div>

                                <div
                                    className="mt-4 grid grid-cols-2 gap-2"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="h-11 rounded-2xl font-bold"
                                    >
                                        <Link href={`/dashboard/customers/${customer.id}`}>
                                            Kundenakte
                                        </Link>
                                    </Button>

                                    <Button
                                        asChild
                                        className="h-11 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                    >
                                        <Link href={`/dashboard/sales/new?customerId=${customer.id}`}>
                                            Verkauf
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        ))}

                        {filteredCustomers.length === 0 ? <CustomersEmptyState /> : null}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[1050px] text-left">
                            <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">Kunde</th>
                                    <th className="px-5 py-4">Adresse</th>
                                    <th className="px-5 py-4">Kontakt</th>
                                    <th className="px-5 py-4">Steuerdaten</th>
                                    <th className="px-5 py-4">Fahrzeuge</th>
                                    <th className="px-5 py-4">Angelegt</th>
                                    <th className="px-5 py-4 text-right">Aktionen</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100">
                                {filteredCustomers.map((customer) => (
                                    <tr
                                        key={customer.id}
                                        onClick={() => {
                                            router.push(`/dashboard/customers/${customer.id}`);
                                        }}
                                        className={cn(
                                            "group cursor-pointer transition-all duration-500 hover:bg-cyan-50/30",
                                            activeHighlightId === customer.id
                                                ? "bg-emerald-50 shadow-[inset_4px_0_0_#34d399]"
                                                : "bg-white",
                                        )}
                                    >
                                        <td className="px-5 py-5">
                                            <div className="flex items-start gap-3">
                                                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                                    {customer.type === "company" ? (
                                                        <Building2 className="size-5" />
                                                    ) : (
                                                        <User className="size-5" />
                                                    )}
                                                </div>

                                                <div>
                                                    <Link
                                                        href={`/dashboard/customers/${customer.id}`}
                                                        className="font-extrabold text-slate-950 hover:text-cyan-700 hover:underline"
                                                    >
                                                        {getCustomerDisplayName(customer)}
                                                    </Link>
                                                    <p className="mt-1 text-sm font-medium text-slate-500">
                                                        {getCustomerSubtitle(customer)}
                                                    </p>
                                                    <div className="mt-2">
                                                        <StatusBadge
                                                            tone={getCustomerTypeTone(customer.type)}
                                                        >
                                                            {getCustomerTypeLabel(customer.type)}
                                                        </StatusBadge>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="max-w-xs text-sm font-semibold leading-6 text-slate-700">
                                                {getCustomerAddress(customer)}
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <div className="space-y-2">
                                                {customer.email ? (
                                                    <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                                        <Mail className="size-3.5 text-slate-400" />
                                                        {customer.email}
                                                    </p>
                                                ) : null}

                                                {customer.phone ? (
                                                    <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                                        <Phone className="size-3.5 text-slate-400" />
                                                        {customer.phone}
                                                    </p>
                                                ) : null}

                                                {!customer.email && !customer.phone ? (
                                                    <p className="text-sm font-medium text-slate-400">
                                                        Keine Kontaktdaten
                                                    </p>
                                                ) : null}
                                            </div>
                                        </td>

                                        <td className="px-5 py-5">
                                            <div className="space-y-1 text-sm font-medium text-slate-600">
                                                <p>St.-Nr.: {customer.tax_number ?? "—"}</p>
                                                <p>USt-ID: {customer.vat_id ?? "—"}</p>
                                                <p>HRB: {customer.commercial_register_number ?? "—"}</p>
                                            </div>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="font-extrabold text-slate-950">
                                                {customer.vehicles_count}
                                            </p>
                                            <p className="mt-1 text-xs font-medium text-slate-500">
                                                {customer.sales_count} Verkäufe
                                            </p>
                                        </td>

                                        <td className="px-5 py-5">
                                            <p className="text-sm font-semibold text-slate-700">
                                                {formatDate(customer.created_at)}
                                            </p>
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
                                                    <Link href={`/dashboard/customers/${customer.id}`}>
                                                        Kundenakte
                                                    </Link>
                                                </Button>

                                                <Button
                                                    asChild
                                                    size="sm"
                                                    className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                                >
                                                    <Link
                                                        href={`/dashboard/sales/new?customerId=${customer.id}`}
                                                    >
                                                        Verkauf
                                                        <ArrowUpRight className="ml-1 size-3.5" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {filteredCustomers.length === 0 ? (
                            <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                                <CustomersEmptyStateContent />
                            </div>
                        ) : null}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function CustomersEmptyState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-[1.5rem] border border-slate-200 bg-white p-8 text-center">
            <CustomersEmptyStateContent />
        </div>
    );
}

function CustomersEmptyStateContent() {
    return (
        <>
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <Users className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Kunden gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Passe deine Suche an oder lege einen neuen Kunden an.
            </p>
        </>
    );
}

function CustomerMobileInfoBox({
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
            <p className="mt-1 break-words text-sm font-extrabold text-slate-950">
                {value}
            </p>
        </div>
    );
}
