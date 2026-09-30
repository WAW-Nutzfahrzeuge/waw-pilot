import assert from "node:assert/strict";
import test from "node:test";

import {
    COUNTRY_OPTIONS,
    normalizeCustomerCountry,
} from "../lib/countries/country-options.ts";

test("normalizes target countries to their canonical customer-country values", () => {
    assert.equal(normalizeCustomerCountry("SY"), "Syrien");
    assert.equal(normalizeCustomerCountry("Syria"), "Syrien");
    assert.equal(normalizeCustomerCountry("Kasachstan"), "Kasachstan");
    assert.equal(normalizeCustomerCountry("Russia"), "Russland");
    assert.equal(normalizeCustomerCountry("Tadschikistan"), "Tadschikistan");
});

test("does not accept misspelled free-text countries", () => {
    assert.equal(normalizeCustomerCountry("Syrrien"), null);
    assert.equal(normalizeCustomerCountry("Russlannd"), null);
});

test("offers Germany and all end-use-declaration target countries", () => {
    const values = new Set(COUNTRY_OPTIONS.map((country) => country.value));

    for (const country of [
        "Deutschland",
        "Russland",
        "Kasachstan",
        "Kirgisistan",
        "Tadschikistan",
        "Syrien",
    ]) {
        assert.ok(values.has(country));
    }
});
