import assert from "node:assert/strict";
import test from "node:test";

import {
    isNumericKeyAllowed,
    sanitizeNumericInputValue,
} from "../lib/forms/numeric-input.ts";

test("sanitizeNumericInputValue keeps digits and normalizes a comma to a dot", () => {
    assert.equal(sanitizeNumericInputValue("2019"), "2019");
    assert.equal(sanitizeNumericInputValue("12,34"), "12.34");
    assert.equal(sanitizeNumericInputValue("12.34"), "12.34");
});

test("sanitizeNumericInputValue strips letters and other invalid characters", () => {
    assert.equal(sanitizeNumericInputValue("abc123abc"), "123");
    assert.equal(sanitizeNumericInputValue("12€34"), "1234");
});

test("sanitizeNumericInputValue keeps only the first decimal separator", () => {
    assert.equal(sanitizeNumericInputValue("12.34.56"), "12.3456");
    assert.equal(sanitizeNumericInputValue("1,2,3"), "1.23");
});

test("sanitizeNumericInputValue strips a minus sign unless negative values are allowed", () => {
    assert.equal(sanitizeNumericInputValue("-123"), "123");
    assert.equal(sanitizeNumericInputValue("-123", { allowNegative: true }), "-123");
});

test("sanitizeNumericInputValue collapses embedded/duplicate minus signs to a single leading one", () => {
    assert.equal(sanitizeNumericInputValue("--12", { allowNegative: true }), "-12");
    assert.equal(sanitizeNumericInputValue("12-34", { allowNegative: true }), "1234");
});

test("isNumericKeyAllowed always allows digits", () => {
    for (const digit of "0123456789") {
        assert.equal(
            isNumericKeyAllowed({
                key: digit,
                currentValue: "",
                selectionStart: 0,
            }),
            true,
        );
    }
});

test("isNumericKeyAllowed blocks letters (this is what replaces the old type=number arrows/behavior)", () => {
    assert.equal(
        isNumericKeyAllowed({ key: "e", currentValue: "12", selectionStart: 2 }),
        false,
    );
    assert.equal(
        isNumericKeyAllowed({ key: "a", currentValue: "", selectionStart: 0 }),
        false,
    );
});

test("isNumericKeyAllowed allows control/navigation keys regardless of value", () => {
    for (const key of ["Backspace", "Delete", "Tab", "ArrowLeft", "ArrowRight", "Home", "End"]) {
        assert.equal(
            isNumericKeyAllowed({ key, currentValue: "123", selectionStart: 1 }),
            true,
        );
    }
});

test("isNumericKeyAllowed allows copy/paste/select-all keyboard shortcuts", () => {
    assert.equal(
        isNumericKeyAllowed({ key: "v", ctrlKey: true, currentValue: "", selectionStart: 0 }),
        true,
    );
    assert.equal(
        isNumericKeyAllowed({ key: "a", metaKey: true, currentValue: "12", selectionStart: 0 }),
        true,
    );
});

test("isNumericKeyAllowed allows exactly one decimal separator (comma or dot)", () => {
    assert.equal(
        isNumericKeyAllowed({ key: ".", currentValue: "12", selectionStart: 2 }),
        true,
    );
    assert.equal(
        isNumericKeyAllowed({ key: ",", currentValue: "12", selectionStart: 2 }),
        true,
    );
    assert.equal(
        isNumericKeyAllowed({ key: ".", currentValue: "12.5", selectionStart: 4 }),
        false,
        "ein zweiter Dezimaltrenner darf nicht mehr eingegeben werden",
    );
});

test("isNumericKeyAllowed allows typing a new decimal separator when the existing one is selected/replaced", () => {
    assert.equal(
        isNumericKeyAllowed({
            key: ",",
            currentValue: "12.5",
            selectionStart: 2,
            selectionEnd: 3,
        }),
        true,
    );
});

test("isNumericKeyAllowed blocks the minus sign unless negative values are explicitly allowed", () => {
    assert.equal(
        isNumericKeyAllowed({ key: "-", currentValue: "", selectionStart: 0 }),
        false,
    );
    assert.equal(
        isNumericKeyAllowed({
            key: "-",
            currentValue: "",
            selectionStart: 0,
            allowNegative: true,
        }),
        true,
    );
});

test("isNumericKeyAllowed only allows the minus sign at the very start of the field", () => {
    assert.equal(
        isNumericKeyAllowed({
            key: "-",
            currentValue: "12",
            selectionStart: 1,
            allowNegative: true,
        }),
        false,
    );
});

test("isNumericKeyAllowed does not allow a second minus sign", () => {
    assert.equal(
        isNumericKeyAllowed({
            key: "-",
            currentValue: "-12",
            selectionStart: 0,
            allowNegative: true,
        }),
        false,
    );
});
