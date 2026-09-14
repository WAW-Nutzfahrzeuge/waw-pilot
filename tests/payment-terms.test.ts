import assert from "node:assert/strict";
import test from "node:test";

import { calculateInvoiceDueDate } from "../lib/invoices/payment-terms.ts";

test("invoice due date uses the central seven-day payment term", () => {
    assert.equal(calculateInvoiceDueDate("2026-09-11"), "2026-09-18");
    assert.equal(calculateInvoiceDueDate("2026-12-28"), "2027-01-04");
});

test("invoice due date handles an explicit payment term", () => {
    assert.equal(calculateInvoiceDueDate("2026-09-11", 0), "2026-09-11");
    assert.equal(calculateInvoiceDueDate("2026-09-11", 30), "2026-10-11");
});
