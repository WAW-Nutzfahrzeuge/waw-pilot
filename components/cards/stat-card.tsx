import type { LucideIcon } from "lucide-react";

import { CompactStatCard } from "@/components/cards/compact-stat-card";

type StatCardProps = {
    label: string;
    value: string | number;
    description?: string;
    icon?: LucideIcon;
    tone?: "default" | "success" | "warning" | "danger";
};

export function StatCard({
                             label,
                             value,
                             description,
                             icon: Icon,
                             tone = "default",
                         }: StatCardProps) {
    const FallbackIcon = Icon;

    if (!FallbackIcon) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <p className="truncate text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-2 break-words text-lg font-extrabold tracking-tight text-slate-950 xl:text-xl">
                    {value}
                </p>
                {description ? (
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        {description}
                    </p>
                ) : null}
            </div>
        );
    }

    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description ?? ""}
            icon={FallbackIcon}
            tone={tone === "default" ? "default" : tone}
        />
    );
}
