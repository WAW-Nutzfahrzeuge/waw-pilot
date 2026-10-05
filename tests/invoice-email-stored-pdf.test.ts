import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const invoiceActionsSource = readFileSync(
    new URL("../app/dashboard/sales/[saleId]/invoice-actions.ts", import.meta.url),
    "utf8",
);

function getInvoiceEmailActionSource(): string {
    const start = invoiceActionsSource.indexOf(
        "export async function sendSaleInvoiceEmailAction",
    );
    const end = invoiceActionsSource.indexOf(
        "export async function sendInvoiceToDatevAction",
        start,
    );

    assert.ok(start >= 0, "sendSaleInvoiceEmailAction fehlt");
    assert.ok(end > start, "Ende der Rechnungs-E-Mail-Action fehlt");

    return invoiceActionsSource.slice(start, end);
}

test("Rechnungsversand rendert den Anhang direkt aus der vorhandenen Rechnung", () => {
    const actionSource = getInvoiceEmailActionSource();

    assert.match(actionSource, /renderInvoicePdfBytes\(invoiceId\)/);
    assert.match(
        actionSource,
        /resolvedAttachments:\s*\[\s*\{\s*fileName: invoiceFileName,\s*content: Buffer\.from\(pdfBytes\),/,
    );
    assert.doesNotMatch(actionSource, /generateAndStoreInvoicePdf/);
});

test("Rechnungsversand wird nicht mehr durch eine fehlende PDF-Dokumentverknüpfung blockiert", () => {
    const actionSource = getInvoiceEmailActionSource();

    assert.doesNotMatch(actionSource, /missingPdf/);
    assert.doesNotMatch(actionSource, /resolveStoredInvoicePdfDocumentId/);
    assert.doesNotMatch(actionSource, /documentAttachments/);
});
