import { cn } from "@/lib/utils";

type StatusLegendTone = "success" | "warning" | "danger" | "info" | "neutral";

type StatusLegendItem = {
    tone: StatusLegendTone;
    label: string;
    description: string;
};

type StatusLegendProps = {
    title?: string;
    items?: StatusLegendItem[];
    className?: string;
    compact?: boolean;
};

const defaultItems: StatusLegendItem[] = [
    {
        tone: "success",
        label: "Grün",
        description: "Erledigt / vorhanden / bezahlt",
    },
    {
        tone: "warning",
        label: "Gelb",
        description: "Offen / prüfen / Aktion nötig",
    },
    {
        tone: "danger",
        label: "Rot",
        description: "Fehlt / Fehler / unvollständig",
    },
    {
        tone: "info",
        label: "Blau",
        description: "Info / erzeugbar / Systemhinweis",
    },
    {
        tone: "neutral",
        label: "Grau",
        description: "Neutral / nicht relevant",
    },
];

const toneClasses: Record<StatusLegendTone, string> = {
    success: "border-emerald-200 bg-emerald-500 shadow-emerald-900/15",
    warning: "border-amber-200 bg-amber-500 shadow-amber-900/15",
    danger: "border-red-200 bg-red-500 shadow-red-900/15",
    info: "border-cyan-200 bg-cyan-500 shadow-cyan-900/15",
    neutral: "border-slate-300 bg-slate-400 shadow-slate-900/10",
};

export function StatusLegend({
    title = "Statusfarben",
    items = defaultItems,
    className,
    compact = false,
}: StatusLegendProps) {
    return (
        <div
            className={cn(
                "rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm",
                className,
            )}
        >
            <div
                className={cn(
                    "flex flex-col gap-3",
                    compact ? "items-stretch" : "lg:flex-row lg:items-center",
                )}
            >
                <p className="shrink-0 text-xs font-black uppercase tracking-[0.24em] text-slate-500">
                    {title}
                </p>

                <div
                    className={cn(
                        "status-legend-grid grid flex-1 gap-2",
                        compact ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-5",
                    )}
                >
                    {items.map((item) => (
                        <div
                            key={`${item.tone}-${item.label}`}
                            className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                        >
                            <span
                                className={cn(
                                    "size-2.5 shrink-0 rounded-full border shadow-sm",
                                    toneClasses[item.tone],
                                )}
                            />
                            <div className="min-w-0">
                                <p className="truncate text-xs font-extrabold text-slate-800">
                                    {item.label}
                                </p>
                                <p className="truncate text-[0.72rem] font-semibold text-slate-500">
                                    {item.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
