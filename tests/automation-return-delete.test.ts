import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261007100000_delete_automation_return_document_version.sql", "utf8");
const action = readFileSync("app/dashboard/sales/[saleId]/actions.ts", "utf8");
const detail = readFileSync("components/sales/sale-detail.tsx", "utf8");

test("automation return deletion is restricted to admins and uses staged storage cleanup", () => {
    assert.match(action, /userContext\.profile\.role !== "admin"/);
    assert.match(action, /stagePrivateDocumentFilesForDelete/);
    assert.match(action, /delete_automation_return_document_version/);
    assert.match(action, /restoreStagedPrivateDocumentFiles/);
    assert.match(action, /finalizeStagedPrivateDocumentDeletes/);
});

test("automation return documents expose the existing delete control in the sale file", () => {
    assert.match(detail, /document\.source === "automation_return"/);
    assert.match(detail, /requiredDocument\.document\.source === "automation_return"/);
});

test("delete RPC removes only the selected derived upload and active version", () => {
    assert.match(migration, /delete from public\.automation_return_uploads\s+where id = target_upload\.id/);
    assert.match(migration, /delete from public\.document_versions\s+where id = target_version\.id/);
    assert.doesNotMatch(migration, /delete from public\.automation_return_uploads\s+where id = target_upload\.parent_original_upload_id/);
});

test("delete RPC restores an older version instead of deleting it", () => {
    assert.match(migration, /set is_active = true\s+where id = previous_version\.id/);
    assert.match(migration, /active_version_id = previous_version\.id/);
});
