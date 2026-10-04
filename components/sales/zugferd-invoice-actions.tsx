"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import {
    createZugferdInvoiceAction,
    sendZugferdInvoiceEmailAction,
} from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type ZugferdInvoiceActionsProps = {
    saleId: string;
    invoiceId: string;
    isValidated: boolean;
    isGenerationPending: boolean;
    isServiceConfigured: boolean;
};

export function ZugferdInvoiceActions({
    saleId,
    invoiceId,
    isValidated,
    isGenerationPending,
    isServiceConfigured,
}: ZugferdInvoiceActionsProps) {
    const router = useRouter();

    useEffect(() => {
        if (!isGenerationPending) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const poll = async () => {
            try {
                const response = await fetch(`/api/invoices/${invoiceId}/zugferd/status`, {
                    cache: "no-store",
                });
                const result = (await response.json()) as { status?: string };
                if (!cancelled && result.status !== "pending") {
                    router.refresh();
                    return;
                }
            } catch {
                // A following poll retries a transient network interruption.
            }
            if (!cancelled) timer = setTimeout(poll, 4_000);
        };

        timer = setTimeout(poll, 1_000);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [invoiceId, isGenerationPending, router]);

    if (isGenerationPending) {
        return (
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600" aria-live="polite">
                <Loader2 className="size-4 animate-spin text-cyan-700" />
                E-Rechnung wird im Hintergrund erstellt und geprüft …
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            <form action={createZugferdInvoiceAction}>
                <input type="hidden" name="sale_id" value={saleId} />
                <input type="hidden" name="invoice_id" value={invoiceId} />
                <CreateButton
                    isValidated={isValidated}
                    isServiceConfigured={isServiceConfigured}
                />
            </form>

            {isValidated ? (
                <form action={sendZugferdInvoiceEmailAction}>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_id" value={invoiceId} />
                    <SendButton />
                </form>
            ) : null}
        </div>
    );
}

function CreateButton({
    isValidated,
    isServiceConfigured,
}: {
    isValidated: boolean;
    isServiceConfigured: boolean;
}) {
    return (
        <PendingSubmitButton
            disabled={!isServiceConfigured}
            iconName="file-plus"
            label={isValidated ? "Neu erstellen und prüfen" : "ZUGFeRD erstellen und prüfen"}
            pendingLabel="ZUGFeRD wird vorbereitet..."
            variant="outline"
            className="rounded-2xl bg-white font-bold"
            title={
                isServiceConfigured
                    ? undefined
                    : "ZUGFeRD-Service ist noch nicht eingerichtet."
            }
        />
    );
}

function SendButton() {
    return (
        <PendingSubmitButton
            iconName="mail"
            label="ZUGFeRD per E-Mail senden"
            pendingLabel="Wird gesendet..."
            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
        />
    );
}
