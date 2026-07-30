"use client";

import { type ReactNode, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type TemporaryHighlightProps = {
    active?: boolean;
    children: ReactNode;
    className?: string;
};

export function useTemporaryHighlight<TValue>(
    activeValue: TValue | null | undefined,
    timeoutMs = 3000,
): TValue | undefined {
    const [visibleValue, setVisibleValue] = useState<TValue | undefined>(
        activeValue ?? undefined,
    );

    useEffect(() => {
        const startTimeoutId = window.setTimeout(() => {
            setVisibleValue(activeValue ?? undefined);
        }, 0);

        if (!activeValue) {
            return () => window.clearTimeout(startTimeoutId);
        }

        const timeoutId = window.setTimeout(() => {
            setVisibleValue(undefined);
        }, timeoutMs);

        return () => {
            window.clearTimeout(startTimeoutId);
            window.clearTimeout(timeoutId);
        };
    }, [activeValue, timeoutMs]);

    return visibleValue;
}

export function TemporaryHighlight({
    active = false,
    children,
    className,
}: TemporaryHighlightProps) {
    const [visible, setVisible] = useState(active);

    useEffect(() => {
        const startTimeoutId = window.setTimeout(() => {
            setVisible(active);
        }, 0);

        if (!active) {
            return () => window.clearTimeout(startTimeoutId);
        }

        const timeoutId = window.setTimeout(() => {
            setVisible(false);
        }, 3000);

        return () => {
            window.clearTimeout(startTimeoutId);
            window.clearTimeout(timeoutId);
        };
    }, [active]);

    return (
        <div
            className={cn(
                "rounded-[1.85rem] transition-all duration-500",
                visible ? "bg-emerald-50/70 p-1 ring-2 ring-emerald-300 shadow-lg shadow-emerald-900/10" : "p-0",
                className,
            )}
        >
            {children}
        </div>
    );
}
