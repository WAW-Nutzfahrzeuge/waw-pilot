"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileWarning } from "lucide-react";

type FlashMessageProps = {
    message: string;
    description?: string;
    durationMs?: number;
    tone?: "success" | "danger";
};

export function FlashMessage({
                                 message,
                                 description,
                                 durationMs = 3000,
                                 tone = "success",
                             }: FlashMessageProps) {
    const [visible, setVisible] = useState(true);
    const Icon = tone === "danger" ? FileWarning : CheckCircle2;
    const styles =
        tone === "danger"
            ? {
                container: "border-red-200 bg-red-50",
                iconBox: "bg-red-100 text-red-700",
                title: "text-red-950",
                description: "text-red-800",
            }
            : {
                container: "border-emerald-200 bg-emerald-50",
                iconBox: "bg-emerald-100 text-emerald-700",
                title: "text-emerald-950",
                description: "text-emerald-800",
            };

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setVisible(false);
        }, durationMs);

        return () => window.clearTimeout(timeoutId);
    }, [durationMs]);

    if (!visible) return null;

    return (
        <div className={`rounded-[1.5rem] border p-4 shadow-sm ${styles.container}`}>
            <div className="flex items-start gap-3">
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${styles.iconBox}`}>
                    <Icon className="size-5" />
                </div>

                <div>
                    <p className={`font-extrabold ${styles.title}`}>{message}</p>

                    {description ? (
                        <p className={`mt-1 text-sm font-semibold ${styles.description}`}>
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
