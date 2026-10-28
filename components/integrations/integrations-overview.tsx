import Link from "next/link";
import {
    ArrowUpRight,
    Cloud,
    Database,
    FileSpreadsheet,
    Mail,
    PackageCheck,
    Plug,
    ReceiptText,
    Truck,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Card, CardContent } from "@/components/ui/card";

const integrations = [
    {
        title: "Berichte / CSV Export",
        description:
            "Berichte können bereits als CSV exportiert und in Excel, Numbers oder an Steuerberater weitergegeben werden.",
        status: "active",
        statusLabel: "Aktiv",
        icon: FileSpreadsheet,
        href: "/dashboard/reports",
    },
    {
        title: "Supabase Storage",
        description:
            "Dokumente, Rechnungen, Ankaufsunterlagen und Kennzeichen-Dateien werden zentral im Storage gespeichert.",
        status: "active",
        statusLabel: "Aktiv",
        icon: Cloud,
        href: "/dashboard/documents",
    },
    {
        title: "DATEV Export",
        description:
            "Export von Rechnungen, Kassenbuch und Belegen für Steuerberater. Noch nicht angebunden.",
        status: "planned",
        statusLabel: "Geplant",
        icon: ReceiptText,
        href: "/dashboard/reports",
    },
    {
        title: "E-Mail Versand",
        description:
            "Späterer Versand von Rechnungen, Proforma-Rechnungen oder Dokumenten direkt aus der Software.",
        status: "planned",
        statusLabel: "Geplant",
        icon: Mail,
        href: "/dashboard/settings",
    },
    {
        title: "DHL / Versand",
        description:
            "Spätere Versand- und Tracking-Integration für Dokumente oder Fahrzeugunterlagen.",
        status: "planned",
        statusLabel: "Geplant",
        icon: PackageCheck,
        href: "/dashboard/integrations",
    },
    {
        title: "Fahrzeugbörsen",
        description:
            "Spätere Anbindung an mobile.de, AutoScout24 oder weitere Plattformen für Bestandsveröffentlichung.",
        status: "planned",
        statusLabel: "Geplant",
        icon: Truck,
        href: "/dashboard/vehicles",
    },
];

export function IntegrationsOverview() {
    const activeIntegrations = integrations.filter(
        (integration) => integration.status === "active",
    ).length;

    const plannedIntegrations = integrations.filter(
        (integration) => integration.status === "planned",
    ).length;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Schnittstellen"
                title="Integrationen"
                description="Übersicht über aktive und geplante Schnittstellen für Export, Dokumente, E-Mail, Versand und externe Systeme."
            />

            <section className="grid gap-4 md:grid-cols-3">
                <IntegrationStatCard
                    label="Aktiv"
                    value={activeIntegrations}
                    description="bereits nutzbare Schnittstellen"
                    icon={Plug}
                    tone="success"
                />
                <IntegrationStatCard
                    label="Geplant"
                    value={plannedIntegrations}
                    description="für spätere Ausbaustufen"
                    icon={Database}
                    tone="warning"
                />
                <IntegrationStatCard
                    label="Module"
                    value={integrations.length}
                    description="Schnittstellenbereiche"
                    icon={Cloud}
                    tone="info"
                />
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {integrations.map((integration) => (
                    <Link
                        key={integration.title}
                        href={integration.href}
                        className="group block"
                    >
                        <Card className="h-full rounded-3xl border-slate-200 bg-white/90 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/80">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                        <integration.icon className="size-5" />
                                    </div>

                                    <StatusBadge
                                        tone={
                                            integration.status === "active"
                                                ? "success"
                                                : "warning"
                                        }
                                    >
                                        {integration.statusLabel}
                                    </StatusBadge>
                                </div>

                                <h2 className="mt-5 text-lg font-extrabold text-slate-950">
                                    {integration.title}
                                </h2>
                                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                                    {integration.description}
                                </p>

                                <div className="mt-5 flex items-center text-sm font-extrabold text-cyan-700">
                                    Öffnen
                                    <ArrowUpRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </section>
        </div>
    );
}

function IntegrationStatCard({
                                 label,
                                 value,
                                 description,
                                 icon: Icon,
                                 tone,
                             }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Plug;
    tone: "success" | "warning" | "info";
}) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={tone}
        />
    );
}
