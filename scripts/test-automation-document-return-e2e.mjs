import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
    "AUTOMATION_TEST_BASE_URL",
    "AUTOMATION_API_TOKEN",
    "AUTOMATION_TEST_SALE_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
];

if (process.env.AUTOMATION_TEST_ALLOW_WRITES !== "true") {
    throw new Error("Abbruch: AUTOMATION_TEST_ALLOW_WRITES muss ausdrücklich auf true gesetzt sein.");
}
for (const name of requiredEnv) {
    if (!process.env[name]) throw new Error(`Abbruch: ${name} fehlt.`);
}

const baseUrl = process.env.AUTOMATION_TEST_BASE_URL.replace(/\/$/, "");
const token = process.env.AUTOMATION_API_TOKEN;
const saleId = process.env.AUTOMATION_TEST_SALE_ID;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const authHeaders = { Authorization: `Bearer ${token}` };
const runId = `automation-e2e-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

async function json(response) {
    const body = await response.json().catch(() => ({}));
    return { response, body };
}

async function makePdf(label) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(`WAW AUTOMATION E2E TEST - ${label}`, { x: 50, y: 780, size: 14, font });
    page.drawText(`Run: ${runId}`, { x: 50, y: 750, size: 10, font });
    return Buffer.from(await pdf.save());
}

function uploadForm(pdf, fields) {
    const form = new FormData();
    form.set("file", new Blob([pdf], { type: "application/pdf" }), `${runId}.pdf`);
    for (const [key, value] of Object.entries(fields)) {
        if (value !== null && value !== undefined) form.set(key, String(value));
    }
    return form;
}

async function uploadDocument({ pdf, key, fields }) {
    return json(await fetch(`${baseUrl}/api/automation/sales/${saleId}/documents`, {
        method: "POST",
        headers: { ...authHeaders, "Idempotency-Key": key },
        body: uploadForm(pdf, fields),
    }));
}

// Hard safety gate: this script never creates sales, invoices, customers or vehicles.
const { data: sale, error: saleError } = await supabase.from("sales")
    .select("id, sale_identifier, notes, vehicle_id, buyer_customer_id, vehicles(vin), customers(type, company_name, first_name, last_name, email), invoices(id, invoice_number)")
    .eq("id", saleId).maybeSingle();
if (saleError || !sale) throw new Error("Die konfigurierte Test-Verkaufsakte wurde nicht gefunden.");
const customer = Array.isArray(sale.customers) ? sale.customers[0] : sale.customers;
const vehicle = Array.isArray(sale.vehicles) ? sale.vehicles[0] : sale.vehicles;
const invoices = Array.isArray(sale.invoices) ? sale.invoices : sale.invoices ? [sale.invoices] : [];
assert.match(sale.notes ?? "", /\[AUTOMATION-E2E\]/, "Testverkauf muss im Notizfeld [AUTOMATION-E2E] tragen.");
assert.match(customer?.email ?? "", /@example\.invalid$/i, "Testkunde muss eine @example.invalid-Adresse verwenden.");
assert.match(vehicle?.vin ?? "", /TEST/i, "Testfahrgestellnummer muss TEST enthalten.");
assert.ok(invoices.length > 0, "Die isolierte Testakte benötigt eine Testrechnung.");
assert.ok(invoices.some((invoice) => /TEST/i.test(invoice.invoice_number ?? "")), "Die Testrechnung muss TEST in ihrer Rechnungsnummer tragen.");

const saleIdentifier = sale.sale_identifier;
const commonFields = {
    documentType: "handover_protocol",
    saleIdentifier,
    signatureStatus: "absent",
    reviewStatus: "needs_review",
    reviewReason: "Automatisierter E2E-Test – keine echte Kundenunterlage",
    returnId: runId,
    sourceEmailId: `${runId}-mail`,
    sourceAttachmentId: `${runId}-attachment`,
    receivedAt: new Date().toISOString(),
};

const resolved = await json(await fetch(`${baseUrl}/api/automation/sales/resolve`, {
    method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ saleIdentifier }),
}));
assert.equal(resolved.response.status, 200);
assert.equal(resolved.body.status, "matched");
assert.equal(resolved.body.sale.saleId, saleId);

const conflict = await json(await fetch(`${baseUrl}/api/automation/sales/resolve`, {
    method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ saleIdentifier, vin: `${vehicle.vin}-WIDERSPRUCH` }),
}));
assert.equal(conflict.body.status, "conflict");

const unauthorized = await fetch(`${baseUrl}/api/automation/sales/resolve`, {
    method: "POST", headers: { Authorization: "Bearer invalid-e2e-token", "Content-Type": "application/json" },
    body: JSON.stringify({ saleIdentifier }),
});
assert.equal(unauthorized.status, 401);

const originalPdf = await makePdf("ORIGINAL");
const originalKey = `${runId}:original:v1`;
const original = await json(await fetch(`${baseUrl}/api/automation/document-returns/originals`, {
    method: "POST", headers: { ...authHeaders, "Idempotency-Key": originalKey },
    body: uploadForm(originalPdf, {
        returnId: runId,
        sourceEmailId: `${runId}-mail`,
        sourceAttachmentId: `${runId}-attachment`,
        receivedAt: commonFields.receivedAt,
    }),
}));
assert.equal(original.response.status, 201);

const unsignedPdf = await makePdf("UNSIGNED DERIVED PAGES 1,2");
const unsignedKey = `${runId}:handover:pages-1-2:v1`;
const unsigned = await uploadDocument({
    pdf: unsignedPdf,
    key: unsignedKey,
    fields: { ...commonFields, originalUploadId: original.body.originalUploadId, originalPageNumbers: "1,2" },
});
assert.equal(unsigned.response.status, 201);

const replay = await uploadDocument({
    pdf: unsignedPdf,
    key: unsignedKey,
    fields: { ...commonFields, originalUploadId: original.body.originalUploadId, originalPageNumbers: "1,2" },
});
assert.equal(replay.response.status, 200);
assert.equal(replay.body.documentId, unsigned.body.documentId);

const changedContent = await uploadDocument({
    pdf: await makePdf("CHANGED CONTENT"),
    key: unsignedKey,
    fields: { ...commonFields, originalUploadId: original.body.originalUploadId, originalPageNumbers: "1,2" },
});
assert.equal(changedContent.response.status, 409);

const requirementsBeforeCorrection = await json(await fetch(`${baseUrl}/api/automation/sales/${saleId}/document-requirements`, { headers: authHeaders }));
assert.equal(requirementsBeforeCorrection.response.status, 200);
const handoverBefore = requirementsBeforeCorrection.body.requirements.find((item) => item.documentType === "handover_protocol");
assert.equal(handoverBefore?.fulfilled, false);

const parallelPdf = await makePdf("PARALLEL IDEMPOTENCY");
const parallelKey = `${runId}:parallel:v1`;
const parallelFields = { ...commonFields, documentType: "transport_proof", sourceAttachmentId: `${runId}-parallel` };
const parallelResults = await Promise.all([
    uploadDocument({ pdf: parallelPdf, key: parallelKey, fields: parallelFields }),
    uploadDocument({ pdf: parallelPdf, key: parallelKey, fields: parallelFields }),
]);
assert.ok(parallelResults.some(({ response }) => response.status === 201));
assert.ok(parallelResults.every(({ response }) => [200, 201, 202].includes(response.status)));

const correction = await uploadDocument({
    pdf: await makePdf("CORRECTED SIGNED VERSION"),
    key: `${runId}:handover:pages-1-2:v2`,
    fields: {
        ...commonFields,
        signatureStatus: "present",
        reviewStatus: "accepted",
        replacesDocumentId: unsigned.body.documentId,
        originalUploadId: original.body.originalUploadId,
        originalPageNumbers: "1,2",
    },
});
assert.equal(correction.response.status, 201);
assert.equal(correction.body.documentId, unsigned.body.documentId);
assert.notEqual(correction.body.documentVersionId, unsigned.body.documentVersionId);

const { data: document, error: documentError } = await supabase.from("documents")
    .select("id, sale_id, active_version_id, file_path, source")
    .eq("id", unsigned.body.documentId).eq("sale_id", saleId).single();
if (documentError || !document) throw new Error("Testdokument ist nicht in der richtigen Verkaufsakte sichtbar.");
assert.equal(document.source, "automation_return");
assert.equal(document.active_version_id, correction.body.documentVersionId);
const { data: versions, error: versionError } = await supabase.from("document_versions")
    .select("id").eq("document_id", document.id);
if (versionError) throw versionError;
assert.ok((versions ?? []).length >= 2);
const { data: openedFile, error: openError } = await supabase.storage.from("documents").download(document.file_path);
if (openError || !openedFile || openedFile.size === 0) throw new Error("Die aktive Test-PDF konnte nicht aus dem privaten Storage geöffnet werden.");

const { data: provenance, error: provenanceError } = await supabase.from("automation_return_uploads")
    .select("parent_original_upload_id, original_page_numbers")
    .eq("id", correction.body.uploadId).single();
if (provenanceError) throw provenanceError;
assert.equal(provenance.parent_original_upload_id, original.body.originalUploadId);
assert.deepEqual(provenance.original_page_numbers, [1, 2]);

console.log(JSON.stringify({
    status: "passed",
    runId,
    saleId,
    documentId: document.id,
    checks: [
        "resolve", "conflict", "unauthorized", "original-storage", "derived-link",
        "unsigned-requirement", "sequential-idempotency", "parallel-idempotency",
        "idempotency-conflict", "correction-version", "private-storage-download",
    ],
}, null, 2));
