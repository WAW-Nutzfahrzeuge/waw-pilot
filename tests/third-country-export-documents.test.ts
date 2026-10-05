import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { documentTypeDefinitions } from "../src/modules/documents/domain/constants/document-types.ts";
import { DocumentExportCategoryPolicy } from "../src/modules/documents/domain/policies/document-export-category-policy.ts";
import { ExportFileNamePolicy } from "../src/modules/documents/domain/policies/export-file-name-policy.ts";

test("Drittlandverkäufe verlangen getrennt Ausfuhrbegleitdokument und Ausgangsvermerk", async () => {
    const source = await readFile(
        new URL("../lib/sales/sale-required-documents.ts", import.meta.url),
        "utf8",
    );

    const thirdCountryBlock = source.match(
        /const THIRD_COUNTRY_REQUIRED_DOCUMENTS[\s\S]*?\n\];/,
    )?.[0];

    assert.ok(thirdCountryBlock);
    assert.match(thirdCountryBlock, /documentType: "export_accompanying_document"/);
    assert.match(thirdCountryBlock, /label: "Ausfuhrbegleitdokument"/);
    assert.match(thirdCountryBlock, /documentType: "exit_note"/);
    assert.match(thirdCountryBlock, /label: "Ausgangsvermerk"/);
    assert.doesNotMatch(thirdCountryBlock, /documentType: "customs"/);
});

test("beide Exportnachweise sind eigenständige ersetzbare Verkaufsdokumenttypen", () => {
    for (const code of ["export_accompanying_document", "exit_note"] as const) {
        const definition = documentTypeDefinitions.find((candidate) => candidate.code === code);

        assert.ok(definition);
        assert.equal(definition.canBeRequired, true);
        assert.equal(definition.replacementAllowed, true);
        assert.deepEqual(definition.allowedRelations, ["SALE", "VEHICLE", "CUSTOMER"]);
        assert.equal(
            new DocumentExportCategoryPolicy().getCategory(code).folderName,
            "03_Exportnachweise",
        );
    }
});

test("beide Exportnachweise erhalten eindeutige Downloadnamen", () => {
    const policy = new ExportFileNamePolicy();

    assert.equal(
        policy.createDocumentFileName({
            saleReference: "VK-026-150",
            documentType: "export_accompanying_document",
            mimeType: "application/pdf",
        }),
        "Ausfuhrbegleitdokument_VK-026-150.pdf",
    );
    assert.equal(
        policy.createDocumentFileName({
            saleReference: "VK-026-150",
            documentType: "exit_note",
            mimeType: "application/pdf",
        }),
        "Ausgangsvermerk_VK-026-150.pdf",
    );
});
