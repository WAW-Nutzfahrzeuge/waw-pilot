"use client";

import { useEffect, useState } from "react";

import { ActionMessage } from "@/components/shared/action-message";

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
    const messageKey = `${tone}:${message}:${description ?? ""}`;
    const [hiddenMessageKey, setHiddenMessageKey] = useState<string | null>(null);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setHiddenMessageKey(messageKey);
        }, durationMs);

        return () => window.clearTimeout(timeoutId);
    }, [durationMs, messageKey]);

    if (hiddenMessageKey === messageKey) return null;

    return <ActionMessage title={message} description={description} tone={tone} />;
}
