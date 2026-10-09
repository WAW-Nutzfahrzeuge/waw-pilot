import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Vereinbarung-Neuerstellung übergibt Unterschrift/Stempel und AGB", () => {
    const formSource = readFileSync(
        "components/sales/invoice-agreement-form.tsx",
        "utf8",
    );

    assert.match(formSource, /sale-\$\{saleId\}-include-signature-stamp/);
    assert.match(formSource, /sale-\$\{saleId\}-include-terms-pdf/);
    assert.match(formSource, /name="include_signature_stamp"/);
    assert.match(formSource, /name="include_terms_pdf"/);
});

test("Vereinbarung-Aktion speichert Rechnungsoptionen vor der PDF-Neuerstellung", () => {
    const actionSource = readFileSync(
        "app/dashboard/sales/[saleId]/invoice-actions.ts",
        "utf8",
    );
    const actionStart = actionSource.indexOf(
        "export async function updateSaleInvoiceNotesAction",
    );
    const actionEnd = actionSource.indexOf(
        "export async function sendSaleInvoiceEmailAction",
        actionStart,
    );
    const action = actionSource.slice(actionStart, actionEnd);

    assert.match(action, /include_signature_stamp: includeSignatureStamp/);
    assert.match(action, /include_terms_pdf: includeTermsPdf/);
    assert.ok(
        action.indexOf(".update({") < action.indexOf("generateAndStoreInvoicePdf(invoice.id)"),
        "Optionen müssen vor dem Rendern gespeichert werden",
    );
});
