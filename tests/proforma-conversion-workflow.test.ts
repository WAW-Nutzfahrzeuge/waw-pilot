import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const safeguardsMigrationSql = readFileSync(
    new URL(
        "../supabase/migrations/20260926190000_add_proforma_conversion_safeguards.sql",
        import.meta.url,
    ),
    "utf8",
);

const invoiceActionsSource = readFileSync(
    new URL("../app/dashboard/sales/[saleId]/invoice-actions.ts", import.meta.url),
    "utf8",
);

const saleDetailSource = readFileSync(
    new URL("../components/sales/sale-detail.tsx", import.meta.url),
    "utf8",
);

const saleInvoiceTypeActionsSource = readFileSync(
    new URL("../components/sales/sale-invoice-type-actions.tsx", import.meta.url),
    "utf8",
);

const saleFormSource = readFileSync(
    new URL("../components/sales/sale-form.tsx", import.meta.url),
    "utf8",
);

const newSaleActionsSource = readFileSync(
    new URL("../app/dashboard/sales/new/actions.ts", import.meta.url),
    "utf8",
);

const invoiceQueriesSource = readFileSync(
    new URL("../lib/invoices/invoice-queries.ts", import.meta.url),
    "utf8",
);

test("TEST 4/5: a database-level unique index prevents two standard or two proforma invoices per sale, not only an app-level check", () => {
    assert.match(
        safeguardsMigrationSql,
        /create unique index if not exists invoices_company_sale_single_type_key\s*\non public\.invoices\(company_id, sale_id, invoice_type\)\s*where invoice_type in \('standard', 'proforma'\)/,
    );
});

test("TEST 4: concurrent conversion attempts are resolved via the DB unique-violation error code, not a client-side race-prone check alone", () => {
    assert.match(invoiceActionsSource, /invoiceError\?\.code === "23505"/);
    assert.match(
        invoiceActionsSource,
        /invoiceType === "proforma"\s*\n\s*\? "proformaAlreadyExists"\s*\n\s*: "invoiceAlreadyExists"/,
    );
});

test("TEST 5: creating a second final invoice for a sale that already has one is a no-op redirect, not a duplicate insert", () => {
    assert.match(
        invoiceActionsSource,
        /if \(existingInvoiceData\) \{[\s\S]*?redirect\(`\/dashboard\/sales\/\$\{saleId\}`\);/,
    );
});

test("converting a proforma marks it as 'converted' via the existing invoices table, without duplicating the invoice-creation logic", () => {
    assert.match(
        invoiceActionsSource,
        /if \(sourceProformaInvoiceId\) \{/,
    );
    assert.match(
        invoiceActionsSource,
        /\.update\(\{ status: "converted" \}\)\s*\n\s*\.eq\("id", sourceProformaInvoiceId\)/,
    );
});

test("'converted' is a valid invoice status recognised by the shared invoice-status type", () => {
    assert.match(invoiceQueriesSource, /"converted"/);
});

test("deleteProformaInvoiceAction only ever deletes invoice_type = 'proforma' rows that are not converted or already linked to a final invoice", () => {
    assert.match(
        invoiceActionsSource,
        /export async function deleteProformaInvoiceAction/,
    );
    assert.match(
        invoiceActionsSource,
        /if \(invoice\.invoice_type !== "proforma"\) \{\s*\n\s*redirect\(\s*\n\s*`\/dashboard\/sales\/\$\{saleId\}\?invoiceActionError=onlyProformaDeletable`,/,
    );
    assert.match(
        invoiceActionsSource,
        /if \(invoice\.status === "converted"\) \{\s*\n\s*redirect\(\s*\n\s*`\/dashboard\/sales\/\$\{saleId\}\?invoiceActionError=alreadyConverted`,/,
    );
    assert.match(
        invoiceActionsSource,
        /\.eq\("source_proforma_invoice_id", invoice\.id\)/,
        "must also refuse deletion when a final invoice already links back to this proforma",
    );
    assert.match(
        invoiceActionsSource,
        /\.delete\(\)\s*\n\s*\.eq\("id", invoice\.id\)\s*\n\s*\.eq\("company_id", companyId\)\s*\n\s*\.eq\("invoice_type", "proforma"\)/,
        "the delete itself must be scoped to invoice_type = 'proforma' as defense-in-depth",
    );
});

test("deleteProformaInvoiceAction never touches or recycles the invoice number counters", () => {
    assert.doesNotMatch(invoiceActionsSource.slice(
        invoiceActionsSource.indexOf("export async function deleteProformaInvoiceAction"),
        invoiceActionsSource.indexOf(
            "export async function regenerateSaleInvoicePdfAction",
        ),
    ), /number_counters|getNextInvoiceNumber/);
});

test("there is no generic 'delete invoice' action for final invoices - only the proforma-specific delete exists", () => {
    const deleteActionMatches = invoiceActionsSource.match(
        /export async function delete\w*Action/g,
    );
    assert.deepEqual(deleteActionMatches, [
        "export async function deleteProformaInvoiceAction",
    ]);
});

test("TEST 12: the existing standard-invoice creation/regeneration/ZUGFeRD/correction actions were not removed by the proforma workflow additions", () => {
    for (const exportedAction of [
        "regenerateSaleInvoicePdfAction",
        "sendSaleInvoiceEmailAction",
        "sendInvoiceToDatevAction",
        "createZugferdInvoiceAction",
        "sendZugferdInvoiceEmailAction",
    ]) {
        assert.match(
            invoiceActionsSource,
            new RegExp(`export async function ${exportedAction}`),
        );
    }
});

test("the sale-detail UI shows a distinct 'converted from proforma' banner and a dedicated error banner instead of a generic failure message", () => {
    assert.match(saleDetailSource, /invoiceConvertedFromNumber/);
    assert.match(saleDetailSource, /invoiceDeletedNumber/);
    assert.match(saleDetailSource, /function getInvoiceActionErrorMessage/);
    assert.match(saleDetailSource, /proformaAlreadyExists/);
    assert.match(saleDetailSource, /invoiceAlreadyExists/);
    assert.match(saleDetailSource, /alreadyConverted/);
    assert.match(saleDetailSource, /onlyProformaDeletable/);
});

test("Zustand 2/3: the sale-detail invoice card only offers 'In Rechnung umwandeln' while unconverted, and hides the misleading proforma option once a final invoice exists", () => {
    assert.match(
        saleDetailSource,
        /const standardInvoice =/,
        "a dedicated standardInvoice lookup must exist so Zustand 3 can hide the proforma actions",
    );
    assert.match(
        saleInvoiceTypeActionsSource,
        /standardInvoice \? \(/,
    );
    assert.match(saleInvoiceTypeActionsSource, /In Rechnung umwandeln/);
    assert.match(
        saleInvoiceTypeActionsSource,
        /Proforma in Rechnung umwandeln\?/,
        "the conversion must go through a confirmation dialog, not fire immediately on click",
    );
});

test("the proforma delete action in the UI is also behind an explicit confirmation dialog", () => {
    assert.match(
        saleInvoiceTypeActionsSource,
        /Proforma-Rechnung löschen\?/,
    );
    assert.match(saleInvoiceTypeActionsSource, /deleteProformaInvoiceAction/);
});

test("sale creation lets the user choose Proforma vs. Rechnung before any document is created", () => {
    assert.match(saleFormSource, /invoiceType/);
    assert.match(saleFormSource, /"proforma"/);
    assert.match(
        saleFormSource,
        /name="invoice_type"/,
        "the choice must be submitted as a real form field read by the server action",
    );
});

test("TEST 11: selecting Proforma at sale creation hides the 'mark as paid in cashbook' section so no financial booking is created for a proforma", () => {
    assert.match(saleFormSource, /isProformaSelected/);
    assert.match(
        saleFormSource,
        /isProformaSelected \? \(/,
        "the cashbook/payment section must be conditionally rendered based on the selected invoice type",
    );
});

test("TEST 1/2/6: sale creation requests the invoice number for the actually chosen type, never hardcoding 'standard'", () => {
    assert.match(
        newSaleActionsSource,
        /const requestedInvoiceType =\s*\n\s*getStringValue\(formData, "invoice_type"\) === "proforma"\s*\n\s*\? "proforma"\s*\n\s*: "standard";/,
    );
    assert.match(
        newSaleActionsSource,
        /invoiceType: requestedInvoiceType,/,
    );
});

test("TEST 11: sale creation forces the cashbook flag off server-side for proforma invoices too, not only via the hidden UI section", () => {
    assert.match(
        newSaleActionsSource,
        /const shouldCreateCashbookEntry =\s*\n\s*!isProformaInvoice &&\s*\n\s*getStringValue\(formData, "create_cashbook_entry"\) === "yes";/,
    );
    assert.match(
        newSaleActionsSource,
        /paid_at:\s*\n\s*!isProformaInvoice && shouldCreateCashbookEntry/,
        "a proforma invoice must never receive a paid_at timestamp, even if create_cashbook_entry was somehow submitted",
    );
});
