import { type ReactNode } from "react";
import { FileText } from "lucide-react";

import { AppBadge, type AppBadgeTone } from "@/components/shared/app-badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DocumentCardProps = {
    title: ReactNode;
    description?: ReactNode;
    meta?: ReactNode;
    status?: ReactNode;
    badge?: ReactNode;
    badgeTone?: AppBadgeTone;
    icon?: ReactNode;
    actions?: ReactNode;
    footer?: ReactNode;
    tone?: "default" | "success" | "warning" | "error" | "info";
    className?: string;
};

const toneClasses: Record<NonNullable<DocumentCardProps["tone"]>, string> = {
    default: "border-slate-200 bg-white",
    success: "border-emerald-200 bg-emerald-50/70",
    warning: "border-amber-200 bg-amber-50/70",
    error: "border-red-200 bg-red-50/70",
    info: "border-cyan-200 bg-cyan-50/70",
};

export function DocumentCard({
    title,
    description,
    meta,
    status,
    badge,
    badgeTone = "neutral",
    icon,
    actions,
    footer,
    tone = "default",
    className,
}: DocumentCardProps) {
    return (
        <Card className={cn("document-card rounded-2xl shadow-sm", toneClasses[tone], className)}>
            <CardContent className="p-4">
                <div className="document-card-layout">
                    <div className="document-card-info">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500">
                            {icon ?? <FileText className="size-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="min-w-0 whitespace-normal text-sm font-extrabold text-slate-950">{title}</h3>
                            {status || badge ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {status ? <span>{status}</span> : null}
                                    {badge ? <AppBadge tone={badgeTone}>{badge}</AppBadge> : null}
                                </div>
                            ) : null}
                            {description ? (
                                <p className="mt-1 whitespace-normal text-sm font-medium leading-6 text-slate-600">{description}</p>
                            ) : null}
                            {meta ? <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500">{meta}</p> : null}
                        </div>
                    </div>
                    {actions ? (
                        <div className="document-card-actions">
                            {actions}
                        </div>
                    ) : null}
                </div>
                {footer ? <div className="mt-4 border-t border-slate-200 pt-4">{footer}</div> : null}
            </CardContent>
        </Card>
    );
}
