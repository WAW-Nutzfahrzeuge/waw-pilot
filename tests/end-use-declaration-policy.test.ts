import assert from "node:assert/strict";
import test from "node:test";

import {
    getEndUseDeclarationDestinationCountry,
    requiresEndUseDeclaration,
} from "../src/modules/documents/domain/policies/end-use-declaration-policy.ts";
import { ExportFileNamePolicy } from "../src/modules/documents/domain/policies/export-file-name-policy.ts";
import { DocumentExportCategoryPolicy } from "../src/modules/documents/domain/policies/document-export-category-policy.ts";

test("Endverbleibserklärung ist auf die fünf festgelegten Zielländer begrenzt", () => {
    assert.equal(getEndUseDeclarationDestinationCountry("Russia"), "Russland");
    assert.equal(getEndUseDeclarationDestinationCountry("Kasachstan"), "Kasachstan");
    assert.equal(getEndUseDeclarationDestinationCountry("Kyrgyzstan"), "Kirgisistan");
    assert.equal(getEndUseDeclarationDestinationCountry("Tadschikistan"), "Tadschikistan");
    assert.equal(getEndUseDeclarationDestinationCountry("Syria"), "Syrien");
    assert.equal(requiresEndUseDeclaration("Polen"), false);
    assert.equal(requiresEndUseDeclaration("Türkei"), false);
});

test("Endverbleibserklärung erhält Exportablage und verständlichen PDF-Namen", () => {
    assert.equal(
        new DocumentExportCategoryPolicy().getCategory("end_use_declaration").folderName,
        "03_Exportnachweise",
    );
    assert.equal(
        new ExportFileNamePolicy().createDocumentFileName({
            saleReference: "VK-2026-12",
            documentType: "end_use_declaration",
            mimeType: "application/pdf",
        }),
        "Endverbleibserklaerung_VK-2026-12.pdf",
    );
});
