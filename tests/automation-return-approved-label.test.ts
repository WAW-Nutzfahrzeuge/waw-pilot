import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("approved returns use the correct signature label and hide the signature-needed warning", () => {
    const statuses = readFileSync(
        "lib/pdf/generated-documents/document-status.ts",
        "utf8",
    );
    const card = readFileSync(
        "components/sales/sale-generated-documents-card.tsx",
        "utf8",
    );

    assert.match(statuses, /signed_received: "Unterschrift vorhanden"/);
    assert.doesNotMatch(statuses, /Unterschrieben vorhanden/);
    assert.match(card, /showSignatureStatus && document\.status !== "signed_received"/);
});
