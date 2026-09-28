"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

async function copyToClipboard(value: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch {
            // Some mobile browsers only permit the legacy fallback in this context.
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

type CompanyTaxNumberCopyButtonProps = {
    taxNumber: string | null;
};

export function CompanyTaxNumberCopyButton({
    taxNumber,
}: CompanyTaxNumberCopyButtonProps) {
    const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
    const normalizedTaxNumber = taxNumber?.trim() ?? "";
    const isConfigured = normalizedTaxNumber.length > 0;

    async function handleCopy() {
        if (!isConfigured) return;

        const copied = await copyToClipboard(normalizedTaxNumber);
        setCopyState(copied ? "copied" : "error");
    }

    const label = !isConfigured
        ? "WAW-Steuernummer nicht hinterlegt"
        : copyState === "copied"
          ? "WAW-Steuernummer kopiert"
          : "WAW-Steuernummer kopieren";

    return (
        <div className="space-y-1.5">
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isConfigured}
                onClick={handleCopy}
                aria-describedby={copyState === "error" ? "company-tax-number-copy-error" : undefined}
                className="w-full justify-start rounded-xl border-slate-200 bg-white text-cyan-900 hover:border-cyan-200 hover:bg-cyan-50"
            >
                {copyState === "copied" ? (
                    <Check className="size-3.5 text-emerald-700" />
                ) : (
                    <Copy className="size-3.5" />
                )}
                {label}
            </Button>
            {copyState === "error" ? (
                <p
                    id="company-tax-number-copy-error"
                    role="status"
                    className="text-xs font-semibold text-red-700"
                >
                    Die Steuernummer konnte nicht kopiert werden.
                </p>
            ) : null}
        </div>
    );
}
