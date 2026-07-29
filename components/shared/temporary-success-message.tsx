"use client";

import { useEffect, useState } from "react";

import { ActionMessage } from "@/components/shared/action-message";

type TemporarySuccessMessageProps = {
    title: string;
    description?: string;
    durationMs?: number;
};

export function TemporarySuccessMessage({
    title,
    description,
    durationMs = 3000,
}: TemporarySuccessMessageProps) {
    const messageKey = `${title}:${description ?? ""}`;
    const [hiddenMessageKey, setHiddenMessageKey] = useState<string | null>(null);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setHiddenMessageKey(messageKey);
        }, durationMs);

        return () => window.clearTimeout(timeoutId);
    }, [durationMs, messageKey]);

    if (hiddenMessageKey === messageKey) {
        return null;
    }

    return (
        <div className="mt-4">
            <ActionMessage title={title} description={description} compact />
        </div>
    );
}
