import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { authenticateCronRequest } from "@/lib/cron/cron-auth";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { checkAndFinalizeZugferdStatus } from "@/lib/zugferd/zugferd-status-check";
import { wakeWorker } from "@/lib/zugferd/zugferd-durable-queue";

export const runtime = "nodejs";
export const maxDuration = 60;

// Jobs still "pending" (unclaimed by the Render worker) after this long are
// re-woken. This covers the case where the initial wake call made at
// enqueue-time failed or never reached a sleeping Render instance.
const STALE_PENDING_JOB_GRACE_MS = 90_000;

type PendingInvoiceRow = { id: string };
type PendingJobRow = { id: string; invoice_id: string; created_at: string };

/**
 * Periodic safety net for the durable ZUGFeRD generation queue.
 *
 * The UI normally finalizes a completed job the next time the sale detail
 * page polls the status endpoint. If a user navigates away or closes the
 * tab before that happens, a completed (or stuck) job would otherwise sit
 * unfinalized indefinitely. This cron:
 *
 * 1. Re-checks every invoice still marked "pending" and finalizes any job
 *    that has actually completed, failed, or gone missing in the meantime.
 * 2. Re-sends a wake request for jobs that are still unclaimed after a
 *    grace period, in case the original wake call at enqueue-time did not
 *    reach the Render worker (e.g. a sleeping free-tier instance).
 *
 * Requires CRON_SECRET authentication. No periodic schedule is currently
 * configured; automatic cron-based recovery is intentionally paused.
 */
export async function GET(request: Request) {
    if (!authenticateCronRequest(request)) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const companyId = getCurrentCompanyId();
    const adminSupabase = createAutomationSupabaseClient();

    const { data: pendingInvoices, error: invoicesError } = await adminSupabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .eq("zugferd_validation_status", "pending");

    if (invoicesError) {
        console.error("[zugferd-cron] pending invoice lookup failed", { errorCode: invoicesError.code ?? null });
        return NextResponse.json({ error: "pending invoice lookup failed" }, { status: 500 });
    }

    const finalizationResults: Array<{ invoiceId: string; status: string }> = [];
    for (const row of (pendingInvoices ?? []) as PendingInvoiceRow[]) {
        try {
            const result = await checkAndFinalizeZugferdStatus({ invoiceId: row.id, companyId });
            finalizationResults.push({ invoiceId: row.id, status: result.body.status });
        } catch (error) {
            console.error("[zugferd-cron] finalization check failed", {
                invoiceId: row.id,
                errorType: error instanceof Error ? error.name : "unknown",
            });
            finalizationResults.push({ invoiceId: row.id, status: "error" });
        }
    }

    const staleCutoff = new Date(Date.now() - STALE_PENDING_JOB_GRACE_MS).toISOString();
    const { data: staleJobs, error: staleJobsError } = await adminSupabase
        .from("zugferd_generation_jobs")
        .select("id, invoice_id, created_at")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .lt("created_at", staleCutoff);

    if (staleJobsError) {
        console.error("[zugferd-cron] stale job lookup failed", { errorCode: staleJobsError.code ?? null });
    }

    let rewokenJobCount = 0;
    for (const job of (staleJobs ?? []) as PendingJobRow[]) {
        await wakeWorker(job.id);
        rewokenJobCount += 1;
    }

    return NextResponse.json({
        checkedInvoices: finalizationResults.length,
        finalizationResults,
        rewokenJobCount,
    });
}
