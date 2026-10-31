import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import {
    markZugferdInvalid,
    storeValidatedZugferdInvoice,
} from "@/lib/zugferd/zugferd-generation-storage";
import type { ZugferdServiceResult } from "@/lib/zugferd/zugferd-service-client";

type PendingSummary = { renderJobId?: unknown; status?: unknown };

type InvoiceRow = {
    id: string;
    sale_id: string | null;
    invoice_number: string;
    customer_id: string | null;
    vehicle_id: string | null;
    zugferd_validation_status: "valid" | "invalid" | "pending" | null;
    zugferd_validation_summary: PendingSummary | null;
};

type JobRow = {
    id: string;
    company_id: string;
    invoice_id: string;
    status: "pending" | "processing" | "completed" | "failed" | "superseded";
    input_storage_path: string;
    result_storage_path: string | null;
    result_metadata: Record<string, unknown> | null;
    error_code: string | null;
    error_message: string | null;
};

export type ZugferdStatusCheckResult = {
    httpStatus: number;
    body: { status: string; message?: string; code?: string | null };
};

function asJobId(summary: PendingSummary | null): string | null {
    return typeof summary?.renderJobId === "string" ? summary.renderJobId : null;
}

function issuesFrom(value: unknown) {
    return Array.isArray(value)
        ? value.flatMap((issue) => {
              if (!issue || typeof issue !== "object") return [];
              const candidate = issue as Record<string, unknown>;
              if (
                  !["error", "warning", "notice"].includes(String(candidate.severity)) ||
                  typeof candidate.message !== "string"
              ) return [];
              return [{
                  severity: candidate.severity as "error" | "warning" | "notice",
                  message: candidate.message,
                  ...(typeof candidate.source === "string" ? { source: candidate.source as "FACTUR_X" | "EN16931" | "XRECHNUNG" | "PDF_A" } : {}),
                  ...(typeof candidate.ruleId === "string" ? { ruleId: candidate.ruleId } : {}),
                  ...(typeof candidate.location === "string" ? { location: candidate.location } : {}),
                  ...(typeof candidate.blocking === "boolean" ? { blocking: candidate.blocking } : {}),
              }];
          })
        : [];
}

/**
 * Checks the durable ZUGFeRD generation job for one invoice and, if it has
 * completed, finalizes it (stores the PDF, marks invalid, or reports the
 * still-pending state). Shared by the on-demand status API route (polled by
 * the sale detail UI) and the periodic cron finalizer, so a result can be
 * reached even if the browser tab that started the job was closed before the
 * worker finished.
 */
export async function checkAndFinalizeZugferdStatus({
    invoiceId,
    companyId,
}: {
    invoiceId: string;
    companyId: string;
}): Promise<ZugferdStatusCheckResult> {
    const supabase = createServerSupabaseClient();
    const adminSupabase = createAutomationSupabaseClient();

    const { data, error } = await supabase
        .from("invoices")
        .select("id, sale_id, invoice_number, customer_id, vehicle_id, zugferd_validation_status, zugferd_validation_summary")
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        return { httpStatus: 404, body: { status: "not_found", message: "Rechnung wurde nicht gefunden." } };
    }

    const invoice = data as InvoiceRow;
    if (invoice.zugferd_validation_status !== "pending") {
        return { httpStatus: 200, body: { status: invoice.zugferd_validation_status ?? "not_started" } };
    }

    const jobId = asJobId(invoice.zugferd_validation_summary);
    if (!jobId || !invoice.sale_id) {
        await markZugferdInvalid({
            invoiceId,
            companyId,
            issues: [{ severity: "error", message: "Der dauerhafte ZUGFeRD-Auftrag ist unvollständig." }],
        });
        return { httpStatus: 200, body: { status: "invalid", message: "Der ZUGFeRD-Auftrag ist unvollständig." } };
    }

    const { data: jobData, error: jobError } = await adminSupabase
        .from("zugferd_generation_jobs")
        .select("id, company_id, invoice_id, status, input_storage_path, result_storage_path, result_metadata, error_code, error_message")
        .eq("id", jobId)
        .eq("company_id", companyId)
        .eq("invoice_id", invoiceId)
        .maybeSingle();

    if (jobError) {
        console.error("[zugferd] durable job status lookup failed", {
            invoiceId,
            jobId,
            errorCode: jobError.code ?? null,
        });
        return { httpStatus: 503, body: { status: "pending" } };
    }

    if (!jobData) {
        await markZugferdInvalid({
            invoiceId,
            companyId,
            expectedJobId: jobId,
            issues: [{ severity: "error", message: "Der Hintergrundauftrag ist nicht in der dauerhaften Warteschlange vorhanden. Bitte erneut starten." }],
        });
        return { httpStatus: 200, body: { status: "invalid", message: "Der Hintergrundauftrag wurde nicht gefunden." } };
    }

    const job = jobData as JobRow;
    if (job.status === "pending" || job.status === "processing") {
        return { httpStatus: 200, body: { status: "pending" } };
    }

    if (job.status === "failed" || job.status === "superseded") {
        const issues = issuesFrom(job.result_metadata?.issues);
        await markZugferdInvalid({
            invoiceId,
            companyId,
            expectedJobId: jobId,
            issues: issues.length > 0
                ? issues
                : [{ severity: "error", message: job.error_message ?? "Der ZUGFeRD-Auftrag konnte nicht abgeschlossen werden." }],
        });
        return { httpStatus: 200, body: { status: "invalid", message: job.error_message ?? undefined, code: job.error_code } };
    }

    if (!job.result_storage_path || !job.result_metadata) {
        await markZugferdInvalid({
            invoiceId,
            companyId,
            expectedJobId: jobId,
            issues: [{ severity: "error", message: "Der abgeschlossene ZUGFeRD-Auftrag enthält keine gespeicherte PDF." }],
        });
        return { httpStatus: 200, body: { status: "invalid", message: "ZUGFeRD-Ergebnis fehlt." } };
    }

    const metadata = job.result_metadata;
    const validation = metadata.validation as ZugferdServiceResult["validation"] | undefined;
    const sha256 = typeof metadata.sha256 === "string" ? metadata.sha256 : null;
    const standardVersion = typeof metadata.standardVersion === "string" ? metadata.standardVersion : null;
    const profile = metadata.profile === "EN16931" ? metadata.profile : null;
    if (!validation || !sha256 || !standardVersion || !profile || validation.status !== "valid") {
        await markZugferdInvalid({
            invoiceId,
            companyId,
            expectedJobId: jobId,
            issues: [{ severity: "error", message: "Die gespeicherten Validierungsdaten des ZUGFeRD-Auftrags sind unvollständig." }],
        });
        return { httpStatus: 200, body: { status: "invalid", message: "Validierungsdaten fehlen." } };
    }

    const { data: finalizationClaim, error: finalizationClaimError } = await adminSupabase
        .rpc("claim_zugferd_generation_finalization", { p_job_id: jobId });

    if (finalizationClaimError) {
        console.error("[zugferd] finalization claim failed", { invoiceId, jobId, errorCode: finalizationClaimError.code ?? null });
        return { httpStatus: 503, body: { status: "pending" } };
    }
    if (!finalizationClaim) return { httpStatus: 200, body: { status: "pending" } };

    try {
        const { data: pdfFile, error: downloadError } = await adminSupabase.storage
            .from("documents")
            .download(job.result_storage_path);
        if (downloadError || !pdfFile) {
            throw new Error("Die erzeugte ZUGFeRD-PDF konnte nicht aus dem privaten Storage geladen werden.");
        }

        await storeValidatedZugferdInvoice({
            companyId,
            expectedJobId: jobId,
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoice_number,
                saleId: invoice.sale_id,
                customerId: invoice.customer_id,
                vehicleId: invoice.vehicle_id,
            },
            result: {
                pdfBase64: Buffer.from(await pdfFile.arrayBuffer()).toString("base64"),
                fileName: typeof metadata.fileName === "string" ? metadata.fileName : undefined,
                sha256,
                standardVersion,
                profile,
                validation,
            },
        });

        const { error: finalizeError } = await adminSupabase.rpc("finalize_zugferd_generation_job", { p_job_id: jobId });
        if (finalizeError) {
            console.error("[zugferd] durable job finalization marker failed", {
                invoiceId,
                jobId,
                errorCode: finalizeError.code ?? null,
            });
        }
        await adminSupabase.storage
            .from("documents")
            .remove([job.input_storage_path, job.result_storage_path]);
        return { httpStatus: 200, body: { status: "valid" } };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Das ZUGFeRD-Ergebnis konnte nicht gespeichert werden.";
        console.error("[zugferd] durable result finalization failed", {
            invoiceId,
            jobId,
            errorType: error instanceof Error ? error.name : "unknown",
        });
        await supabase
            .from("invoices")
            .update({
                zugferd_validation_summary: {
                    status: "finalizing",
                    renderJobId: jobId,
                    finalizationStartedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
                },
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId)
            .eq("zugferd_validation_status", "pending")
            .contains("zugferd_validation_summary", { renderJobId: jobId });
        return { httpStatus: 503, body: { status: "pending", message } };
    }
}
