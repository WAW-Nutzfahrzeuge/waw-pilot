import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
    "supabase/migrations/20261013090000_add_automation_return_manual_review.sql",
    "utf8",
);
const action = readFileSync(
    "app/dashboard/sales/[saleId]/automation-return-review-actions.ts",
    "utf8",
);
const checks = readFileSync(
    "lib/pdf/generated-documents/sale-document-checks.ts",
    "utf8",
);
const requirements = readFileSync(
    "app/api/automation/sales/[saleId]/document-requirements/route.ts",
    "utf8",
);
const claim = readFileSync(
    "app/api/automation/signature-requests/claim/route.ts",
    "utf8",
);
const ui = readFileSync(
    "components/sales/automation-return-review-form.tsx",
    "utf8",
);

test("manual automation-return review requires an authenticated admin and company-scoped RPC", () => {
    assert.match(action, /getCurrentUserContext/);
    assert.match(action, /profile\.role !== "admin"/);
    assert.match(action, /userContext\.companyId !== companyId/);
    assert.match(action, /p_company_id: companyId/);
    assert.match(migration, /company_id = p_company_id/);
    assert.match(migration, /sale_id = p_sale_id/);
    assert.match(migration, /source = 'automation_return'/);
});

test("review is bound to the exact active document version", () => {
    assert.match(action, /p_document_version_id: documentVersionId/);
    assert.match(migration, /active_version_id is distinct from p_document_version_id/);
    assert.match(migration, /document_version_id = p_document_version_id/);
    assert.match(migration, /is_active = true/);
    assert.match(migration, /inactive_version/);
});

test("accept and reject update return, document and audit atomically with idempotency", () => {
    assert.match(migration, /when p_decision = 'accepted' then 'present'/);
    assert.match(migration, /when p_decision = 'accepted' then 'available' else 'needs_review'/);
    assert.match(migration, /review_status = next_review_status/);
    assert.match(migration, /reviewed_by = p_reviewer_id/);
    assert.match(migration, /reviewed_at = now\(\)/);
    assert.match(migration, /insert into public\.document_audit_log/);
    assert.match(migration, /AUTOMATION_RETURN_ACCEPTED/);
    assert.match(migration, /AUTOMATION_RETURN_REJECTED/);
    assert.match(migration, /return query select 'idempotent'/);
    assert.match(migration, /unique index if not exists document_audit_log_one_automation_return_review_per_version/);
});

test("reject keeps the existing signature assessment and requires a reason", () => {
    assert.match(migration, /else target_upload\.signature_status/);
    assert.match(migration, /rejection reason is required/);
    assert.match(action, /Bitte gib einen kurzen Ablehnungsgrund an/);
    assert.match(ui, /name="reason"/);
    assert.match(ui, /required/);
});

test("approval requires the explicit visible-customer-signature confirmation", () => {
    assert.match(ui, /Ich habe das Dokument geprüft\. Es gehört zu diesem Verkauf und die erforderliche Unterschrift ist sichtbar vorhanden\./);
    assert.match(ui, /bestätigt weder Echtheit noch rechtliche Gültigkeit/);
    assert.match(ui, /name="review_confirmation"/);
    assert.match(action, /review_confirmation/);
});

test("approved active version satisfies requirements and suppresses another signature request", () => {
    assert.match(requirements, /isSignedReturnSatisfied/);
    assert.match(claim, /isSignedReturnSatisfied/);
    assert.match(checks, /automation_return_uploads/);
    assert.match(checks, /createAutomationSupabaseClient/);
    assert.match(checks, /review_status/);
    assert.match(claim, /document\.source === "uploaded" && document\.status === "available"/);
});

test("the sale UI preserves file access and exposes review controls only for pending states", () => {
    const card = readFileSync("components/sales/sale-generated-documents-card.tsx", "utf8");
    assert.match(card, /reviewStatus === "pending"/);
    assert.match(card, /reviewStatus === "needs_review"/);
    assert.match(card, /AutomationReturnReviewForm/);
    assert.match(card, /\/api\/documents\/\$\{automationReturn\.id\}\/file/);
    assert.match(card, /download=1/);
    assert.match(card, /Prüfstatus:/);
});
