import assert from "node:assert/strict";
import test from "node:test";

import { getSaleTaxConfiguration } from "../utils/sale-tax-rules.ts";

test("EU sale to private buyer forces German VAT", () => {
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: "private",
        deliveryType: "eu",
        billingCountry: "Spanien",
    });

    assert.equal(taxConfiguration.defaultVatRate, 19);
    assert.equal(taxConfiguration.forceVatRate, true);
    assert.equal(taxConfiguration.showVatId, false);
});

test("EU sale to company remains VAT-exempt by default and requires VAT ID", () => {
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: "company",
        deliveryType: "eu",
        billingCountry: "Spanien",
    });

    assert.equal(taxConfiguration.defaultVatRate, 0);
    assert.equal(taxConfiguration.forceVatRate, false);
    assert.equal(taxConfiguration.showVatId, true);
});
