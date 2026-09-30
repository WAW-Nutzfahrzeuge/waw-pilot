import assert from "node:assert/strict";
import test from "node:test";

import { isDatevInvoiceSendable } from "../lib/invoices/datev-invoice-rules.ts";

test("DATEV batch selection accepts only unsent standard invoices", () => {
    assert.equal(
        isDatevInvoiceSendable({
            invoice_type: "standard",
            status: "created",
            datev_status: "not_sent",
        }),
        true,
    );
    assert.equal(
        isDatevInvoiceSendable({
            invoice_type: "proforma",
            status: "created",
            datev_status: "not_sent",
        }),
        false,
    );
    assert.equal(
        isDatevInvoiceSendable({
            invoice_type: "standard",
            status: "created",
            datev_status: "sent",
        }),
        false,
    );
    assert.equal(
        isDatevInvoiceSendable({
            invoice_type: "standard",
            status: "cancelled",
            datev_status: "not_sent",
        }),
        false,
    );
});
