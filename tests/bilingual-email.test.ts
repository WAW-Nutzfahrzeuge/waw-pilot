import assert from "node:assert/strict";
import test from "node:test";

import { composeBilingualEmailText } from "../lib/email/bilingual-email.ts";

test("non-English invoice mail content contains customer language first and English second", () => {
    const text = composeBilingualEmailText({
        language: "pl",
        localizedText: "Polski tekst",
        englishText: "English text",
    });

    assert.equal(text, "Polski tekst\n\n----------------------------\n\nEnglish version\n\nEnglish text");
});

test("English invoice mail content is included only once", () => {
    const text = composeBilingualEmailText({
        language: "en",
        localizedText: "English text",
        englishText: "English text",
    });

    assert.equal(text, "English text");
    assert.equal(text.includes("English version"), false);
});
