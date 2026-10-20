import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { getCustomerCountryCode } from "@/lib/countries/country-options";
import {
    decideOwnerIdAssignment,
    findCountryFallbackCandidates,
    getOwnerIdFallbackDateRange,
    hasCompletePageCoverage,
    ownerIdFallbackRuleVersion,
    type CountryFallbackCandidate,
    type OwnerIdAnalyzedDocument,
    type OwnerIdMailAnalysis,
} from "@/lib/automation/owner-id-fallback";
import { resolveSales, type ResolutionSale } from "@/lib/automation/sale-resolution";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { isPdf } from "@/lib/automation/file-signature";

export const runtime = "nodejs";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

const documentSchema = z.object({
    documentId: z.string().min(1).max(100),
    documentType: z.string().min(1).max(80),
    pageNumbers: z.array(z.number().int().positive()).min(1),
    identifiers: z.object({ saleIdentifier: z.string().max(100).optional(), invoiceNumber: z.string().max(100).optional(), vin: z.string().max(100).optional() }).strict().optional(),
    countryEvidence: z.object({ kind: z.enum(["residence_country", "issuing_country", "nationality", "buyer_country", "destination_country"]), reliable: z.boolean(), value: z.string().max(100).nullable() }).strict().optional(),
}).strict();
const pageSchema = z.object({ pageNumber: z.number().int().positive(), documentIds: z.array(z.string().min(1).max(100)), unknownOrUnassigned: z.boolean() }).strict();
const attachmentSchema = z.object({
    sourceAttachmentId: z.string().min(1).max(500),
    originalUploadId: z.string().uuid(),
    analysisStatus: z.enum(["complete", "incomplete", "failed"]),
    pageCount: z.number().int().nonnegative(),
    pages: z.array(pageSchema),
    documents: z.array(documentSchema),
}).strict();
const analysisSchema = z.object({
    source: z.enum(["inbound_email", "other"]),
    sourceEmailId: z.string().min(1).max(500),
    returnId: z.string().min(1).max(500),
    analysisStatus: z.enum(["complete", "incomplete", "failed"]),
    attachmentEnumerationComplete: z.boolean(),
    originalAttachmentCount: z.number().int().nonnegative(),
    conflictStatus: z.enum(["none", "conflict", "unknown"]),
    ownerDocumentId: z.string().min(1).max(100),
    attachments: z.array(attachmentSchema),
}).strict();

type DbSale = {
    id: string; sale_identifier: string; sale_number: string | null; sale_date: string | null; status: string;
    vehicles: { vin: string | null } | { vin: string | null }[] | null;
    customers: { company_name: string | null; first_name: string | null; last_name: string | null; country: string | null } | { company_name: string | null; first_name: string | null; last_name: string | null; country: string | null }[] | null;
    invoices: { invoice_number: string | null } | { invoice_number: string | null }[] | null;
};
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const many = <T,>(value: T | T[] | null): T[] => value ? Array.isArray(value) ? value : [value] : [];
const field = (form: FormData, key: string) => { const value = form.get(key); return typeof value === "string" && value.trim() ? value.trim() : null; };

export async function POST(request: Request) {
    const requestId = randomUUID();
    const auth = authenticateAutomationRequest(request);
    if (!auth) return automationUnauthorized();
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) return automationError(400, "invalid_idempotency_key", "Ein gültiger Idempotency-Key ist erforderlich.", { requestId });

    let form: FormData;
    try { form = await request.formData(); } catch { return automationError(400, "invalid_multipart", "Ungültige multipart/form-data-Anfrage.", { requestId }); }
    let rawAnalysis: unknown;
    try { rawAnalysis = JSON.parse(field(form, "analysis") ?? ""); } catch { return automationError(422, "invalid_analysis", "Die Analyse ist kein gültiges JSON.", { requestId }); }
    const parsed = analysisSchema.safeParse(rawAnalysis);
    if (!parsed.success) return automationError(422, "invalid_analysis", "Die Analyse entspricht nicht dem Datenvertrag.", { requestId });
    const analysis = parsed.data as OwnerIdMailAnalysis & { ownerDocumentId: string };
    const sourceAttachmentIds = parsed.data.attachments.map((attachment) => attachment.sourceAttachmentId);
    const sourceOriginalIds = parsed.data.attachments.map((attachment) => attachment.originalUploadId);
    if (new Set(sourceAttachmentIds).size !== sourceAttachmentIds.length || new Set(sourceOriginalIds).size !== sourceOriginalIds.length) {
        return automationError(422, "duplicate_attachment_identity", "Anhangs- und Originalidentitäten müssen innerhalb einer Mail eindeutig sein.", { requestId });
    }
    const ownerDocumentId = parsed.data.ownerDocumentId;
    const ownerDoc = analysis.attachments.flatMap((item) => item.documents).find((item) => item.documentId === ownerDocumentId);
    if (!ownerDoc || ownerDoc.documentType !== "owner_id") return automationError(422, "owner_document_required", "Die owner_id-Dokumentanalyse fehlt.", { requestId });
    const derivedFile = form.get("documentFile");
    let pdfBytes: Buffer | null = null;
    let fileProcessingError: string | null = null;
    if (derivedFile instanceof File) {
        if (derivedFile.size > MAX_PDF_BYTES) return automationError(413, "file_too_large", "Die abgeleitete PDF darf maximal 10 MB groß sein.", { requestId });
        const candidateBytes = Buffer.from(await derivedFile.arrayBuffer());
        if (derivedFile.size === 0 || derivedFile.type !== "application/pdf" || !isPdf(candidateBytes)) {
            fileProcessingError = "derived_pdf_invalid";
        } else {
            try {
                const pdf = await PDFDocument.load(candidateBytes, { updateMetadata: false });
                pdfBytes = pdf.getPageCount() > 0 ? candidateBytes : null;
                if (!pdfBytes) fileProcessingError = "derived_pdf_unreadable";
                else if (pdf.getPageCount() !== ownerDoc.pageNumbers.length) {
                    pdfBytes = null;
                    fileProcessingError = "derived_pdf_page_count_mismatch";
                }
            } catch {
                fileProcessingError = "derived_pdf_unreadable";
            }
        }
    }
    const receivedAt = field(form, "receivedAt");
    if (receivedAt && Number.isNaN(Date.parse(receivedAt))) return automationError(422, "invalid_received_at", "Das Eingangsdatum ist ungültig.", { requestId });

    const supabase = createAutomationSupabaseClient();
    const originalIds = [...new Set(analysis.attachments.map((attachment) => attachment.originalUploadId))];
    const { data: originals, error: originalsError } = originalIds.length
        ? await supabase.from("automation_return_uploads")
            .select("id, original_file_name, mime_type, storage_bucket, source_email_id, source_attachment_id, return_id, received_at, processing_status, upload_kind, storage_path")
            .eq("company_id", auth.companyId).eq("upload_kind", "original").in("id", originalIds)
        : { data: [], error: null };
    if (originalsError) {
        console.error("automation.owner_id.original_lookup_failed", { requestId, code: originalsError.code });
        return automationError(500, "original_lookup_failed", "Die Originalanhänge konnten nicht geprüft werden.", { requestId });
    }
    const originalById = new Map((originals ?? []).map((item) => [item.id, item]));
    if (originalById.size !== originalIds.length || (originals ?? []).some((original) =>
        original.processing_status !== "completed" || original.source_email_id !== analysis.sourceEmailId ||
        original.return_id !== analysis.returnId || !original.storage_path ||
        !analysis.attachments.some((attachment) => attachment.originalUploadId === original.id && attachment.sourceAttachmentId === original.source_attachment_id),
    )) return automationError(409, "original_provenance_mismatch", "Die Originalanhänge stimmen nicht mit den analysierten Maildaten überein.", { requestId });
    const sourceRows = originals ?? [];
    const receivedAtStored = sourceRows.length ? sourceRows[0].received_at : null;
    if (sourceRows.some((row) => row.received_at !== receivedAtStored) || (receivedAt && receivedAtStored && new Date(receivedAt).toISOString() !== new Date(receivedAtStored).toISOString())) {
        return automationError(409, "received_at_mismatch", "Das Eingangsdatum stimmt nicht mit dem gespeicherten Originalupload überein.", { requestId });
    }
    const anchoredReceivedAt = receivedAtStored;
    if (!anchoredReceivedAt) return automationError(422, "received_at_required", "Das ursprüngliche Eingangsdatum fehlt beim gespeicherten Originalupload.", { requestId });
    analysis.receivedAt = anchoredReceivedAt;

    let sourcePageError: string | null = null;
    for (const attachment of analysis.attachments) {
        const original = originalById.get(attachment.originalUploadId);
        if (!original) { sourcePageError = "original_provenance_mismatch"; break; }
        const { data: sourceFile, error: sourceDownloadError } = await supabase.storage
            .from(String(original.storage_bucket ?? "documents"))
            .download(String(original.storage_path));
        if (sourceDownloadError || !sourceFile) { sourcePageError = "original_file_unavailable"; break; }
        if (original.mime_type === "application/pdf") {
            try {
                const sourceBytes = Buffer.from(await sourceFile.arrayBuffer());
                if (!isPdf(sourceBytes)) throw new Error("invalid pdf header");
                const sourcePdf = await PDFDocument.load(sourceBytes, { updateMetadata: false });
                if (sourcePdf.getPageCount() !== attachment.pageCount) sourcePageError = "original_page_count_mismatch";
            } catch {
                sourcePageError = "original_pdf_unreadable";
            }
        } else if ((original.mime_type === "image/jpeg" || original.mime_type === "image/png") && attachment.pageCount !== 1) {
            sourcePageError = "original_page_count_mismatch";
        } else if (original.mime_type !== "image/jpeg" && original.mime_type !== "image/png") {
            sourcePageError = "original_file_type_unsupported";
        }
        if (sourcePageError) break;
    }

    const { data: dbRows, error: salesError } = await supabase.from("sales")
        .select("id, sale_identifier, sale_number, sale_date, status, vehicles(vin), customers:buyer_customer_id(company_name, first_name, last_name, country), invoices(invoice_number)")
        .eq("company_id", auth.companyId);
    if (salesError) {
        console.error("automation.owner_id.sales_lookup_failed", { requestId, code: salesError.code });
        return automationError(500, "sale_lookup_failed", "Verkaufsakten konnten nicht geprüft werden.", { requestId });
    }
    const rows = (dbRows ?? []) as unknown as DbSale[];
    const resolutionSales: ResolutionSale[] = rows.map((row) => {
        const customer = one(row.customers);
        return {
            id: row.id, saleIdentifier: row.sale_identifier, saleNumber: row.sale_number,
            invoiceNumbers: many(row.invoices).map((item) => item.invoice_number).filter((value): value is string => Boolean(value)),
            vin: one(row.vehicles)?.vin ?? null,
            customerName: customer?.company_name ?? ([customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null),
            customerEmail: null,
        };
    });
    const dbSalesById = new Map(rows.map((row) => [row.id, row]));

    let strongResult: ReturnType<typeof resolveSales> | null = null;
    let strongSaleId: string | null = null;
    let unresolvedStrong = false;
    const analyzedDocuments = analysis.attachments.flatMap((attachment) => attachment.documents) as OwnerIdAnalyzedDocument[];
    for (const document of analyzedDocuments) {
        const identifiers = document.identifiers;
        if (!identifiers || !Object.values(identifiers).some((value) => value?.trim())) continue;
        const resolution = resolveSales(identifiers, resolutionSales);
        if (resolution.status !== "matched") { unresolvedStrong = true; strongResult = resolution; continue; }
        const resolvedId = resolution.sale.saleId;
        if (strongSaleId && strongSaleId !== resolvedId) unresolvedStrong = true;
        strongSaleId = strongSaleId ?? resolvedId;
    }
    let strongResolution: Parameters<typeof decideOwnerIdAssignment>[0]["strongResolution"] = { kind: "none" };
    const ownerIdentifiers = ownerDoc.identifiers;
    if (ownerIdentifiers && Object.values(ownerIdentifiers).some((value) => value?.trim())) {
        const resolution = resolveSales(ownerIdentifiers, resolutionSales);
        if (resolution.status !== "matched") unresolvedStrong = true;
        else if (strongSaleId && strongSaleId !== resolution.sale.saleId) unresolvedStrong = true;
        else strongSaleId = resolution.sale.saleId;
    }
    const allPagesFullyAnalyzed = analysis.attachments.every((attachment) =>
        attachment.analysisStatus === "complete" && hasCompletePageCoverage(attachment) &&
        attachment.pages.every((page) => !page.unknownOrUnassigned),
    ) && !sourcePageError;
    if (analysis.analysisStatus !== "complete" || !analysis.attachmentEnumerationComplete ||
        analysis.originalAttachmentCount !== analysis.attachments.length || analysis.conflictStatus !== "none" || !allPagesFullyAnalyzed) {
        strongResolution = { kind: "unresolved", reason: sourcePageError ?? (analysis.conflictStatus === "conflict" ? "strong_identifier_conflict" : "mail_analysis_incomplete") };
    } else if (unresolvedStrong) {
        strongResolution = { kind: "unresolved", reason: strongResult?.status === "conflict" ? "strong_identifier_conflict" : strongResult?.status === "ambiguous" ? "strong_identifier_ambiguous" : "strong_identifier_unresolved" };
    } else if (strongSaleId) {
        const source = ownerIdentifiers && Object.values(ownerIdentifiers).some((value) => value?.trim()) ? "direct_identifier" : "same_email_identifier";
        const sale = dbSalesById.get(strongSaleId);
        strongResolution = sale?.status !== "cancelled" ? { kind: "matched", saleId: strongSaleId, source } : { kind: "unresolved", reason: "strong_match_is_cancelled" };
    }

    const dateRange = getOwnerIdFallbackDateRange(anchoredReceivedAt);
    const ownerCountry = ownerDoc.countryEvidence?.kind === "residence_country" && ownerDoc.countryEvidence.reliable
        ? getCustomerCountryCode(ownerDoc.countryEvidence.value)
        : null;
    let countryCandidates: CountryFallbackCandidate[] = [];
    if (ownerCountry && dateRange) {
        const { data: inRange, error: candidatesError } = await supabase.from("sales")
            .select("id, company_id, sale_date, status, customers:buyer_customer_id(country)")
            .eq("company_id", auth.companyId).gte("sale_date", dateRange.startDate).lte("sale_date", dateRange.endDate)
            .in("status", ["active", "completed"]);
        if (candidatesError) {
            console.error("automation.owner_id.candidate_lookup_failed", { requestId, code: candidatesError.code });
            return automationError(500, "candidate_lookup_failed", "Länderkandidaten konnten nicht geprüft werden.", { requestId });
        }
        const candidateRows = (inRange ?? []).map((item) => ({
            id: item.id as string, companyId: item.company_id as string, saleDate: item.sale_date as string | null,
            status: item.status as string, customerCountryCode: getCustomerCountryCode(one(item.customers as { country: string | null } | { country: string | null }[] | null)?.country),
        }));
        countryCandidates = findCountryFallbackCandidates({
            companyId: auth.companyId, countryCode: ownerCountry, startDate: dateRange.startDate,
            endDate: dateRange.endDate, sales: candidateRows,
        });
    }
    const decision = decideOwnerIdAssignment({
        analysis, ownerDocumentId, strongResolution, countryCode: ownerCountry,
        countryCandidates: countryCandidates.map(({ id }) => ({ id })), dateRange,
    });
    const assignedSale = decision.saleId ? dbSalesById.get(decision.saleId) : null;
    if (decision.saleId && (!assignedSale || assignedSale.status === "cancelled" ||
        (decision.assignmentSource === "country_fallback" && !assignedSale.sale_date))) {
        decision.outcome = "manual_review";
        decision.assignmentSource = null;
        decision.reason = "matched_sale_invalid_or_missing_sale_date";
        decision.saleId = null;
    }

    const derivedName = derivedFile instanceof File ? derivedFile.name.slice(0, 255) : null;
    const pdfHash = pdfBytes ? createHash("sha256").update(pdfBytes).digest("hex") : null;
    const fingerprint = createHash("sha256").update(JSON.stringify({ analysis: parsed.data, receivedAt: anchoredReceivedAt, pdfHash })).digest("hex");
    const originalUploadId = analysis.attachments.find((item) => item.documents.some((doc) => doc.documentId === ownerDocumentId))?.originalUploadId;
    if (!originalUploadId) return automationError(422, "owner_original_missing", "Für das Ausweisdokument wurde kein Originalanhang angegeben.", { requestId });
    const { data: intake, error: insertError } = await supabase.from("automation_owner_id_intakes").insert({
        company_id: auth.companyId, idempotency_key: idempotencyKey, request_fingerprint: fingerprint,
        status: decision.outcome === "assigned" && pdfBytes ? "assigned" : "open",
        processing_status: "processing", received_at: anchoredReceivedAt, return_id: analysis.returnId,
        source_email_id: analysis.sourceEmailId, source_attachment_id: analysis.attachments.find((item) => item.originalUploadId === originalUploadId)?.sourceAttachmentId,
        original_upload_id: originalUploadId, original_page_numbers: ownerDoc.pageNumbers,
        original_file_name: String(originalById.get(originalUploadId)?.original_file_name ?? "Ausweis-Original"), derived_file_name: derivedName,
        derived_storage_bucket: pdfBytes ? "documents" : null, derived_mime_type: pdfBytes ? "application/pdf" : null,
        derived_file_size_bytes: pdfBytes?.length ?? null, derived_sha256: pdfHash, country_source: ownerDoc.countryEvidence?.kind ?? null,
        country_code: ownerCountry, reason_code: !pdfBytes ? fileProcessingError ?? "derived_document_unavailable" : decision.reason ?? (decision.assignmentSource === "country_fallback" ? "country_fallback_single_candidate" : "strong_match"),
        candidate_sale_ids: decision.candidateSaleIds, assignment_source: pdfBytes ? decision.assignmentSource : null,
        rule_version: ownerIdFallbackRuleVersion, search_start_date: decision.searchStartDate,
        search_end_date: decision.searchEndDate, decision_metadata: {
            source: analysis.source, analysisStatus: analysis.analysisStatus,
            originalAttachmentCount: analysis.originalAttachmentCount, attachmentEnumerationComplete: analysis.attachmentEnumerationComplete,
            conflictStatus: analysis.conflictStatus, countryEvidenceKind: ownerDoc.countryEvidence?.kind ?? null,
            countryReliable: ownerDoc.countryEvidence?.reliable ?? false,
            attachmentManifest: analysis.attachments.map((attachment) => ({
                sourceAttachmentId: attachment.sourceAttachmentId,
                originalUploadId: attachment.originalUploadId,
                pageCount: attachment.pageCount,
                documentTypes: attachment.documents.map((document) => document.documentType),
                pageNumbers: attachment.pages.map((page) => page.pageNumber),
                unknownPageNumbers: attachment.pages.filter((page) => page.unknownOrUnassigned).map((page) => page.pageNumber),
            })),
        }, sale_id: pdfBytes ? decision.saleId : null, assigned_at: pdfBytes && decision.saleId ? new Date().toISOString() : null,
    }).select("id").single();
    let intakeId: string;
    if (insertError) {
        if (insertError.code !== "23505") {
            console.error("automation.owner_id.intake_insert_failed", { requestId, code: insertError.code });
            return automationError(500, "intake_registration_failed", "Der Dokumenteingang konnte nicht reserviert werden.", { requestId });
        }
        const { data: existing } = await supabase.from("automation_owner_id_intakes").select("id, request_fingerprint, status, processing_status, sale_id, document_id, updated_at, error_code")
            .eq("company_id", auth.companyId).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existing?.request_fingerprint !== fingerprint) return automationError(409,
            "idempotency_conflict", "Dieser Idempotency-Key wurde mit abweichendem Inhalt verwendet.", { requestId });
        if (existing?.processing_status === "ready") return NextResponse.json({ status: existing.status, intakeId: existing.id, saleId: existing.sale_id, documentId: existing.document_id }, { status: 200 });
        if (!existing) return automationError(500, "idempotency_read_failed", "Der reservierte Dokumenteingang konnte nicht wiedergefunden werden.", { requestId });
        const retryableErrors = new Set(["derived_storage_failed", "derived_path_registration_failed", "database_finalize_failed", "original_file_unavailable"]);
        if (existing.processing_status === "error" && !retryableErrors.has(String(existing.error_code))) {
            return NextResponse.json({ status: "processing_error", intakeId: existing.id, reason: existing.error_code }, { status: 202, headers: { "cache-control": "private, no-store" } });
        }
        if (existing.processing_status === "processing") {
            const ageMs = Date.now() - Date.parse(existing.updated_at);
            if (!Number.isFinite(ageMs) || ageMs < 15 * 60 * 1000) {
                return NextResponse.json({ status: "processing", intakeId: existing.id }, { status: 202 });
            }
        }
        const { data: reclaimed, error: reclaimError } = await supabase.from("automation_owner_id_intakes")
            .update({ processing_status: "processing", error_code: null, updated_at: new Date().toISOString() })
            .eq("id", existing.id).eq("company_id", auth.companyId).eq("processing_status", existing.processing_status)
            .eq("updated_at", existing.updated_at).select("id").maybeSingle();
        if (reclaimError) {
            console.error("automation.owner_id.reclaim_failed", { requestId, code: reclaimError.code });
            return automationError(500, "idempotency_reclaim_failed", "Der Dokumenteingang kann derzeit nicht wiederaufgenommen werden.", { requestId });
        }
        if (!reclaimed) return NextResponse.json({ status: "processing", intakeId: existing.id }, { status: 202 });
        intakeId = existing.id;
    } else {
        intakeId = intake.id as string;
    }
    let storagePath: string | null = null;
    if (pdfBytes && derivedFile instanceof File) {
        const safeName = derivedFile.name.replace(/[^\p{L}\p{N}._-]/gu, "-").slice(-150) || "ausweis.pdf";
        storagePath = `companies/${auth.companyId}/automation-returns/owner-id-intakes/${intakeId}/${pdfHash}-${safeName}`;
        const { error: storageError } = await supabase.storage.from("documents").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
        if (storageError) {
            const { data: storedObject } = await supabase.storage.from("documents").download(storagePath);
            const storedHash = storedObject
                ? createHash("sha256").update(Buffer.from(await storedObject.arrayBuffer())).digest("hex")
                : null;
            if (!storedObject || storedHash !== pdfHash) {
                await supabase.rpc("finalize_automation_owner_id_intake", { p_intake_id: intakeId, p_company_id: auth.companyId, p_processing_status: "error", p_error_code: "derived_storage_failed" });
                console.error("automation.owner_id.storage_failed", { requestId, intakeId });
                return automationError(502, "derived_storage_failed", "Die Ausweis-PDF konnte nicht sicher gespeichert werden.", { requestId, intakeId });
            }
        }
        const { error: pathWriteError } = await supabase.from("automation_owner_id_intakes")
            .update({ derived_storage_path: storagePath })
            .eq("id", intakeId).eq("company_id", auth.companyId);
        if (pathWriteError) {
            await supabase.storage.from("documents").remove([storagePath]);
            await supabase.rpc("finalize_automation_owner_id_intake", { p_intake_id: intakeId, p_company_id: auth.companyId, p_processing_status: "error", p_error_code: "derived_path_registration_failed" });
            console.error("automation.owner_id.path_write_failed", { requestId, intakeId, code: pathWriteError.code });
            return automationError(500, "derived_path_registration_failed", "Die Ausweis-PDF konnte nicht sicher registriert werden.", { requestId, intakeId });
        }
    }
    const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_automation_owner_id_intake", {
        p_intake_id: intakeId, p_company_id: auth.companyId,
        p_processing_status: pdfBytes && !sourcePageError ? "ready" : "error",
        p_error_code: pdfBytes ? sourcePageError : fileProcessingError ?? "derived_document_unavailable",
    });
    if (finalizeError) {
        if (storagePath) await supabase.storage.from("documents").remove([storagePath]);
        await supabase.from("automation_owner_id_intakes").update({ status: "open", processing_status: "error", sale_id: null, assignment_source: null, assigned_at: null, error_code: "database_finalize_failed", updated_at: new Date().toISOString() }).eq("id", intakeId).eq("company_id", auth.companyId);
        console.error("automation.owner_id.finalize_failed", { requestId, intakeId, code: finalizeError.code });
        return automationError(500, "intake_finalize_failed", "Der Dokumenteingang konnte nicht abgeschlossen werden.", { requestId, intakeId });
    }
    const result = (Array.isArray(finalized) ? finalized[0] : finalized) as { document_id?: string | null; document_version_id?: string | null } | null;
    const { data: savedIntake, error: savedIntakeError } = await supabase.from("automation_owner_id_intakes")
        .select("status, processing_status, assignment_source, reason_code, error_code, sale_id, candidate_sale_ids, country_code, search_start_date, search_end_date")
        .eq("id", intakeId).eq("company_id", auth.companyId).maybeSingle();
    if (savedIntakeError || !savedIntake) {
        console.error("automation.owner_id.result_lookup_failed", { requestId, intakeId, code: savedIntakeError?.code ?? null });
        return automationError(500, "intake_result_lookup_failed", "Der gespeicherte Zuordnungsstatus konnte nicht geladen werden.", { requestId, intakeId });
    }
    const processingError = savedIntake.processing_status === "error";
    return NextResponse.json({
        status: processingError ? "processing_error" : savedIntake.status === "assigned" ? "assigned" : "manual_review",
        assignmentSource: savedIntake.assignment_source,
        reason: savedIntake.error_code ?? savedIntake.reason_code,
        label: savedIntake.assignment_source === "country_fallback" ? "Über Länderabgleich zugeordnet – bitte prüfen" : undefined,
        intakeId, saleId: savedIntake.sale_id, documentId: result?.document_id ?? null,
        candidateSaleIds: savedIntake.candidate_sale_ids, countryCode: savedIntake.country_code,
        searchStartDate: savedIntake.search_start_date, searchEndDate: savedIntake.search_end_date,
    }, { status: processingError ? 202 : 201, headers: { "cache-control": "private, no-store" } });
}
