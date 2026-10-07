import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    getDirectSaleDocumentTooLargeMessage,
    maxDirectSaleDocumentFileSizeBytes,
} from "../lib/documents/upload-validation.ts";

test("direct sale document uploads allow files up to 10 MB", () => {
    assert.equal(maxDirectSaleDocumentFileSizeBytes, 10 * 1024 * 1024);
    assert.match(getDirectSaleDocumentTooLargeMessage(), /10 MB/);
});

test("sale document form validates locally and uploads directly to signed private storage", () => {
    const source = readFileSync("components/sales/sale-document-upload-form.tsx", "utf8");
    assert.match(source, /file\.size > maxDirectSaleDocumentFileSizeBytes/);
    assert.match(source, /getDirectSaleDocumentTooLargeMessage\(\)/);
    assert.match(source, /prepareSaleDocumentUploadAction/);
    assert.match(source, /uploadToSignedUrl/);
    assert.match(source, /finalizeSaleDocumentUploadAction/);
    assert.doesNotMatch(source, /uploadSaleDocumentAction\(formData\)/);
});

test("direct sale document finalization verifies company, sale, stored size and MIME type", () => {
    const source = readFileSync("app/dashboard/sales/[saleId]/actions.ts", "utf8");
    assert.match(source, /pathMatch\[1\] !== companyId/);
    assert.match(source, /pathMatch\[2\] !== input\.saleId/);
    assert.match(source, /storage\.info\(input\.path\)/);
    assert.match(source, /storedSize !== input\.fileSize/);
    assert.match(source, /isAllowedDocumentFile/);
    assert.match(source, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
});
