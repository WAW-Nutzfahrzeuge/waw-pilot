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

test("Rechnungsversand verwendet das gespeicherte PDF-Dokument", () => {
    const actionSource = getInvoiceEmailActionSource();

    assert.match(actionSource, /pdf_document_id/);
    assert.match(
        actionSource,
        /documentAttachments:\s*\[\s*\{\s*documentId: invoice\.pdf_document_id,/,
    );
    assert.doesNotMatch(actionSource, /renderInvoicePdfBytes/);
    assert.doesNotMatch(actionSource, /generateAndStoreInvoicePdf/);
});

test("Rechnungsversand verlangt vorher ein erzeugtes und lesbares PDF", () => {
    const actionSource = getInvoiceEmailActionSource();

    assert.match(
        actionSource,
        /if \(!invoice\.pdf_document_id\) \{\s*redirect\(getInvoiceEmailErrorRedirect\(saleId, invoiceId, "missingPdf"\)\);/,
    );
    assert.match(actionSource, /sendError instanceof EmailAttachmentNotFoundError/);
});
