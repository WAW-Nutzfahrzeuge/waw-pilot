import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCustomerCountryCode } from "../lib/countries/country-options.ts";
import {
    decideOwnerIdAssignment,
    findCountryFallbackCandidates,
    getBerlinCalendarDate,
    getOwnerIdFallbackDateRange,
    getOwnerIdFallbackIneligibilityReason,
    hasCompletePageCoverage,
    ownerIdFallbackRuleVersion,
    type OwnerIdMailAnalysis,
} from "../lib/automation/owner-id-fallback.ts";

const baseAnalysis = (): OwnerIdMailAnalysis => ({
    source: "inbound_email", sourceEmailId: "mail-1", returnId: "return-1",
    receivedAt: "2026-10-20T10:00:00.000Z", analysisStatus: "complete",
    attachmentEnumerationComplete: true, originalAttachmentCount: 1, conflictStatus: "none",
    attachments: [{
        sourceAttachmentId: "attachment-1", originalUploadId: "00000000-0000-4000-8000-000000000001",
        analysisStatus: "complete", pageCount: 2,
        pages: [
            { pageNumber: 1, documentIds: ["owner"], unknownOrUnassigned: false },
            { pageNumber: 2, documentIds: ["owner"], unknownOrUnassigned: false },
        ],
        documents: [{ documentId: "owner", documentType: "owner_id", pageNumbers: [1, 2], countryEvidence: { kind: "residence_country", reliable: true, value: "DE" } }],
    }],
});

function evaluate(analysis = baseAnalysis(), candidates = [{ id: "sale-1" }]) {
    return decideOwnerIdAssignment({
        analysis, ownerDocumentId: "owner", strongResolution: { kind: "none" }, countryCode: "DE",
        countryCandidates: candidates, dateRange: getOwnerIdFallbackDateRange(analysis.receivedAt),
    });
}

test("one fully analyzed owner-only mail and one candidate assigns tentatively", () => {
    const decision = evaluate();
    assert.equal(decision.outcome, "assigned");
    assert.equal(decision.assignmentSource, "country_fallback");
    assert.equal(decision.saleId, "sale-1");
    assert.equal(ownerIdFallbackRuleVersion, "owner-id-country-fallback-v1");
});

test("no or multiple candidates remain manual and never select the newest", () => {
    assert.equal(evaluate(baseAnalysis(), []).reason, "no_country_candidate");
    const result = evaluate(baseAnalysis(), [{ id: "sale-a" }, { id: "sale-b" }]);
    assert.equal(result.outcome, "manual_review");
    assert.equal(result.reason, "multiple_country_candidates");
    assert.equal(result.saleId, null);
    assert.deepEqual(result.candidateSaleIds, ["sale-a", "sale-b"]);
});

test("source, attachment count, complete analysis, unknown pages, and mixed document types gate fallback", () => {
    const cases: Array<[string, (analysis: OwnerIdMailAnalysis) => void]> = [
        ["other source", (analysis) => { analysis.source = "other"; }],
        ["two original attachments", (analysis) => { analysis.originalAttachmentCount = 2; analysis.attachments.push({ ...analysis.attachments[0], sourceAttachmentId: "a2", originalUploadId: "00000000-0000-4000-8000-000000000002" }); }],
        ["incomplete mail", (analysis) => { analysis.analysisStatus = "incomplete"; }],
        ["attachment enumeration incomplete", (analysis) => { analysis.attachmentEnumerationComplete = false; }],
        ["unknown pages", (analysis) => { analysis.attachments[0].pages[1].unknownOrUnassigned = true; }],
        ["mixed PDF", (analysis) => { analysis.attachments[0].documents.push({ documentId: "handover", documentType: "handover_protocol", pageNumbers: [2] }); analysis.attachments[0].pages[1].documentIds.push("handover"); }],
        ["identifier conflict", (analysis) => { analysis.conflictStatus = "conflict"; }],
    ];
    for (const [name, mutate] of cases) {
        const analysis = baseAnalysis();
        mutate(analysis);
        assert.equal(evaluate(analysis).outcome, "manual_review", name);
    }
});

test("page coverage requires each page to map both ways and does not accept unknown pages", () => {
    const attachment = baseAnalysis().attachments[0];
    assert.equal(hasCompletePageCoverage(attachment), true);
    attachment.pages[1].documentIds = [];
    assert.equal(hasCompletePageCoverage(attachment), false);
});

test("missing, unreliable, issuing-country, and nationality evidence cannot drive country matching", () => {
    for (const evidence of [
        undefined,
        { kind: "residence_country", reliable: false, value: "DE" },
        { kind: "issuing_country", reliable: true, value: "DE" },
        { kind: "nationality", reliable: true, value: "DE" },
    ]) {
        const analysis = baseAnalysis();
        analysis.attachments[0].documents[0].countryEvidence = evidence;
        assert.equal(evaluate(analysis).outcome, "manual_review");
        assert.equal(getOwnerIdFallbackIneligibilityReason(analysis, "owner"), "reliable_residence_country_missing");
    }
});

test("strong same-mail resolution has precedence; unresolved or contradictory strong signals block fallback", () => {
    const analysis = baseAnalysis();
    const strongMatch = decideOwnerIdAssignment({ analysis, ownerDocumentId: "owner", countryCode: "DE", countryCandidates: [{ id: "different" }], dateRange: getOwnerIdFallbackDateRange(analysis.receivedAt), strongResolution: { kind: "matched", saleId: "confirmed", source: "same_email_identifier" } });
    assert.equal(strongMatch.saleId, "confirmed");
    assert.equal(strongMatch.assignmentSource, "same_email_identifier");
    const conflict = decideOwnerIdAssignment({ analysis, ownerDocumentId: "owner", countryCode: "DE", countryCandidates: [{ id: "sale-1" }], dateRange: getOwnerIdFallbackDateRange(analysis.receivedAt), strongResolution: { kind: "unresolved", reason: "strong_identifier_conflict" } });
    assert.equal(conflict.outcome, "manual_review");
    assert.equal(conflict.saleId, null);
});

test("Berlin calendar range is stable, inclusive, and exactly 21 calendar dates", () => {
    assert.equal(getBerlinCalendarDate("2026-10-20T23:30:00.000Z"), "2026-10-21");
    assert.deepEqual(getOwnerIdFallbackDateRange("2026-10-20T23:30:00.000Z"), { startDate: "2026-10-01", endDate: "2026-10-21" });
    const range = getOwnerIdFallbackDateRange("2026-03-29T00:30:00.000Z");
    assert.deepEqual(range, { startDate: "2026-03-09", endDate: "2026-03-29" });
});

test("candidate filtering uses same company, exact date bounds, country, and excludes cancelled/missing dates", () => {
    const filtered = findCountryFallbackCandidates({
        companyId: "company-a", countryCode: "DE", startDate: "2026-10-01", endDate: "2026-10-21",
        sales: [
            { id: "inside-start", companyId: "company-a", saleDate: "2026-10-01", status: "completed", customerCountryCode: "DE" },
            { id: "inside-end", companyId: "company-a", saleDate: "2026-10-21", status: "active", customerCountryCode: "DE" },
            { id: "wrong-company", companyId: "company-b", saleDate: "2026-10-10", status: "active", customerCountryCode: "DE" },
            { id: "cancelled", companyId: "company-a", saleDate: "2026-10-10", status: "cancelled", customerCountryCode: "DE" },
            { id: "draft", companyId: "company-a", saleDate: "2026-10-10", status: "draft", customerCountryCode: "DE" },
            { id: "missing-date", companyId: "company-a", saleDate: null, status: "active", customerCountryCode: "DE" },
            { id: "wrong-country", companyId: "company-a", saleDate: "2026-10-10", status: "active", customerCountryCode: "AT" },
        ],
    });
    assert.deepEqual(filtered.map((candidate) => candidate.id), ["inside-start", "inside-end"]);
});

test("owner residence country and customer country normalize to ISO codes without treating other country fields as equivalent", () => {
    assert.equal(getCustomerCountryCode("Deutschland"), "DE");
    assert.equal(getCustomerCountryCode("DE"), "DE");
    assert.equal(getCustomerCountryCode("not-a-country"), null);
});

test("migration and endpoint keep queue storage private and manual assignment atomic", () => {
    const migration = readFileSync("supabase/migrations/20261021100000_add_owner_id_country_fallback_intakes.sql", "utf8");
    const route = readFileSync("app/api/automation/document-returns/owner-id/intake/route.ts", "utf8");
    const manualActions = readFileSync("app/dashboard/unassigned-documents/actions.ts", "utf8");
    assert.match(migration, /unique \(company_id, idempotency_key\)/);
    assert.match(migration, /for update/);
    assert.match(migration, /parent_original_upload_id/);
    assert.match(migration, /'not_applicable', 'needs_review'/);
    assert.match(migration, /grant execute[\s\S]*to service_role/);
    assert.match(route, /authenticateAutomationRequest/);
    assert.match(route, /\.eq\("company_id", auth\.companyId\)/);
    assert.match(route, /findCountryFallbackCandidates/);
    assert.match(route, /\.received_at/);
    assert.match(route, /PDFDocument\.load/);
    assert.match(route, /original_page_count_mismatch/);
    assert.match(route, /processing_status === "error"/);
    assert.doesNotMatch(route, /saleId\s*:\s*z\.string/);
    assert.match(manualActions, /assign_automation_owner_id_intake/);
});
