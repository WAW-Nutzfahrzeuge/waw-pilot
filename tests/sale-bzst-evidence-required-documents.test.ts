import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Regression coverage for a bug where BZSt-Prüfnachweise (VAT verification
// evidence) uploaded for a customer were saved correctly (customer_id set,
// sale_id: null, since the check is per customer, not per sale) but the
// sale detail "Erforderliche Dokumente" checklist only looked at sale-scoped
// documents, so it always reported them as missing even after a successful
// upload.

test("getSaleDetail merges customer-scoped BZSt evidence into the required documents checklist", () => {
    const querySource = readFileSync("lib/sales/sale-detail-queries.ts", "utf8");

    assert.equal(
        querySource.includes("attachCustomerScopedRequiredDocuments"),
        true,
        "sale detail query should attach customer-scoped required documents",
    );
    assert.equal(
        querySource.includes("CUSTOMER_SCOPED_REQUIRED_DOCUMENT_TYPES"),
        true,
    );
    assert.equal(querySource.includes('"bzst_vat_verification_primary"'), true);
    assert.equal(querySource.includes('"bzst_vat_verification_secondary"'), true);

    // Both the primary and the legacy fallback sale query path must call the
    // patch step, otherwise older sales would keep showing a false "missing".
    const attachCallCount = (
        querySource.match(/attachCustomerScopedRequiredDocuments\(\{/g) ?? []
    ).length;
    // 1 function definition + 2 call sites (primary query path + legacy fallback path)
    assert.equal(
        attachCallCount,
        3,
        "both sale detail query paths must attach customer-scoped required documents",
    );
});

test("uploadSaleDocumentAction can replace a BZSt document that is still only linked to the customer", () => {
    const actionsSource = readFileSync(
        "app/dashboard/sales/[saleId]/actions.ts",
        "utf8",
    );

    assert.equal(
        actionsSource.includes("isBzstVerificationDocument(documentType)"),
        true,
    );
    assert.equal(
        actionsSource.includes(
            "and(sale_id.is.null,customer_id.eq.${sale.buyer_customer_id})",
        ),
        true,
        "replacing an existing BZSt document must also find customer-scoped documents (sale_id: null)",
    );
});
