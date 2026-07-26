import assert from "node:assert/strict";
import test from "node:test";

import { ZipArchiveService } from "../src/modules/documents/infrastructure/archive/zip-archive.service.ts";
import { DocumentExportCategoryPolicy } from "../src/modules/documents/domain/policies/document-export-category-policy.ts";
import {
    createUniqueFileName,
    ExportFileNamePolicy,
    normalizeFileNamePart,
} from "../src/modules/documents/domain/policies/export-file-name-policy.ts";

test("DocumentExportCategoryPolicy maps sales file documents to export folders", () => {
    const policy = new DocumentExportCategoryPolicy();

    assert.equal(policy.getCategory("invoice_pdf").folderName, "01_Rechnungen");
    assert.equal(policy.getCategory("proforma_invoice").folderName, "01_Rechnungen");
    assert.equal(policy.getCategory("cancellation_invoice").folderName, "01_Rechnungen");
    assert.equal(policy.getCategory("handover_protocol").folderName, "02_Vertragsunterlagen");
    assert.equal(policy.getCategory("entry_certificate").folderName, "03_Exportnachweise");
    assert.equal(policy.getCategory("bzst_vat_verification_primary").folderName, "03_Exportnachweise");
    assert.equal(policy.getCategory("vehicle_registration").folderName, "04_Fahrzeugdokumente");
    assert.equal(policy.getCategory("cashbook_receipt").folderName, "05_Zahlungsnachweise");
    assert.equal(policy.getCategory("unknown_type").folderName, "06_Sonstige_Dokumente");
});

test("ExportFileNamePolicy creates safe Windows-compatible names", () => {
    const policy = new ExportFileNamePolicy();

    assert.equal(normalizeFileNamePart("Müller & Söhne: TGX/18"), "Mueller_&_Soehne_TGX_18");
    assert.equal(
        policy.createZipFileName({
            saleReference: "026-015",
        }),
        "Verkauf_026-015.zip",
    );
    assert.equal(
        policy.createDocumentFileName({
            saleReference: "026-015",
            vehicleLabel: "MAN TGX",
            documentType: "entry_certificate",
            mimeType: "application/pdf",
            createdAt: "2026-07-25T12:00:00.000Z",
        }),
        "Gelangensbestaetigung_026-015_MAN_TGX_2026-07-25.pdf",
    );
});

test("createUniqueFileName prevents duplicate archive paths", () => {
    const usedNames = new Set<string>();

    assert.equal(createUniqueFileName("A/Rechnung.pdf", usedNames), "A/Rechnung.pdf");
    assert.equal(createUniqueFileName("A/Rechnung.pdf", usedNames), "A/Rechnung_2.pdf");
    assert.equal(createUniqueFileName("A/Rechnung.pdf", usedNames), "A/Rechnung_3.pdf");
});

test("ZipArchiveService creates a zip with the expected entries", () => {
    const archive = new ZipArchiveService().createArchive([
        {
            path: "Verkauf_026-015/01_Rechnungen/Rechnung_026-015.pdf",
            data: new TextEncoder().encode("rechnung"),
        },
        {
            path: "Verkauf_026-015/Hinweise.txt",
            data: new TextEncoder().encode("Hinweis"),
        },
    ]);
    const zipText = archive.toString("utf8");

    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    assert.match(zipText, /01_Rechnungen\/Rechnung_026-015\.pdf/);
    assert.match(zipText, /Hinweise\.txt/);
});
