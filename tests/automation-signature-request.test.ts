import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    canonicalizeSignatureRequestDocumentTypes,
    createSignatureRequestFingerprint,
    createSignatureRequestReservation,
    getRemainingSignatureRequestDocumentTypes,
    hashSignatureRequestReservation,
} from "../lib/automation/signature-request.ts";

test("signature request document types are canonical and only required unfulfilled types remain", () => {
    assert.deepEqual(
        canonicalizeSignatureRequestDocumentTypes(["transport_proof", "entry_certificate", "transport_proof"]),
        ["entry_certificate", "transport_proof"],
    );
    assert.deepEqual(getRemainingSignatureRequestDocumentTypes({
        requested: ["handover_protocol", "transport_proof", "entry_certificate"],
        required: ["entry_certificate", "handover_protocol"],
        fulfilled: new Set(["entry_certificate"]),
    }), ["handover_protocol"]);
});

test("same semantic request has a stable fingerprint while changed inputs conflict", () => {
    const first = createSignatureRequestFingerprint({
        saleId: "00000000-0000-4000-8000-000000000001",
        originalDocumentTypes: canonicalizeSignatureRequestDocumentTypes(["transport_proof", "entry_certificate"]),
    });
    const repeated = createSignatureRequestFingerprint({
        saleId: "00000000-0000-4000-8000-000000000001",
        originalDocumentTypes: canonicalizeSignatureRequestDocumentTypes(["entry_certificate", "transport_proof"]),
    });
    const changedSale = createSignatureRequestFingerprint({
        saleId: "00000000-0000-4000-8000-000000000002",
        originalDocumentTypes: ["entry_certificate", "transport_proof"],
    });
    assert.equal(first, repeated);
    assert.notEqual(first, changedSale);
    assert.match(first, /^[a-f0-9]{64}$/);
});

test("reservation tokens are random and only their hashes need storage", () => {
    const first = createSignatureRequestReservation();
    const second = createSignatureRequestReservation();
    assert.notEqual(first.token, second.token);
    assert.equal(hashSignatureRequestReservation(first.token), first.tokenHash);
    assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
});

test("migration makes claim and result recording atomic and non-reclaiming for unclear delivery", () => {
    const migration = readFileSync(
        "supabase/migrations/20261012220000_add_automation_signature_requests.sql",
        "utf8",
    );

    assert.match(migration, /unique index if not exists automation_signature_requests_company_notification_key/);
    assert.match(migration, /on conflict \(company_id, notification_key\) do nothing/);
    assert.match(migration, /for update/);
    assert.match(migration, /existing_request\.status = 'failed'/);
    assert.match(migration, /when 'processing' then 'processing'/);
    assert.match(migration, /when 'sent' then 'already_sent'/);
    assert.match(migration, /target_request\.status = 'unknown'/);
    assert.match(migration, /unknown_requires_review/);
    assert.doesNotMatch(migration, /interval\s+'|stale|expired/i);
    assert.match(migration, /grant execute[\s\S]*to service_role/);
});

test("claim endpoint reuses buyer relation and signed-return requirement rules without sending mail", () => {
    const route = readFileSync("app/api/automation/signature-requests/claim/route.ts", "utf8");
    const resultRoute = readFileSync("app/api/automation/signature-requests/[requestId]/result/route.ts", "utf8");

    assert.match(route, /customers:buyer_customer_id\(country, email\)/);
    assert.match(route, /getStampDocumentKeysForSaleType/);
    assert.match(route, /isSignedReturnSatisfied/);
    assert.match(route, /document\.source === "uploaded" && document\.status === "available"/);
    assert.match(route, /\.eq\("archive_status", "ACTIVE"\)/);
    assert.match(route, /\.eq\("company_id", auth\.companyId\)/);
    assert.match(route, /claim_automation_signature_request/);
    assert.match(route, /allowSend: true/);
    assert.match(route, /allowSend: false/);
    assert.doesNotMatch(route, /resend|sendEmail|emails\.send/i);
    assert.match(resultRoute, /record_automation_signature_request_result/);
    assert.match(resultRoute, /hashSignatureRequestReservation/);
});
