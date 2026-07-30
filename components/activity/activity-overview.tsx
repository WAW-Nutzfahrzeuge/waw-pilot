"use client";

import { useMemo, useState } from "react";
import { Activity, Clock3, Search, UserRound } from "lucide-react";

import type { ActivityLogRow } from "@/lib/activity/activity-queries";
import { PageHeader } from "@/components/shared/page-header";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ActivityOverviewProps = {
    activities: ActivityLogRow[];
};

type ActivityOverviewItem = ActivityLogRow & {
    displayDate: string;
    entityLabel: string;
    userInitials: string;
    searchableText: string;
};

function formatActivityDate(value: string): string {
    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function getEntityLabel(entityType: string | null): string {
    const labels: Record<string, string> = {
        customer: "Kunde",
        sale: "Verkauf",
        invoice: "Rechnung",
        document: "Dokument",
        vehicle: "Fahrzeug",
    };

    if (!entityType) return "System";

    return labels[entityType] ?? entityType;
}

export function ActivityOverview({ activities }: ActivityOverviewProps) {
    const [query, setQuery] = useState("");

    const activityItems = useMemo<ActivityOverviewItem[]>(() => {
        return activities.map((activityLog) => {
            const displayDate = formatActivityDate(activityLog.created_at);
            const entityLabel = getEntityLabel(activityLog.entity_type);
            const userInitials = activityLog.user_name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

            return {
                ...activityLog,
                displayDate,
                entityLabel,
                userInitials,
                searchableText: [
                    activityLog.user_name,
                    activityLog.action,
                    activityLog.entity_type,
                    entityLabel,
                    displayDate,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase(),
            };
        });
    }, [activities]);

    const activityStats = useMemo(() => {
        return {
            userCount: new Set(activityItems.map((item) => item.user_name)).size,
            lastActivityDate: activityItems[0]?.displayDate ?? "—",
        };
    }, [activityItems]);

    const filteredActivities = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) return activityItems;

        return activityItems.filter((activityLog) => activityLog.searchableText.includes(normalizedQuery));
    }, [activityItems, query]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Aktivitätsverlauf"
                title="Aktivitäten"
                description="Nachvollziehbare Änderungen und Systemaktionen: Wer hat wann was gemacht?"
            />

            <section className="grid gap-4 md:grid-cols-3">
                <ActivityStatCard
                    label="Aktivitäten"
                    value={activities.length}
                    description="letzte 200 Einträge"
                    icon={Activity}
                    tone="cyan"
                />
                <ActivityStatCard
                    label="Benutzer"
                    value={activityStats.userCount}
                    description="mit erfassten Aktionen"
                    icon={UserRound}
                    tone="emerald"
                />
                <ActivityStatCard
                    label="Letzte Aktion"
                    value={activityStats.lastActivityDate}
                    description="aktuellster Eintrag"
                    icon={Clock3}
                    tone="amber"
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Verlauf
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Suche nach Benutzer, Aktion, Zeitpunkt oder Bereich.
                                </p>
                            </div>

                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Aktivität suchen..."
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 p-4 md:hidden">
                        {filteredActivities.map((activityLog) => (
                            <div
                                key={activityLog.id}
                                className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                                            {activityLog.entityLabel}
                                        </p>
                                        <p className="mt-2 text-sm font-bold text-slate-500">
                                            {activityLog.displayDate}
                                        </p>
                                    </div>

                                    <div className="flex size-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                                        <Activity className="size-4" />
                                    </div>
                                </div>

                                <p className="mt-4 text-base font-extrabold text-slate-950">
                                    {activityLog.action}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-500">
                                    Benutzer: {activityLog.user_name}
                                </p>
                            </div>
                        ))}

                        {filteredActivities.length === 0 ? <EmptyActivityState /> : null}
                    </div>

                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full min-w-[900px] text-left">
                            <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-5 py-4">Zeitpunkt</th>
                                <th className="px-5 py-4">Benutzer</th>
                                <th className="px-5 py-4">Aktion</th>
                            </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100">
                            {filteredActivities.map((activityLog) => (
                                <tr
                                    key={activityLog.id}
                                    className="bg-white transition-colors hover:bg-cyan-50/30"
                                >
                                    <td className="whitespace-nowrap px-5 py-5">
                                        <p className="font-extrabold text-slate-950">
                                            {activityLog.displayDate}
                                        </p>
                                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                                            {activityLog.entityLabel}
                                        </p>
                                    </td>

                                    <td className="px-5 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                                                {activityLog.userInitials}
                                            </div>
                                            <p className="font-extrabold text-slate-950">
                                                {activityLog.user_name}
                                            </p>
                                        </div>
                                    </td>

                                    <td className="px-5 py-5">
                                        <p className="font-bold text-slate-700">
                                            {activityLog.action}
                                        </p>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>

                        {filteredActivities.length === 0 ? <EmptyActivityState /> : null}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function ActivityStatCard({
                              label,
                              value,
                              description,
                              icon: Icon,
                              tone,
                          }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Activity;
    tone: "cyan" | "emerald" | "amber";
}) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={tone === "cyan" ? "info" : tone === "amber" ? "warning" : "success"}
        />
    );
}

function EmptyActivityState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <Activity className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Aktivitäten gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Sobald Verkäufe, Kunden oder Rechnungen angelegt werden, erscheinen die
                Aktionen hier.
            </p>
        </div>
    );
}
