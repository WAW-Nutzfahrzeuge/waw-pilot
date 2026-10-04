import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { markZugferdInvalid, storeValidatedZugferdInvoice } from "@/lib/zugferd/zugferd-generation-storage";
import { getZugferdGenerationJobStatus, ZugferdServiceRequestError } from "@/lib/zugferd/zugferd-service-client";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ invoiceId: string }> };

type PendingSummary = {
    renderJobId?: unknown;
    status?: unknown;
    finalizationStartedAt?: unknown;
};

type InvoiceRow = {
    id: string;
    sale_id: string | null;
    invoice_number: string;
    customer_id: string | null;
    vehicle_id: string | null;
    zugferd_validation_status: "valid" | "invalid" | "pending" | null;
    zugferd_validation_summary: PendingSummary | null;
};

function asJobId(summary: PendingSummary | null): string | null {
    const value = summary?.renderJobId;
    return typeof value === "string" && value.length > 0 ? value : null;
}

function isStaleFinalization(summary: PendingSummary | null): boolean {
    if (summary?.status !== "finalizing" || typeof summary.finalizationStartedAt !== "string") {
        return false;
    }
    const startedAt = Date.parse(summary.finalizationStartedAt);
    return Number.isFinite(startedAt) && Date.now() - startedAt > 2 * 60 * 1000;
}

export async function GET(_request: Request, context: RouteContext) {
    const { invoiceId } = await context.params;
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const { data, error } = await supabase
        .from("invoices")
        .select("id, sale_id, invoice_number, customer_id, vehicle_id, zugferd_validation_status, zugferd_validation_summary")
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        return NextResponse.json({ status: "not_found", message: "Rechnung wurde nicht gefunden." }, { status: 404 });
    }

    const invoice = data as InvoiceRow;
    if (invoice.zugferd_validation_status !== "pending") {
        return NextResponse.json({ status: invoice.zugferd_validation_status ?? "not_started" });
    }

    if (!invoice.sale_id) {
        await markZugferdInvalid({
            invoiceId,
            companyId,
            issues: [{ severity: "error", message: "Der ZUGFeRD-Auftrag hat keinen Verkauf." }],
        });
        return NextResponse.json({ status: "invalid", message: "Der ZUGFeRD-Auftrag ist unvollständig." });
    }

    const jobId = asJobId(invoice.zugferd_validation_summary);
    if (!jobId) {
        await markZugferdInvalid({
            invoiceId,
            companyId,
            issues: [{ severity: "error", message: "Der ZUGFeRD-Hintergrundauftrag fehlt. Bitte erneut starten." }],
        });
        return NextResponse.json({ status: "invalid", message: "Der ZUGFeRD-Hintergrundauftrag fehlt." });
    }

    if (isStaleFinalization(invoice.zugferd_validation_summary)) {
        await supabase
            .from("invoices")
            .update({ zugferd_validation_summary: { status: "pending", renderJobId: jobId } })
            .eq("id", invoiceId)
            .eq("company_id", companyId)
            .contains("zugferd_validation_summary", { renderJobId: jobId, status: "finalizing" });
        return NextResponse.json({ status: "pending" });
    }

    try {
        const job = await getZugferdGenerationJobStatus(jobId);
        if (job.status === "pending") return NextResponse.json({ status: "pending" });

        if (job.status === "failed" || job.status === "not_found") {
            await markZugferdInvalid({
                invoiceId,
                companyId,
                issues: job.issues.length > 0
                    ? job.issues
                    : [{ severity: "error", message: job.message ?? "ZUGFeRD-Auftrag fehlgeschlagen." }],
            });
            return NextResponse.json({ status: "invalid", message: job.message });
        }

        if (!job.result) {
            await markZugferdInvalid({
                invoiceId,
                companyId,
                issues: [{ severity: "error", message: "Der ZUGFeRD-Service lieferte kein Ergebnis für den abgeschlossenen Auftrag." }],
            });
            return NextResponse.json({ status: "invalid", message: "ZUGFeRD-Ergebnis fehlt." });
        }

        const { data: finalizationClaim, error: finalizationClaimError } = await supabase
            .from("invoices")
            .update({
                zugferd_validation_summary: {
                    status: "finalizing",
                    renderJobId: jobId,
                    finalizationStartedAt: new Date().toISOString(),
                },
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId)
            .eq("zugferd_validation_status", "pending")
            .contains("zugferd_validation_summary", { renderJobId: jobId, status: "pending" })
            .select("id")
            .maybeSingle();

        if (finalizationClaimError) {
            throw new Error(`ZUGFeRD-Ergebnis konnte nicht zur Speicherung reserviert werden: ${finalizationClaimError.message}`);
        }
        if (!finalizationClaim) return NextResponse.json({ status: "pending" });

        await storeValidatedZugferdInvoice({
            companyId,
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoice_number,
                saleId: invoice.sale_id,
                customerId: invoice.customer_id,
                vehicleId: invoice.vehicle_id,
            },
            result: job.result,
        });
        return NextResponse.json({ status: "valid" });
    } catch (error) {
        const message = error instanceof Error ? error.message : "ZUGFeRD-Auftrag konnte nicht abgefragt werden.";
        if (
            error instanceof ZugferdServiceRequestError &&
            (error.code === "SERVICE_UNAVAILABLE" || error.code === "TIMEOUT")
        ) {
            return NextResponse.json({ status: "pending", message }, { status: 503 });
        }
        await markZugferdInvalid({
            invoiceId,
            companyId,
            issues: [{ severity: "error", message }],
        });
        const status = error instanceof ZugferdServiceRequestError ? 502 : 500;
        return NextResponse.json({ status: "invalid", message }, { status });
    }
}
