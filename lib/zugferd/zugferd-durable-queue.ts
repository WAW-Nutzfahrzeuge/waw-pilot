import "server-only";

import { createHash } from "node:crypto";

import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import {
    buildCanonicalInvoiceData,
    ZugferdDataValidationError,
} from "@/lib/zugferd/canonical-invoice";
import { markZugferdInvalid } from "@/lib/zugferd/zugferd-generation-storage";

type QueuedJobRow = { job_id: string; job_status: string };

export type DurableZugferdQueueResult = {
    jobId: string | null;
    status: string;
    error?: string;
};

function normalizeRpcRow(value: unknown): QueuedJobRow | null {
    const row = Array.isArray(value) ? value[0] : value;
    if (!row || typeof row !== "object") return null;
    const candidate = row as Partial<QueuedJobRow>;
    return typeof candidate.job_id === "string" && typeof candidate.job_status === "string"
        ? candidate as QueuedJobRow
        : null;
}

async function wakeWorker(jobId: string): Promise<void> {
    const url = process.env.ZUGFERD_SERVICE_URL?.trim().replace(/\/+$/, "");
    const apiKey = process.env.ZUGFERD_SERVICE_API_KEY?.trim();
    if (!url || !apiKey) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    try {
        const response = await fetch(`${url}/wake`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
        });
        if (!response.ok) {
            console.warn("[zugferd] worker wake was not acknowledged", {
                jobId,
                status: response.status,
            });
        }
    } catch {
        // The durable row remains queued. A warm worker or the next wake can
        // claim it; do not fail standard invoice creation on a wake timeout.
        console.warn("[zugferd] worker wake request did not complete", { jobId });
    } finally {
        clearTimeout(timer);
    }
}

export async function enqueueDurableZugferdGeneration({
    companyId,
    saleId,
    invoiceId,
    pdfData,
    pdfBytes,
}: {
    companyId: string;
    saleId: string;
    invoiceId: string;
    pdfData: InvoicePdfData;
    pdfBytes: Uint8Array;
}): Promise<DurableZugferdQueueResult> {
    if (pdfData.invoiceType !== "standard") {
        return { jobId: null, status: "skipped" };
    }

    try {
        const invoice = buildCanonicalInvoiceData(pdfData);
        const requestData = {
            standardVersion: "ZUGFeRD 2.5 / Factur-X 1.09",
            profile: "EN16931",
            invoiceProfile: "ZUGFERD_EN16931",
            invoice,
        };
        const generationKey = createHash("sha256")
            .update(JSON.stringify(requestData))
            .update("\0")
            .update(pdfBytes)
            .digest("hex");
        const inputStoragePath =
            `companies/${companyId}/invoices/${invoiceId}/zugferd/jobs/${generationKey}/visible.pdf`;
        const supabase = createAutomationSupabaseClient();

        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(inputStoragePath, pdfBytes, {
                contentType: "application/pdf",
                upsert: true,
            });
        if (uploadError) {
            throw new Error("Die sichtbare Rechnungs-PDF konnte nicht für die E-Rechnung vorbereitet werden.");
        }

        const { data, error } = await supabase.rpc("enqueue_zugferd_generation_job", {
            p_company_id: companyId,
            p_sale_id: saleId,
            p_invoice_id: invoiceId,
            p_generation_key: generationKey,
            p_request_data: requestData,
            p_input_storage_path: inputStoragePath,
        });

        if (error) {
            // A network timeout can occur after PostgreSQL committed the RPC.
            // Resolve by the same stable key before reporting a failure.
            const { data: existing, error: lookupError } = await supabase
                .from("zugferd_generation_jobs")
                .select("id, status")
                .eq("company_id", companyId)
                .eq("invoice_id", invoiceId)
                .eq("generation_key", generationKey)
                .maybeSingle();

            if (lookupError || !existing) {
                throw new Error("Der dauerhafte ZUGFeRD-Auftrag konnte nicht gespeichert werden.");
            }

            const jobId = String(existing.id);
            if (existing.status === "pending") await wakeWorker(jobId);
            return { jobId, status: String(existing.status) };
        }

        const queued = normalizeRpcRow(data);
        if (!queued) {
            throw new Error("Die Auftragswarteschlange hat keine gültige Job-ID zurückgegeben.");
        }

        if (queued.job_status === "pending") await wakeWorker(queued.job_id);
        return { jobId: queued.job_id, status: queued.job_status };
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Die E-Rechnung konnte nicht zur Hintergrundverarbeitung eingereiht werden.";
        const issues = error instanceof ZugferdDataValidationError
            ? error.issues
            : [{ severity: "error" as const, message }];

        await markZugferdInvalid({ invoiceId, companyId, issues });
        console.error("[zugferd] durable queue preparation failed", {
            invoiceId,
            companyId,
            errorType: error instanceof Error ? error.name : "unknown",
        });
        return { jobId: null, status: "failed", error: message };
    }
}
