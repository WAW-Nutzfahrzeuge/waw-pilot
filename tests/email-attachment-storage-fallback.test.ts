import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readerSource = readFileSync(
    new URL(
        "../src/modules/email/infrastructure/attachments/supabase-document-attachment.reader.ts",
        import.meta.url,
    ),
    "utf8",
);

test("E-Mail-Anhänge fallen bei einer veralteten Dokumentversion auf den aktuellen Dokumentpfad zurück", () => {
    assert.match(readerSource, /\.eq\("company_id", params\.companyId\)/);
    assert.match(readerSource, /\.eq\("id", params\.documentId\)/);
    assert.match(readerSource, /fallbackPath !== activeFile\.storagePath/);
    assert.match(readerSource, /\.download\(fallbackPath\)/);
});

test("der Storage-Fallback erzeugt beim E-Mail-Versand keine neue PDF", () => {
    assert.doesNotMatch(readerSource, /generateAndStoreInvoicePdf/);
    assert.doesNotMatch(readerSource, /renderInvoicePdfBytes/);
});
