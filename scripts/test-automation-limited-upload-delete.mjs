import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

const phase = process.argv[2];
if (phase !== "upload" && phase !== "verify-deleted") {
    throw new Error("Aufruf: npm run test:automation:limited -- upload|verify-deleted");
}
if (process.env.AUTOMATION_TEST_ALLOW_WRITES !== "true") {
    throw new Error("Abbruch: AUTOMATION_TEST_ALLOW_WRITES muss ausdrücklich true sein.");
}

const required = [
    "AUTOMATION_TEST_BASE_URL",
    "AUTOMATION_API_TOKEN",
    "AUTOMATION_TEST_SALE_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_WAW_COMPANY_ID",
    "SUPABASE_SERVICE_ROLE_KEY",
];
for (const name of required) {
    if (!process.env[name]) throw new Error(`Abbruch: ${name} fehlt in .env.local.`);
}

const saleId = process.env.AUTOMATION_TEST_SALE_ID;
const baseUrl = process.env.AUTOMATION_TEST_BASE_URL.replace(/\/$/, "");
const token = process.env.AUTOMATION_API_TOKEN;
const manifestPath = process.env.AUTOMATION_LIMITED_TEST_MANIFEST ?? `/tmp/waw-automation-upload-test-${saleId}.json`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function getSale() {
    const { data, error } = await supabase.from("sales")
        .select("id, company_id, sale_identifier")
        .eq("id", saleId).eq("company_id", process.env.NEXT_PUBLIC_WAW_COMPANY_ID).maybeSingle();
    if (error || !data) throw new Error("Die ausdrücklich konfigurierte Verkaufsakte wurde nicht gefunden.");
    return data;
}

async function getDocuments() {
    const { data, error } = await supabase.from("documents")
        .select("id, active_version_id, file_path, status, source")
        .eq("company_id", process.env.NEXT_PUBLIC_WAW_COMPANY_ID).eq("sale_id", saleId);
    if (error) throw new Error(`Dokumentbestand konnte nicht gelesen werden: ${error.code}`);
    return data ?? [];
}

async function makePdf() {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText("AUTOMATION UPLOAD TEST", { x: 72, y: 760, size: 20, font });
    page.drawText("Synthetic test file - no customer document", { x: 72, y: 725, size: 11 });
    return Buffer.from(await pdf.save());
}

const sale = await getSale();

if (phase === "upload") {
    const baselineDocuments = await getDocuments();
    const testRunId = `limited-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const idempotencyKey = `${testRunId}:automation-upload-test:v1`;
    const pdf = await makePdf();
    const form = new FormData();
    form.set("file", new Blob([pdf], { type: "application/pdf" }), "AUTOMATION-UPLOAD-TEST.pdf");
    form.set("documentType", "handover_protocol");
    form.set("saleIdentifier", sale.sale_identifier);
    form.set("signatureStatus", "absent");
    form.set("reviewStatus", "needs_review");
    form.set("reviewReason", "Begrenzter synthetischer Upload-und-Lösch-Test");
    form.set("returnId", testRunId);
    form.set("sourceEmailId", `${testRunId}-no-email-sent`);
    form.set("sourceAttachmentId", `${testRunId}-synthetic-pdf`);
    form.set("receivedAt", new Date().toISOString());

    const response = await fetch(`${baseUrl}/api/automation/sales/${saleId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": idempotencyKey },
        body: form,
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status, 201, `Upload fehlgeschlagen: HTTP ${response.status} ${JSON.stringify(body)}`);
    assert.ok(body.uploadId && body.documentId && body.documentVersionId, "Uploadantwort enthält nicht alle IDs.");

    const { data: upload, error: uploadError } = await supabase.from("automation_return_uploads")
        .select("id, document_id, document_version_id, storage_path, parent_original_upload_id, signature_status, review_status")
        .eq("id", body.uploadId).eq("company_id", sale.company_id).single();
    if (uploadError || !upload) throw new Error("Ledger-Eintrag wurde nicht gefunden.");
    assert.equal(upload.document_id, body.documentId);
    assert.equal(upload.document_version_id, body.documentVersionId);
    assert.equal(upload.parent_original_upload_id, null);
    assert.equal(upload.signature_status, "absent");
    assert.equal(upload.review_status, "needs_review");

    const { data: storedFile, error: storageError } = await supabase.storage.from("documents").download(upload.storage_path);
    if (storageError || !storedFile || storedFile.size === 0) throw new Error("Synthetische PDF ist nicht im privaten Storage lesbar.");

    const requirementsResponse = await fetch(`${baseUrl}/api/automation/sales/${saleId}/document-requirements`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const requirements = await requirementsResponse.json();
    assert.equal(requirementsResponse.status, 200);
    const createdReturn = requirements.existingReturns.find((item) => item.uploadId === body.uploadId);
    assert.ok(createdReturn, "Rücklauf fehlt in der Anforderungsantwort.");
    assert.equal(createdReturn.satisfiesSignedReturn, false);

    const manifest = {
        version: 1,
        phase: "uploaded",
        createdAt: new Date().toISOString(),
        baseUrl,
        companyId: sale.company_id,
        saleId,
        saleIdentifier: sale.sale_identifier,
        testRunId,
        idempotencyKey,
        fileName: "AUTOMATION-UPLOAD-TEST.pdf",
        uploadId: body.uploadId,
        documentId: body.documentId,
        documentVersionId: body.documentVersionId,
        storagePath: upload.storage_path,
        baselineDocuments,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ status: "uploaded", manifestPath, saleId, uploadId: body.uploadId, documentId: body.documentId, documentVersionId: body.documentVersionId }, null, 2));
    process.exit(0);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.saleId, saleId, "Manifest gehört zu einer anderen Verkaufsakte.");
assert.equal(manifest.companyId, sale.company_id, "Manifest gehört zu einem anderen Unternehmen.");

const [{ data: document }, { data: version }, { data: upload }, storageResult] = await Promise.all([
    supabase.from("documents").select("id").eq("id", manifest.documentId).maybeSingle(),
    supabase.from("document_versions").select("id").eq("id", manifest.documentVersionId).maybeSingle(),
    supabase.from("automation_return_uploads").select("id").eq("id", manifest.uploadId).maybeSingle(),
    supabase.storage.from("documents").download(manifest.storagePath),
]);
assert.equal(document, null, "Der Test-Dokumentdatensatz existiert noch.");
assert.equal(version, null, "Die Test-Dokumentversion existiert noch.");
assert.equal(upload, null, "Der Test-Ledger-Eintrag existiert noch.");
assert.ok(storageResult.error, "Die Testdatei existiert noch im privaten Storage.");

const currentDocuments = await getDocuments();
const currentById = new Map(currentDocuments.map((item) => [item.id, item]));
for (const baseline of manifest.baselineDocuments) {
    const current = currentById.get(baseline.id);
    assert.ok(current, `Vorhandenes Dokument ${baseline.id} wurde versehentlich entfernt.`);
    assert.equal(current.active_version_id, baseline.active_version_id, `Aktive Version von ${baseline.id} wurde verändert.`);
    assert.equal(current.file_path, baseline.file_path, `Storage-Pfad von ${baseline.id} wurde verändert.`);
}

const requirementsResponse = await fetch(`${baseUrl}/api/automation/sales/${saleId}/document-requirements`, {
    headers: { Authorization: `Bearer ${token}` },
});
const requirements = await requirementsResponse.json();
assert.equal(requirementsResponse.status, 200);
assert.equal(requirements.existingReturns.some((item) => item.uploadId === manifest.uploadId), false);

console.log(JSON.stringify({ status: "deleted-and-verified", manifestPath, saleId, removed: {
    uploadId: manifest.uploadId,
    documentId: manifest.documentId,
    documentVersionId: manifest.documentVersionId,
    storagePath: manifest.storagePath,
}, baselineDocumentsVerified: manifest.baselineDocuments.length }, null, 2));
