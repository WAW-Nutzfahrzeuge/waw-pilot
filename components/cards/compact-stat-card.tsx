import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CompactStatTone = "default" | "success" | "warning" | "danger" | "info" | "neutral";

type CompactStatCardProps = {
    label: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    tone?: CompactStatTone;
    href?: string;
    className?: string;
};

const toneClasses: Record<CompactStatTone, string> = {
    default: "border-cyan-100 bg-cyan-50 text-cyan-700",
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    danger: "border-red-100 bg-red-50 text-red-700",
    info: "border-cyan-100 bg-cyan-50 text-cyan-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function CompactStatCard({
    label,
    value,
    description,
    icon: Icon,
    tone = "default",
    href,
    className,
}: CompactStatCardProps) {
    const card = (
        <Card
            className={cn(
                "group h-full rounded-[1.25rem] border-slate-200 bg-white/90 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/80",
                className,
            )}
        >
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-500">
                            {label}
                        </p>
                        <p className="mt-2 break-words text-lg font-extrabold tracking-tight text-slate-950 xl:text-xl">
                            {value}
                        </p>
                        {description ? (
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                {description}
                            </p>
                        ) : null}
                    </div>

                    <div
                        className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-xl border",
                            toneClasses[tone],
                        )}
                    >
                        <Icon className="size-4" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    if (!href) return card;

    return <Link href={href}>{card}</Link>;
}
