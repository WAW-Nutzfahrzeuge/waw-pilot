import assert from "node:assert/strict";
import test from "node:test";

import { compareInvoiceNumbersAscending } from "../lib/invoices/invoice-number-sort.ts";

test("Rechnungsnummern werden aufsteigend natürlich statt als Text sortiert", () => {
    const numbers = ["026-100", "026-9", "026-10", "026-002"];

    assert.deepEqual(numbers.sort(compareInvoiceNumbersAscending), [
        "026-002",
        "026-9",
        "026-10",
        "026-100",
    ]);
});
