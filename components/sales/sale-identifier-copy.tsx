"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

async function copyText(value: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch {
            // Mobile browsers can require the synchronous selection fallback.
        }
    }

    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = value;
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    temporaryInput.style.pointerEvents = "none";
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    temporaryInput.setSelectionRange(0, value.length);

    const copied = document.execCommand("copy");
    temporaryInput.remove();
    return copied;
}

export function SaleIdentifierCopy({ identifier }: { identifier: string }) {
    const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

    async function handleCopy() {
        const copied = await copyText(identifier);
        setStatus(copied ? "copied" : "error");
    }

    return (
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        Verkaufskennung
                    </p>
                    <p className="mt-0.5 break-all text-base font-extrabold tabular-nums text-slate-950">
                        {identifier}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    aria-describedby={status === "error" ? "sale-identifier-copy-error" : undefined}
                    className="w-full shrink-0 rounded-xl border-slate-200 bg-white font-bold text-cyan-900 hover:border-cyan-200 hover:bg-cyan-50 sm:w-auto"
                >
                    {status === "copied" ? (
                        <Check className="size-4 text-emerald-700" />
                    ) : (
                        <Copy className="size-4" />
                    )}
                    {status === "copied" ? "Kopiert" : "Kennung kopieren"}
                </Button>
            </div>
            {status === "error" ? (
                <p
                    id="sale-identifier-copy-error"
                    role="status"
                    className="mt-2 text-sm font-semibold text-red-700"
                >
                    Die Verkaufskennung konnte nicht kopiert werden.
                </p>
            ) : null}
        </div>
    );
}
