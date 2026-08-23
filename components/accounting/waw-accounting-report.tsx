"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import type {
    AccountingReportItem,
    AccountingReportStatus,
} from "@/lib/accounting/accounting-report";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/tables/empty-state";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type StatusFilter = "all" | "found" | "missing" | "requested" | "sent" | "manual";

const statusLabels: Record<string, string> = {
    NEW: "Neu",
    SEARCHING: "Beleg wird gesucht",
    FOUND: "Beleg gefunden",
    REQUEST_NEEDED: "Beleg fehlt",
    REQUEST_SENT: "Angefragt",
    RECEIVED: "Beleg eingegangen",
    SENT_TO_DATEV: "An DATEV gesendet",
    MANUAL_REVIEW: "Manuelle Prüfung",
};

function getStatusLabel(status: AccountingReportStatus): string {
    const normalizedStatus = status.trim().toUpperCase();
    return statusLabels[normalizedStatus] ?? `Unbekannt (${normalizedStatus || "-"})`;
}

function getStatusTone(status: AccountingReportStatus): "success" | "warning" | "error" | "info" | "neutral" {
    switch (status.trim().toUpperCase()) {
        case "FOUND":
        case "RECEIVED":
            return "success";
        case "REQUEST_NEEDED":
        case "REQUEST_SENT":
            return "warning";
        case "MANUAL_REVIEW":
            return "error";
        case "SENT_TO_DATEV":
            return "info";
        default:
            return "neutral";
    }
}

function matchesStatusFilter(item: AccountingReportItem, filter: StatusFilter): boolean {
    const status = item.status.trim().toUpperCase();

    switch (filter) {
        case "found":
            return status === "FOUND" || status === "RECEIVED";
        case "missing":
            return status === "REQUEST_NEEDED";
        case "requested":
            return status === "REQUEST_SENT";
        case "sent":
            return status === "SENT_TO_DATEV";
        case "manual":
            return status === "MANUAL_REVIEW";
        default:
            return true;
    }
}

function getSearchText(item: AccountingReportItem): string {
    return [item.counterparty, item.purpose, item.amount, item.supplierEmail]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();
}

export function WawAccountingReport() {
    const [items, setItems] = useState<AccountingReportItem[]>([]);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const requestItems = useCallback(async (): Promise<AccountingReportItem[]> => {
        const response = await fetch("/api/accounting/waw/items", {
            method: "GET",
            cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as {
            success?: boolean;
            items?: AccountingReportItem[];
        } | null;

        if (!response.ok || !result?.success || !Array.isArray(result.items)) {
            throw new Error("Buchhaltungsdaten konnten nicht geladen werden.");
        }

        return result.items;
    }, []);

    const refreshItems = useCallback(async () => {
        setIsLoading(true);
        setErrorMessage(null);

        try {
            setItems(await requestItems());
        } catch {
            setErrorMessage("Buchhaltungsdaten konnten nicht geladen werden.");
        } finally {
            setIsLoading(false);
        }
    }, [requestItems]);

    useEffect(() => {
        let isActive = true;

        requestItems()
            .then((nextItems) => {
                if (isActive) setItems(nextItems);
            })
            .catch(() => {
                if (isActive) {
                    setErrorMessage("Buchhaltungsdaten konnten nicht geladen werden.");
                }
            })
            .finally(() => {
                if (isActive) setIsLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [requestItems]);

    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return items.filter((item) => {
            if (!matchesStatusFilter(item, statusFilter)) return false;
            if (!normalizedQuery) return true;

            return getSearchText(item).includes(normalizedQuery);
        });
    }, [items, query, statusFilter]);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <CardTitle>Belegstatus</CardTitle>
                        <CardDescription>
                            Buchhaltungsvorgänge aus dem WAW-Report. Die Beleganzahl laut DATEV ist nur eine Information.
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void refreshItems()}
                        disabled={isLoading}
                        className="rounded-2xl bg-white font-bold"
                    >
                        {isLoading ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 size-4" />
                        )}
                        Aktualisieren
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Lieferant, Zweck, Betrag oder E-Mail suchen"
                            aria-label="Buchhaltungsdaten durchsuchen"
                            className="h-11 rounded-2xl pl-10"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                        aria-label="Status filtern"
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-400 focus:ring-3 focus:ring-cyan-500/15"
                    >
                        <option value="all">Alle</option>
                        <option value="found">Beleg gefunden</option>
                        <option value="missing">Beleg fehlt</option>
                        <option value="requested">Angefragt</option>
                        <option value="sent">An DATEV gesendet</option>
                        <option value="manual">Manuelle Prüfung</option>
                    </select>
                </div>

                {isLoading ? (
                    <div className="flex min-h-44 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                        <Loader2 className="size-6 animate-spin text-cyan-700" />
                        <span className="ml-2 text-sm font-bold text-slate-600">Buchhaltungsdaten werden geladen...</span>
                    </div>
                ) : errorMessage ? (
                    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                        {errorMessage}
                    </div>
                ) : items.length === 0 ? (
                    <EmptyState title="Noch keine DATEV-Buchungen vorhanden." />
                ) : filteredItems.length === 0 ? (
                    <EmptyState title="Keine passenden Buchhaltungsdaten gefunden." description="Passe die Suche oder den Statusfilter an." />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Lieferant</TableHead>
                                <TableHead>Buchungsdatum</TableHead>
                                <TableHead className="text-right">Betrag</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Belege laut DATEV</TableHead>
                                <TableHead>E-Mail / Beleg</TableHead>
                                <TableHead>DATEV</TableHead>
                                <TableHead>Aktion</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredItems.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="max-w-56 whitespace-normal">
                                        <p className="font-extrabold text-slate-950">{item.counterparty ?? "Unbekannter Lieferant"}</p>
                                        {item.purpose ? <p className="mt-1 text-xs font-medium text-slate-500">{item.purpose}</p> : null}
                                    </TableCell>
                                    <TableCell>{formatDate(item.bookingDate)}</TableCell>
                                    <TableCell className="text-right font-extrabold">{formatCurrency(item.amount)}</TableCell>
                                    <TableCell><StatusBadge tone={getStatusTone(item.status)}>{getStatusLabel(item.status)}</StatusBadge></TableCell>
                                    <TableCell className="font-bold">{item.documentCount ?? "-"}</TableCell>
                                    <TableCell className="max-w-64 whitespace-normal">
                                        {item.matchedAttachmentName ? <p className="font-bold text-slate-800">{item.matchedAttachmentName}</p> : <p className="text-slate-400">Kein Beleg zugeordnet</p>}
                                        {item.supplierEmail ? <p className="mt-1 break-all text-xs font-medium text-slate-500">{item.supplierEmail}</p> : null}
                                    </TableCell>
                                    <TableCell><StatusBadge tone={item.sentToDatevAt ? "success" : "neutral"}>{item.sentToDatevAt ? "Gesendet" : "Offen"}</StatusBadge></TableCell>
                                    <TableCell><Button type="button" variant="outline" size="sm" disabled>Details</Button></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
