import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { hashSignatureRequestReservation } from "@/lib/automation/signature-request";
import { isUuid } from "@/lib/automation/validation";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";
type Context = { params: Promise<{ requestId: string }> };

const resultSchema = z.object({
    reservationToken: z.string().trim().min(20).max(500),
    status: z.enum(["sent", "failed", "unknown"]),
    providerMessageId: z.string().trim().min(1).max(500).nullable().optional(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
});

type ResultRpcRow = { outcome: string; stored_status: string | null };

export async function POST(request: Request, routeContext: Context) {
    const auth = authenticateAutomationRequest(request);
    if (!auth) return automationUnauthorized();
    const { requestId } = await routeContext.params;
    if (!isUuid(requestId)) return automationError(422, "invalid_request_id", "Die Rückfrage-ID ist ungültig.");

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return automationError(400, "invalid_json", "Der Request enthält kein gültiges JSON.");
    }
    const parsed = resultSchema.safeParse(body);
    if (!parsed.success) {
        return automationError(422, "invalid_request", "Das Versandresultat ist ungültig.", parsed.error.flatten().fieldErrors);
    }

    const supabase = createAutomationSupabaseClient();
    const { data, error } = await supabase.rpc("record_automation_signature_request_result", {
        p_company_id: auth.companyId,
        p_request_id: requestId,
        p_reservation_token_hash: hashSignatureRequestReservation(parsed.data.reservationToken),
        p_result_status: parsed.data.status,
        p_provider_message_id: parsed.data.providerMessageId ?? null,
        p_result_reason: parsed.data.reason ?? null,
    });
    if (error) {
        console.error("automation.signature_request.result_failed", { requestId, databaseCode: error.code });
        return automationError(500, "result_write_failed", "Das Versandresultat konnte nicht gespeichert werden.");
    }

    const result = (data as ResultRpcRow[] | null)?.[0];
    if (!result) return automationError(500, "result_write_failed", "Das Versandresultat konnte nicht gespeichert werden.");
    if (result.outcome === "not_found") return automationError(404, "request_not_found", "Die Rückfrage wurde nicht gefunden.");
    if (result.outcome === "invalid_reservation") return automationError(403, "invalid_reservation", "Die Reservierungskennung ist ungültig.");
    if (["already_sent", "unknown_requires_review", "result_conflict"].includes(result.outcome)) {
        return automationError(409, result.outcome, result.outcome === "unknown_requires_review"
            ? "Der Versandausgang ist unklar und muss manuell geprüft werden. Eine automatische Wiederholung ist gesperrt."
            : "Das Ergebnis widerspricht dem bereits gespeicherten Zustand.");
    }

    return NextResponse.json({
        status: result.outcome === "idempotent" ? "unchanged" : "recorded",
        deliveryStatus: result.stored_status,
        idempotent: result.outcome === "idempotent",
    });
}
