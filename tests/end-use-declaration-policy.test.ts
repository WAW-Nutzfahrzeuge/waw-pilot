import assert from "node:assert/strict";
import test from "node:test";

import {
    canGenerateEndUseDeclaration,
    getEndUseDeclarationDestinationCountry,
    isEndUseDeclarationOptional,
    requiresEndUseDeclaration,
} from "../src/modules/documents/domain/policies/end-use-declaration-policy.ts";
import { ExportFileNamePolicy } from "../src/modules/documents/domain/policies/export-file-name-policy.ts";
import { DocumentExportCategoryPolicy } from "../src/modules/documents/domain/policies/document-export-category-policy.ts";

test("Endverbleibserklärung gilt nur für die sieben festgelegten Zielländer", () => {
    assert.equal(getEndUseDeclarationDestinationCountry("Russia"), "Russland");
    assert.equal(getEndUseDeclarationDestinationCountry("Kasachstan"), "Kasachstan");
    assert.equal(getEndUseDeclarationDestinationCountry("Kyrgyzstan"), "Kirgisistan");
    assert.equal(getEndUseDeclarationDestinationCountry("Kirgistan"), "Kirgisistan");
    assert.equal(getEndUseDeclarationDestinationCountry("Tadschikistan"), "Tadschikistan");
    assert.equal(getEndUseDeclarationDestinationCountry("Georgia"), "Georgien");
    assert.equal(getEndUseDeclarationDestinationCountry("GE"), "Georgien");
    assert.equal(getEndUseDeclarationDestinationCountry("Uzbekistan"), "Usbekistan");
    assert.equal(getEndUseDeclarationDestinationCountry("BY"), "Belarus");
    for (const country of [
        "Russia",
        "Kasachstan",
        "Kyrgyzstan",
        "Tadschikistan",
        "Georgia",
        "Uzbekistan",
        "Belarus",
    ]) {
        assert.equal(requiresEndUseDeclaration(country), true, `${country} is required`);
    }
    assert.equal(getEndUseDeclarationDestinationCountry("Syria"), "Syrien");
    assert.equal(getEndUseDeclarationDestinationCountry("Syrien"), "Syrien");
    assert.equal(canGenerateEndUseDeclaration("Syria"), true);
    assert.equal(requiresEndUseDeclaration("Syria"), false);
    assert.equal(isEndUseDeclarationOptional("SY"), true);
    assert.equal(requiresEndUseDeclaration("SY"), false);
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
