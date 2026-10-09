import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBrowserZip } from "../lib/archives/browser-zip.ts";

test("Browser-ZIP enthält mehrere ausgewählte Rechnungsdateien", () => {
    const archive = createBrowserZip([
        {
            fileName: "Rechnung_026-149.pdf",
            data: new TextEncoder().encode("PDF-149"),
        },
        {
            fileName: "Rechnung_026-150.pdf",
            data: new TextEncoder().encode("PDF-150"),
        },
    ]);
    const archiveText = new TextDecoder().decode(archive);

    assert.equal(new DataView(archive.buffer).getUint32(0, true), 0x04034b50);
    assert.match(archiveText, /Rechnung_026-149\.pdf/);
    assert.match(archiveText, /Rechnung_026-150\.pdf/);
    assert.equal(
        new DataView(archive.buffer).getUint32(archive.byteLength - 22, true),
        0x06054b50,
    );
});

test("Rechnungsübersicht zeigt den ZIP-Download nur im Auswahlbereich", () => {
    const source = readFileSync(
        "components/invoices/invoices-overview.tsx",
        "utf8",
    );

    assert.match(source, /selectedDatevInvoiceCount > 0/);
    assert.match(source, /Auswahl herunterladen/);
    assert.match(source, /createBrowserZip\(entries\)/);
    assert.match(source, /api\/invoices\/\$\{encodeURIComponent\(invoice\.id\)\}\/pdf/);
});
