import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { isSignedReturnSatisfied } from "@/lib/automation/document-return-status";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { resolveBuyerCustomerEmail } from "@/lib/automation/sale-resolution";
import {
    canonicalizeSignatureRequestDocumentTypes,
    createSignatureRequestFingerprint,
    createSignatureRequestReservation,
    getRemainingSignatureRequestDocumentTypes,
    signatureRequestDocumentTypes,
    type SignatureRequestDocumentType,
} from "@/lib/automation/signature-request";
import { getStampDocumentKeysForSaleType } from "@/lib/sales/stamp-documents";
import type { SaleType } from "@/lib/sales/sale-queries";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";

const claimSchema = z.object({
    notificationKey: z.string().trim().min(1).max(200),
    saleId: z.uuid(),
    documentTypes: z.array(z.enum(signatureRequestDocumentTypes)).min(1).max(3),
}).superRefine((value, context) => {
    if (new Set(value.documentTypes).size !== value.documentTypes.length) {
        context.addIssue({ code: "custom", path: ["documentTypes"], message: "Dokumenttypen dürfen nicht doppelt vorkommen." });
    }
});

type BuyerRelation = { country: string | null; email: string | null };
type ClaimRpcRow = { request_id: string; outcome: string };

function relationRows<T>(value: T | T[] | null): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export async function POST(request: Request) {
    const auth = authenticateAutomationRequest(request);
    if (!auth) return automationUnauthorized();

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return automationError(400, "invalid_json", "Der Request enthält kein gültiges JSON.");
    }

    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
        return automationError(422, "invalid_request", "Die Rückfrage-Daten sind ungültig.", parsed.error.flatten().fieldErrors);
    }

    const supabase = createAutomationSupabaseClient();
    const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("id, sale_type, customers:buyer_customer_id(country, email)")
        .eq("id", parsed.data.saleId)
        .eq("company_id", auth.companyId)
        .maybeSingle();

    if (saleError) {
        console.error("automation.signature_request.sale_lookup_failed", { databaseCode: saleError.code });
        return automationError(500, "sale_lookup_failed", "Die Verkaufsakte konnte nicht geprüft werden.");
    }
    if (!sale) return automationError(404, "sale_not_found", "Die Verkaufsakte wurde nicht gefunden.");

    const buyers = relationRows(sale.customers as unknown as BuyerRelation | BuyerRelation[] | null);
    const buyer = buyers.length === 1 ? buyers[0] : null;
    const emailResolution = resolveBuyerCustomerEmail(buyers.map((candidate) => candidate.email));
    const originalDocumentTypes = canonicalizeSignatureRequestDocumentTypes(
        parsed.data.documentTypes as SignatureRequestDocumentType[],
    );
    const requiredDocumentTypes = getStampDocumentKeysForSaleType(
        (sale.sale_type ?? "inland") as SaleType,
        buyer?.country,
    );

    const { data: uploads, error: uploadsError } = await supabase
        .from("automation_return_uploads")
        .select("document_id, document_version_id, document_type, signature_status, review_status")
        .eq("company_id", auth.companyId)
        .eq("sale_id", parsed.data.saleId)
        .eq("upload_kind", "sale_document")
        .eq("processing_status", "completed")
        .in("document_type", originalDocumentTypes);
    if (uploadsError) {
        console.error("automation.signature_request.returns_lookup_failed", { databaseCode: uploadsError.code });
        return automationError(500, "returns_lookup_failed", "Vorhandene Rückläufe konnten nicht geprüft werden.");
    }

    const activeVersions = new Map<string, string | null>();
    const { data: documents, error: documentsError } = await supabase
        .from("documents")
        .select("id, document_type, source, status, active_version_id")
        .eq("company_id", auth.companyId)
        .eq("sale_id", parsed.data.saleId)
        .eq("archive_status", "ACTIVE")
        .not("active_version_id", "is", null)
        .in("document_type", originalDocumentTypes);
    if (documentsError) {
        console.error("automation.signature_request.documents_lookup_failed", { databaseCode: documentsError.code });
        return automationError(500, "documents_lookup_failed", "Aktive Dokumentversionen konnten nicht geprüft werden.");
    }
    for (const document of documents ?? []) {
        activeVersions.set(document.id, document.active_version_id);
    }

    const fulfilled = new Set<string>((documents ?? [])
        .filter((document) => document.source === "uploaded" && document.status === "available")
        .map((document) => document.document_type));
    for (const upload of uploads ?? []) {
        if (isSignedReturnSatisfied({
            signatureStatus: upload.signature_status,
            reviewStatus: upload.review_status,
            documentId: upload.document_id,
            documentVersionId: upload.document_version_id,
            activeVersionId: upload.document_id ? activeVersions.get(upload.document_id) : null,
        })) fulfilled.add(upload.document_type);
    }

    const remainingDocumentTypes = getRemainingSignatureRequestDocumentTypes({
        requested: originalDocumentTypes,
        required: requiredDocumentTypes,
        fulfilled,
    });
    const initialStatus = remainingDocumentTypes.length === 0
        ? "suppressed"
        : emailResolution.customerEmail
            ? "processing"
            : "needs_review";
    const suppressionReason = remainingDocumentTypes.length === 0
        ? "no_unfulfilled_required_documents"
        : emailResolution.customerEmailReason;
    const reservation = createSignatureRequestReservation();
    const requestFingerprint = createSignatureRequestFingerprint({
        saleId: parsed.data.saleId,
        originalDocumentTypes,
    });

    const { data: claimRows, error: claimError } = await supabase.rpc("claim_automation_signature_request", {
        p_company_id: auth.companyId,
        p_notification_key: parsed.data.notificationKey,
        p_request_fingerprint: requestFingerprint,
        p_sale_id: parsed.data.saleId,
        p_original_document_types: originalDocumentTypes,
        p_remaining_document_types: remainingDocumentTypes,
        p_recipient_email: initialStatus === "processing" ? emailResolution.customerEmail : null,
        p_recipient_source: initialStatus === "processing" ? emailResolution.customerEmailSource : null,
        p_initial_status: initialStatus,
        p_suppression_reason: suppressionReason,
        p_reservation_token_hash: reservation.tokenHash,
    });
    if (claimError) {
        console.error("automation.signature_request.claim_failed", { databaseCode: claimError.code });
        return automationError(500, "claim_failed", "Die Rückfrage konnte nicht reserviert werden.");
    }

    const claim = (claimRows as ClaimRpcRow[] | null)?.[0];
    if (!claim) return automationError(500, "claim_failed", "Die Rückfrage konnte nicht reserviert werden.");
    if (claim.outcome === "conflict") {
        return automationError(409, "notification_key_conflict", "Der notificationKey wurde bereits mit anderen Ausgangsdaten verwendet.");
    }
    if (claim.outcome === "claimed") {
        return NextResponse.json({
            status: "claimed",
            allowSend: true,
            requestId: claim.request_id,
            reservationToken: reservation.token,
            customerEmail: emailResolution.customerEmail,
            customerEmailSource: emailResolution.customerEmailSource,
            customerEmailOwnershipVerified: false,
            documentTypes: remainingDocumentTypes,
        }, { status: 201 });
    }

    const reasons: Record<string, string> = {
        already_sent: "already_sent",
        processing: "existing_request_processing_or_outcome_unclear",
        suppressed: suppressionReason ?? "no_unfulfilled_required_documents",
        needs_review: suppressionReason ?? "manual_review_required",
    };
    return NextResponse.json({
        status: claim.outcome,
        allowSend: false,
        requestId: claim.request_id,
        reason: reasons[claim.outcome] ?? "manual_review_required",
    });
}
