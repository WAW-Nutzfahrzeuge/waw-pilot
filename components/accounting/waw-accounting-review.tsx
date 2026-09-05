"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Mail, Save } from "lucide-react";

import type {
    AccountingReviewCounts,
    AccountingReviewItem,
    AccountingReviewStatus,
} from "@/lib/accounting/accounting-review";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/tables/empty-state";

type ReviewFilter = "all" | "contact" | "review" | "no-match" | "payment";

const statusLabels: Record<string, string> = {
    CONTACT_REVIEW: "Kontakt fehlt",
    REVIEW: "Prüfung erforderlich",
    NO_MATCH: "Kein Beleg gefunden",
    PAYMENT_REVIEW: "Zahlung prüfen",
};

function getStatusLabel(status: AccountingReviewStatus): string {
    const normalized = status.trim().toUpperCase();
    return statusLabels[normalized] ?? `Unbekannter Status (${normalized || "-"})`;
}

function getStatusTone(status: AccountingReviewStatus): "warning" | "error" | "neutral" {
    switch (status.trim().toUpperCase()) {
        case "CONTACT_REVIEW":
            return "warning";
        case "REVIEW":
            return "error";
        case "PAYMENT_REVIEW":
            return "warning";
        default:
            return "neutral";
    }
}

function matchesFilter(status: AccountingReviewStatus, filter: ReviewFilter): boolean {
    const normalized = status.trim().toUpperCase();
    if (filter === "contact") return normalized === "CONTACT_REVIEW";
    if (filter === "review") return normalized === "REVIEW";
    if (filter === "no-match") return normalized === "NO_MATCH";
    if (filter === "payment") return normalized === "PAYMENT_REVIEW";
    return true;
}

function getDateSortValue(value: string | null): number {
    if (!value) return 0;
    const germanDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
    if (germanDate) {
        return Date.UTC(Number(germanDate[3]), Number(germanDate[2]) - 1, Number(germanDate[1]));
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function displayDate(value: string | null): string {
    if (!value) return "-";
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) return value;
    return formatDate(value);
}

function getSearchText(item: AccountingReviewItem): string {
    return [item.counterparty, item.purpose, item.amount, item.supplierEmail]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();
}

const emptyCounts: AccountingReviewCounts = { total: 0, review: 0, contactReview: 0, noMatch: 0, paymentReview: 0 };

export function WawAccountingReview() {
    const [items, setItems] = useState<AccountingReviewItem[]>([]);
    const [counts, setCounts] = useState<AccountingReviewCounts>(emptyCounts);
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<ReviewFilter>("all");
    const [emails, setEmails] = useState<Record<number, string>>({});
    const [itemErrors, setItemErrors] = useState<Record<number, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [savingId, setSavingId] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const requestReview = useCallback(async () => {
        const response = await fetch("/api/accounting/waw/review", { method: "GET", cache: "no-store" });
        const result = (await response.json().catch(() => null)) as {
            success?: boolean;
            counts?: AccountingReviewCounts;
            items?: AccountingReviewItem[];
        } | null;

        if (!response.ok || !result?.success || !result.counts || !Array.isArray(result.items)) {
            throw new Error("Manuelle Buchhaltungsfälle konnten nicht geladen werden.");
        }

        setCounts(result.counts);
        setItems(result.items);
        setErrorMessage(null);
        setEmails((current) => {
            const next = { ...current };
            for (const item of result.items ?? []) {
                if (!(item.id in next)) next[item.id] = item.supplierEmail ?? "";
            }
            return next;
        });
    }, []);

    const refreshReview = useCallback(async () => {
        setIsLoading(true);
        setErrorMessage(null);
        try {
            await requestReview();
        } catch {
            setErrorMessage("Manuelle Prüfungsfälle konnten nicht geladen werden.");
        } finally {
            setIsLoading(false);
        }
    }, [requestReview]);

    useEffect(() => {
        void refreshReview();
    }, [refreshReview]);

    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return [...items]
            .filter((item) => matchesFilter(item.status, filter))
            .filter((item) => !normalizedQuery || getSearchText(item).includes(normalizedQuery))
            .sort((left, right) => {
                const priority = (status: AccountingReviewStatus) =>
                    status.toUpperCase() === "CONTACT_REVIEW"
                        ? 4
                        : status.toUpperCase() === "REVIEW"
                            ? 3
                            : status.toUpperCase() === "PAYMENT_REVIEW"
                                ? 2
                                : 1;
                return priority(right.status) - priority(left.status) || getDateSortValue(right.bookingDate) - getDateSortValue(left.bookingDate);
            });
    }, [filter, items, query]);

    async function saveSupplierEmail(item: AccountingReviewItem) {
        const email = (emails[item.id] ?? "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setItemErrors((current) => ({ ...current, [item.id]: "Bitte gib eine gültige E-Mail-Adresse ein." }));
            return;
        }

        setSavingId(item.id);
        setItemErrors((current) => ({ ...current, [item.id]: "" }));
        try {
            const response = await fetch("/api/accounting/waw/review/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "SAVE_SUPPLIER_EMAIL",
                    bookingId: item.id,
                    supplierName: item.counterparty ?? "",
                    email,
                }),
            });
            const result = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
            if (!response.ok || !result?.success) throw new Error(result?.message ?? "Die Lieferanten-E-Mail konnte nicht gespeichert werden.");
            await requestReview();
        } catch (error) {
            setItemErrors((current) => ({
                ...current,
                [item.id]: error instanceof Error ? error.message : "Die Lieferanten-E-Mail konnte nicht gespeichert werden.",
            }));
        } finally {
            setSavingId(null);
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <AlertTriangle className="size-5 text-amber-600" />
                            Manuelle Prüfung
                        </CardTitle>
                        <CardDescription>Offene WAW-Buchungsfälle, die nicht sicher automatisch verarbeitet werden konnten.</CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void refreshReview()} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                        Aktualisieren
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <SummaryCard label="Gesamt offen" value={counts.total} />
                    <SummaryCard label="Kontakt fehlt" value={counts.contactReview} tone="warning" />
                    <SummaryCard label="Prüfung erforderlich" value={counts.review} tone="error" />
                    <SummaryCard label="Kein Beleg gefunden" value={counts.noMatch} />
                    <SummaryCard label="Zahlung prüfen" value={counts.paymentReview} tone="warning" />
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lieferant, Zweck, Betrag oder E-Mail suchen" aria-label="Manuelle Buchhaltungsfälle durchsuchen" />
                    <select value={filter} onChange={(event) => setFilter(event.target.value as ReviewFilter)} aria-label="Manuelle Fälle filtern" className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-400 focus:ring-3 focus:ring-cyan-500/15">
                        <option value="all">Alle</option>
                        <option value="contact">Kontakt fehlt</option>
                        <option value="review">Prüfung</option>
                        <option value="no-match">Kein Match</option>
                        <option value="payment">Zahlung prüfen</option>
                    </select>
                </div>

                {isLoading ? (
                    <LoadingState />
                ) : errorMessage ? (
                    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</div>
                ) : items.length === 0 ? (
                    <EmptyState title="Keine offenen Buchhaltungsfälle vorhanden." />
                ) : filteredItems.length === 0 ? (
                    <EmptyState title="Keine passenden Prüfungsfälle gefunden." />
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-3 py-3">Lieferant / Gegenpartei</th>
                                    <th className="px-3 py-3">Buchungsdatum</th>
                                    <th className="px-3 py-3 text-right">Betrag</th>
                                    <th className="px-3 py-3">Status / Grund</th>
                                    <th className="px-3 py-3">Referenz</th>
                                    <th className="px-3 py-3">Lieferanten-E-Mail</th>
                                    <th className="px-3 py-3">Belege laut DATEV</th>
                                    <th className="px-3 py-3">DATEV</th>
                                    <th className="px-3 py-3">Aktion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((item) => (
                                    <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-cyan-50/30">
                                        <td className="max-w-56 px-3 py-4 whitespace-normal"><p className="font-extrabold text-slate-950">{item.counterparty ?? "Unbekannte Gegenpartei"}</p>{item.matchedAttachmentName ? <p className="mt-1 text-xs font-semibold text-slate-500">{item.matchedAttachmentName}</p> : null}</td>
                                        <td className="px-3 py-4 whitespace-nowrap">{displayDate(item.bookingDate)}</td>
                                        <td className="px-3 py-4 text-right font-extrabold whitespace-nowrap">{formatCurrency(item.amount)}</td>
                                        <td className="max-w-64 px-3 py-4 whitespace-normal"><StatusBadge tone={getStatusTone(item.status)}>{getStatusLabel(item.status)}</StatusBadge>{item.notes ? <p className="mt-2 text-xs font-medium text-slate-600">{item.notes}</p> : null}</td>
                                        <td className="max-w-64 px-3 py-4 whitespace-normal text-xs font-medium text-slate-600">{item.purpose ?? "-"}</td>
                                        <td className="min-w-64 px-3 py-4">{item.status.toUpperCase() === "CONTACT_REVIEW" ? <div className="space-y-2"><div className="flex gap-2"><Mail className="mt-2 size-4 shrink-0 text-slate-400" /><Input type="email" value={emails[item.id] ?? ""} onChange={(event) => setEmails((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`Lieferanten-E-Mail für ${item.counterparty ?? "Buchung"}`} placeholder="lieferant@beispiel.de" disabled={savingId === item.id} /><Button type="button" size="sm" onClick={() => void saveSupplierEmail(item)} disabled={savingId === item.id}>{savingId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}<span className="sr-only">Speichern</span></Button></div>{itemErrors[item.id] ? <p role="alert" className="text-xs font-bold text-red-700">{itemErrors[item.id]}</p> : null}</div> : item.supplierEmail || item.matchedEmail ? <span className="font-semibold text-slate-700">{item.supplierEmail ?? item.matchedEmail}</span> : <span className="text-slate-400">-</span>}</td>
                                        <td className="px-3 py-4 font-bold">{item.documentCount ?? "-"}</td>
                                        <td className="px-3 py-4"><StatusBadge tone={item.sentToDatevAt ? "success" : "neutral"}>{item.sentToDatevAt ? "Gesendet" : "Offen"}</StatusBadge></td>
                                        <td className="px-3 py-4"><Button type="button" variant="outline" size="sm" disabled>Details</Button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function SummaryCard({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "error" }) {
    const toneClass = tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "error" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50";
    return <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>;
}

function LoadingState() {
    return <div className="flex min-h-36 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50"><Loader2 className="size-6 animate-spin text-cyan-700" /><span className="ml-2 text-sm font-bold text-slate-600">Prüfungsfälle werden geladen...</span></div>;
}
