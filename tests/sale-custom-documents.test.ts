import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
    isSaleCustomDocument,
    normalizeSaleCustomDocumentLabel,
    saleCustomDocumentType,
} from "../lib/sales/sale-custom-documents.ts";

test("Zusatzdokumente nutzen einen gemeinsamen Typ und eine frei gewählte Bezeichnung", () => {
    assert.equal(saleCustomDocumentType, "sale_custom_document");
    assert.equal(isSaleCustomDocument(saleCustomDocumentType), true);
    assert.equal(normalizeSaleCustomDocumentLabel("  Handelsregisterauszug  "), "Handelsregisterauszug");
    assert.equal(normalizeSaleCustomDocumentLabel(""), null);
    assert.equal(normalizeSaleCustomDocumentLabel("x".repeat(121)), null);
});

test("der Upload speichert die freie Bezeichnung im vorhandenen title-Feld und bleibt mandantengebunden", async () => {
    const source = await readFile(
        new URL("../app/dashboard/sales/[saleId]/actions.ts", import.meta.url),
        "utf8",
    );

    assert.match(source, /\{ title: customDocumentLabel \}/);
    assert.match(source, /normalizeSaleCustomDocumentLabel\(submittedDocumentLabel\)/);
    assert.match(source, /\.eq\("company_id", companyId\)/);
    assert.match(source, /directory: `sales\/\$\{saleId\}`/);
    assert.match(source, /stagePrivateDocumentFilesForDelete/);
});

test("Zusatzdokumente sind kein Pflichtdokumenttyp", async () => {
    const source = await readFile(
        new URL("../lib/sales/sale-required-documents.ts", import.meta.url),
        "utf8",
    );

    assert.doesNotMatch(source, /sale_custom_document/);
});

test("die Verkaufsakte zeigt zwei anfängliche Upload-Slots, aber keine fachliche Maximalgrenze", async () => {
    const source = await readFile(
        new URL("../components/sales/sale-detail.tsx", import.meta.url),
        "utf8",
    );

    assert.match(source, /Math\.max\(0, 2 - customDocuments\.length\)/);
    assert.match(source, /customDocuments\.map/);
});
