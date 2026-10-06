import { NextResponse } from "next/server";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { isSignedReturnSatisfied } from "@/lib/automation/document-return-status";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { getStampDocumentKeysForSaleType, STAMP_DOCUMENT_TYPES } from "@/lib/sales/stamp-documents";
import type { SaleType } from "@/lib/sales/sale-queries";
import { isUuid } from "@/lib/automation/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ saleId: string }> };
const allowedTypes = new Set(["entry_certificate", "transport_proof", "handover_protocol"]);

export async function GET(request: Request, routeContext: Context) {
    const auth = authenticateAutomationRequest(request);
    if (!auth) return automationUnauthorized();
    const { saleId } = await routeContext.params;
    if (!isUuid(saleId)) return automationError(422, "invalid_sale_id", "Die Verkaufs-ID ist ungültig.");
    const supabase = createAutomationSupabaseClient();
    const { data: sale, error: saleError } = await supabase.from("sales")
        .select("id, sale_identifier, sale_type, customers(country)")
        .eq("id", saleId).eq("company_id", auth.companyId).maybeSingle();
    if (saleError) return automationError(500, "sale_lookup_failed", "Die Verkaufsakte konnte nicht geprüft werden.");
    if (!sale) return automationError(404, "sale_not_found", "Die Verkaufsakte wurde nicht gefunden.");

    const customerRelation = sale.customers as unknown as { country: string | null } | { country: string | null }[] | null;
    const customer = Array.isArray(customerRelation) ? customerRelation[0] : customerRelation;
    const expectedKeys = getStampDocumentKeysForSaleType((sale.sale_type ?? "inland") as SaleType, customer?.country)
        .filter((key) => allowedTypes.has(key));
    const labels = new Map(STAMP_DOCUMENT_TYPES.map((item) => [item.key, item.label]));

    const { data: uploads, error: uploadError } = await supabase.from("automation_return_uploads")
        .select("id, document_id, document_version_id, document_type, received_at, signature_status, review_status, review_reason, original_page_numbers, parent_original_upload_id, created_at")
        .eq("company_id", auth.companyId).eq("sale_id", saleId).eq("upload_kind", "sale_document")
        .eq("processing_status", "completed").order("created_at", { ascending: false });
    if (uploadError) return automationError(500, "returns_lookup_failed", "Die Rückläufe konnten nicht geladen werden.");

    const documentIds = Array.from(new Set((uploads ?? []).map((upload) => upload.document_id).filter((id): id is string => Boolean(id))));
    const activeVersions = new Map<string, string | null>();
    if (documentIds.length > 0) {
        const { data: documents, error: documentsError } = await supabase.from("documents")
            .select("id, active_version_id, archive_status")
            .eq("company_id", auth.companyId).eq("sale_id", saleId).in("id", documentIds);
        if (documentsError) return automationError(500, "documents_lookup_failed", "Die aktiven Dokumentversionen konnten nicht geprüft werden.");
        for (const document of documents ?? []) {
            if (document.archive_status === "ACTIVE") activeVersions.set(document.id, document.active_version_id);
        }
    }

    const returns = (uploads ?? []).map((upload) => ({
        uploadId: upload.id,
        documentId: upload.document_id,
        documentVersionId: upload.document_version_id,
        documentType: upload.document_type,
        receivedAt: upload.received_at,
        signatureStatus: upload.signature_status,
        reviewStatus: upload.review_status,
        reviewReason: upload.review_reason,
        originalPageNumbers: upload.original_page_numbers,
        originalUploadId: upload.parent_original_upload_id,
        isCurrentVersion: Boolean(upload.document_id) && activeVersions.get(upload.document_id) === upload.document_version_id,
        satisfiesSignedReturn: isSignedReturnSatisfied({
            signatureStatus: upload.signature_status,
            reviewStatus: upload.review_status,
            documentId: upload.document_id,
            documentVersionId: upload.document_version_id,
            activeVersionId: upload.document_id ? activeVersions.get(upload.document_id) : null,
        }),
    }));
    const requirements = expectedKeys.map((documentType) => {
        const matching = returns.filter((item) => item.documentType === documentType);
        return {
            documentType,
            label: labels.get(documentType) ?? documentType,
            required: true,
            fulfilled: matching.some((item) => item.satisfiesSignedReturn),
            returns: matching,
        };
    });

    return NextResponse.json({
        saleId,
        saleIdentifier: sale.sale_identifier,
        ruleSource: "existing_waw_stamp_document_rules",
        ruleExplanation: "Die Anforderungen werden aus Verkaufsart und Bestimmungsland abgeleitet; es werden keine zusätzlichen Anforderungen erfunden.",
        signatureExplanation: "present bedeutet nur sichtbar erkannt, nicht auf Echtheit geprüft oder manuell freigegeben. absent und uncertain erfüllen die Anforderung nicht.",
        requirements,
        existingReturns: returns,
    });
}
