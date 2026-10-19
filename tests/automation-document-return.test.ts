import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
    getAutomationReturnDocumentStatus,
    isSignedReturnSatisfied,
} from "../lib/automation/document-return-status.ts";
import { isUuid } from "../lib/automation/validation.ts";
import { getStampDocumentKeysForSaleRule } from "../lib/sales/stamp-document-requirement-rules.ts";
import { hasAvailableAcceptedDocumentType, isRequiredDocumentAvailable } from "../lib/sales/required-document-availability.ts";

test("sale and document identifiers must be UUIDs before database access", () => {
    assert.equal(isUuid("00000000-0000-4000-8000-000000000000"), true);
    assert.equal(isUuid("not-a-sale-id"), false);
});

test("unsigned and uncertain returns never satisfy a signed-return requirement", () => {
    for (const signatureStatus of ["absent", "uncertain"]) {
        assert.equal(isSignedReturnSatisfied({
            signatureStatus,
            reviewStatus: "pending",
            documentId: "document-1",
            documentVersionId: "version-1",
            activeVersionId: "version-1",
        }), false);
    }
});

test("a rejected return does not satisfy the requirement", () => {
    assert.equal(isSignedReturnSatisfied({
        signatureStatus: "present",
        reviewStatus: "rejected",
        documentId: "document-1",
        documentVersionId: "version-1",
        activeVersionId: "version-1",
    }), false);
});

test("a detected signature still requires explicit acceptance", () => {
    for (const reviewStatus of ["pending", "needs_review", "rejected"]) {
        assert.equal(isSignedReturnSatisfied({
            signatureStatus: "present",
            reviewStatus,
            documentId: "document-1",
            documentVersionId: "version-1",
            activeVersionId: "version-1",
        }), false);
        assert.equal(getAutomationReturnDocumentStatus({
            signatureStatus: "present",
            reviewStatus,
        }), "needs_review");
    }

    assert.equal(getAutomationReturnDocumentStatus({
        signatureStatus: "present",
        reviewStatus: "accepted",
    }), "available");
});

test("Ausweis und kanonischer Handelsregisterauszug werden ohne Signatur als prüfpflichtig behandelt", () => {
    for (const documentType of ["owner_id", "commercial_register"]) {
        assert.equal(getAutomationReturnDocumentStatus({
            documentType,
            signatureStatus: "not_applicable",
            reviewStatus: "needs_review",
        }), "needs_review");
        assert.equal(getAutomationReturnDocumentStatus({
            documentType,
            signatureStatus: "not_applicable",
            reviewStatus: "accepted",
        }), "available");
    }
    assert.equal(getAutomationReturnDocumentStatus({
        documentType: "owner_id",
        signatureStatus: "present",
        reviewStatus: "accepted",
    }), "needs_review");
});

test("generated unsigned source documents do not satisfy signed-return requirements", () => {
    for (const documentType of ["handover_protocol", "entry_certificate", "transport_proof"]) {
        assert.equal(isRequiredDocumentAvailable({
            document_type: documentType,
            source: "generated",
            status: "needs_review",
        }), false);
    }

    assert.equal(isRequiredDocumentAvailable({
        document_type: "handover_protocol",
        source: "uploaded",
        status: "available",
    }), true);
    assert.equal(isRequiredDocumentAvailable({
        document_type: "handover_protocol",
        source: "automation_return",
        status: "available",
    }), true);
});

test("only the active corrected document version can satisfy the requirement", () => {
    assert.equal(isSignedReturnSatisfied({
        signatureStatus: "present",
        reviewStatus: "accepted",
        documentId: "document-1",
        documentVersionId: "version-1",
        activeVersionId: "version-2",
    }), false);
    assert.equal(isSignedReturnSatisfied({
        signatureStatus: "present",
        reviewStatus: "accepted",
        documentId: "document-1",
        documentVersionId: "version-2",
        activeVersionId: "version-2",
    }), true);
});

test("automation requirements reuse the existing inland, EU and third-country rules", () => {
    assert.deepEqual(getStampDocumentKeysForSaleRule("inland"), ["handover_protocol"]);
    assert.deepEqual(getStampDocumentKeysForSaleRule("eu"), ["entry_certificate", "transport_proof", "handover_protocol"]);
    assert.deepEqual(getStampDocumentKeysForSaleRule("export_third_country"), []);
});

test("sale UI recognizes automation returns without allowing manual overwrite", () => {
    const checks = readFileSync("lib/pdf/generated-documents/sale-document-checks.ts", "utf8");
    const actions = readFileSync("app/dashboard/sales/[saleId]/actions.ts", "utf8");
    const detail = readFileSync("components/sales/sale-detail.tsx", "utf8");
    const route = readFileSync("app/api/automation/sales/[saleId]/documents/route.ts", "utf8");

    assert.match(checks, /document\.source === "automation_return"/);
    assert.match(checks, /document\.status === "needs_review"/);
    assert.match(checks, /\.eq\("archive_status", "ACTIVE"\)/);
    assert.match(checks, /\.not\("active_version_id", "is", null\)/);
    assert.match(actions, /automatisierter Rücklauf kann nicht durch einen manuellen Upload überschrieben werden/);
    assert.match(detail, /requiredDocument\.document\?\.source === "uploaded"/);
    assert.match(route, /requestId/);
    assert.match(route, /databaseCode/);
    assert.match(route, /storageCleanupSucceeded/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY.*console/);
});

test("automation return migration extends the deployed document source constraint", () => {
    const migration = readFileSync(
        "supabase/migrations/20261012150000_allow_automation_return_document_source.sql",
        "utf8",
    );

    assert.match(migration, /documents_source_check/);
    assert.match(migration, /pg_get_expr/);
    assert.match(migration, /automation_return/);
    assert.match(migration, /validate constraint documents_source_check/);
});

test("fixed optional register and existing owner-id types use the protected return upload and review paths", () => {
    const route = readFileSync("app/api/automation/sales/[saleId]/documents/route.ts", "utf8");
    const reviewAction = readFileSync("app/dashboard/sales/[saleId]/automation-return-review-actions.ts", "utf8");
    const signatureRequest = readFileSync("lib/automation/signature-request.ts", "utf8");
    const requiredDocuments = readFileSync("lib/sales/sale-required-documents.ts", "utf8");
    const detail = readFileSync("components/sales/sale-detail.tsx", "utf8");
    const migration = readFileSync("supabase/migrations/20261019120000_add_fixed_sale_identity_documents.sql", "utf8");
    const canonicalMigration = readFileSync("supabase/migrations/20261020100000_unify_sale_commercial_register_type.sql", "utf8");

    assert.match(route, /nonSignatureDocumentTypes = \["owner_id", "commercial_register"\]/);
    assert.match(route, /signatureStatus = "not_applicable"/);
    assert.match(route, /reviewStatus = "needs_review"/);
    assert.match(reviewAction, /review_automation_fixed_sale_document/);
    assert.match(reviewAction, /isFixedIdentityDocument/);
    assert.match(reviewAction, /decision === "accepted" && requiresSignature/);
    assert.match(signatureRequest, /"handover_protocol"/);
    assert.doesNotMatch(signatureRequest, /owner_id|commercial_register/);
    assert.match(detail, /hasCommercialRegisterRequirement/);
    assert.match(detail, /!hasCommercialRegisterRequirement/);
    assert.match(requiredDocuments, /documentType: "owner_id"/);
    assert.doesNotMatch(requiredDocuments, /sale_commercial_register/);
    assert.match(detail, /requiredDocument\.documentType === "owner_id"/);
    assert.match(detail, /ReclassifySaleCustomDocumentForm/);
    assert.match(migration, /signature_status in \('present', 'absent', 'uncertain', 'not_applicable'\)/);
    assert.match(migration, /active_version_id = p_document_version_id/);
    assert.match(migration, /SALE_DOCUMENT_RECLASSIFIED/);
    assert.match(canonicalMigration, /document_type in \('owner_id', 'commercial_register'\)/);
    assert.match(canonicalMigration, /and signature_status = 'not_applicable'/);
    assert.doesNotMatch(canonicalMigration, /set signature_status\s*=/);
});

test("Inland-Handelsregisteralternative bleibt unverändert und Gewerbeschein allein genügt", () => {
    const requiredDocuments = readFileSync("lib/sales/sale-required-documents.ts", "utf8");
    assert.match(requiredDocuments, /acceptedDocumentTypes: \["commercial_register", "business_registration"\]/);
    const acceptedTypes = ["commercial_register", "business_registration"];

    assert.equal(hasAvailableAcceptedDocumentType(acceptedTypes, [
        { document_type: "business_registration", source: "uploaded", status: "available" },
    ]), true);

    assert.equal(hasAvailableAcceptedDocumentType(acceptedTypes, [
        { document_type: "commercial_register", source: "uploaded", status: "available" },
    ]), true);
});

test("automatischer Handelsregisterauszug erfüllt Inland erst nach Freigabe", () => {
    const acceptedTypes = ["commercial_register", "business_registration"];

    for (const reviewStatus of ["needs_review", "rejected"]) {
        const status = getAutomationReturnDocumentStatus({
            documentType: "commercial_register",
            signatureStatus: "not_applicable",
            reviewStatus,
        });
        assert.equal(status, "needs_review");
        assert.equal(hasAvailableAcceptedDocumentType(acceptedTypes, [
            { document_type: "commercial_register", source: "automation_return", status },
        ]), false);
    }

    const acceptedStatus = getAutomationReturnDocumentStatus({
        documentType: "commercial_register",
        signatureStatus: "not_applicable",
        reviewStatus: "accepted",
    });
    assert.equal(acceptedStatus, "available");
    assert.equal(hasAvailableAcceptedDocumentType(acceptedTypes, [
        { document_type: "commercial_register", source: "automation_return", status: acceptedStatus },
    ]), true);
});

test("außerhalb Inland bleibt das Handelsregisterfeld optional und kanonisch", () => {
    const requiredDocuments = readFileSync("lib/sales/sale-required-documents.ts", "utf8");
    assert.match(requiredDocuments, /if \(saleType === "inland"\)[\s\S]*INLAND_REQUIRED_DOCUMENTS/);
    assert.match(requiredDocuments, /if \(saleType === "eu"\)[\s\S]*EU_REQUIRED_DOCUMENTS/);
    assert.match(requiredDocuments, /if \(saleType === "export_third_country"\)[\s\S]*THIRD_COUNTRY_REQUIRED_DOCUMENTS/);
    const fixedTypes = readFileSync("lib/sales/sale-fixed-document-types.ts", "utf8");
    assert.match(fixedTypes, /saleCommercialRegisterDocumentType = "commercial_register"/);
    const migration = readFileSync("supabase/migrations/20261020100000_unify_sale_commercial_register_type.sql", "utf8");
    assert.match(migration, /where document_type = 'sale_commercial_register'/);
    assert.match(migration, /set document_type = 'commercial_register'/);
    assert.match(migration, /automation_return_uploads/);
    assert.match(migration, /SALE_DOCUMENT_TYPE_CANONICALIZED/);
    assert.doesNotMatch(migration, /storage\.from|storage\.objects|delete from public\.documents/i);
});
