import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
    getAutomationReturnDocumentStatus,
    isSignedReturnSatisfied,
} from "../lib/automation/document-return-status.ts";
import { isUuid } from "../lib/automation/validation.ts";
import { getStampDocumentKeysForSaleRule } from "../lib/sales/stamp-document-requirement-rules.ts";
import { isRequiredDocumentAvailable } from "../lib/sales/required-document-availability.ts";

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
