import assert from "node:assert/strict";
import test from "node:test";

import { isSignedReturnSatisfied } from "../lib/automation/document-return-status.ts";
import { isUuid } from "../lib/automation/validation.ts";

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
