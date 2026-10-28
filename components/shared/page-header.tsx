import type { ReactNode } from "react";

type PageHeaderProps = {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: ReactNode;
};

export function PageHeader({
                               eyebrow,
                               title,
                               description,
                               action,
                           }: PageHeaderProps) {
    return (
        <div className="mb-6 overflow-hidden rounded-2xl border border-white/70 bg-white/78 p-5 shadow-sm shadow-slate-200/70 backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    {eyebrow ? (
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black uppercase tracking-[0.28em] text-cyan-800">
                            <span className="size-1.5 rounded-full bg-cyan-500" />
                            <span>{eyebrow}</span>
                        </div>
                    ) : null}

                    <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                        {title}
                    </h1>

                    {description ? (
                        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                            {description}
                        </p>
                    ) : null}
                </div>

                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
        </div>
    );
}
