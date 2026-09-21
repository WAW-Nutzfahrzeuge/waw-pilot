import assert from "node:assert/strict";
import test from "node:test";

import {
    getDecimalFormValue,
    getMoneyFormValue,
    getStringFormValue,
} from "../lib/actions/form-data.ts";

function buildFormData(values: Record<string, string>): FormData {
    const formData = new FormData();

    for (const [key, value] of Object.entries(values)) {
        formData.set(key, value);
    }

    return formData;
}

test("getStringFormValue returns null for an empty/whitespace-only optional field", () => {
    const formData = buildFormData({ color: "   " });

    assert.equal(getStringFormValue(formData, "color"), null);
});

test("getStringFormValue preserves a trimmed value that was actually entered", () => {
    const formData = buildFormData({ color: "  Weiß  " });

    assert.equal(getStringFormValue(formData, "color"), "Weiß");
});

test("getStringFormValue returns null when the field is missing entirely (not sent by the form)", () => {
    const formData = buildFormData({});

    assert.equal(getStringFormValue(formData, "vehicle_category"), null);
});

test("getDecimalFormValue returns null for an empty mileage field instead of throwing or coercing to 0", () => {
    const formData = buildFormData({ mileage: "" });

    assert.equal(getDecimalFormValue(formData, "mileage"), null);
});

test("getDecimalFormValue parses a mileage value entered with a comma decimal separator", () => {
    const formData = buildFormData({ mileage: "325000" });

    assert.equal(getDecimalFormValue(formData, "mileage"), 325000);
});

test("getMoneyFormValue parses German-formatted amounts with thousands separator", () => {
    const formData = buildFormData({ amount: "12.345,67" });

    assert.equal(getMoneyFormValue(formData, "amount"), 12345.67);
});
