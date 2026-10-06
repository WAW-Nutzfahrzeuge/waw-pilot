import assert from "node:assert/strict";
import test from "node:test";

import { resolveSales, type ResolutionSale } from "../lib/automation/sale-resolution.ts";

const sales: ResolutionSale[] = [
    { id: "sale-a", saleIdentifier: "VK-7A4B9C2DAA", saleNumber: "VK 026-100", invoiceNumbers: ["026-100"], vin: "WDB111", customerName: "Muster GmbH", customerEmail: "office@example.com" },
    { id: "sale-b", saleIdentifier: "VK-8B5C0D3EBB", saleNumber: "VK 026-101", invoiceNumbers: ["026-101"], vin: "WDB222", customerName: "Max Beispiel", customerEmail: "max@example.com" },
];

test("sale identifier wins and matching hard attributes are accepted", () => {
    const result = resolveSales({ saleIdentifier: "vk-7a4b9c2daa", invoiceNumber: "026-100", vin: "wdb111" }, sales);
    assert.equal(result.status, "matched");
    assert.equal("sale" in result ? result.sale.saleId : null, "sale-a");
});

test("sale identifier with contradictory invoice is a conflict", () => {
    const result = resolveSales({ saleIdentifier: "VK-7A4B9C2DAA", invoiceNumber: "026-101" }, sales);
    assert.equal(result.status, "conflict");
});

test("invoice and VIN pointing at different sales are a conflict", () => {
    const result = resolveSales({ invoiceNumber: "026-100", vin: "WDB222" }, sales);
    assert.equal(result.status, "conflict");
});

test("email alone never creates an automatic match", () => {
    const result = resolveSales({ senderEmail: "office@example.com" }, sales);
    assert.equal(result.status, "ambiguous");
    assert.equal("automaticMatchAllowed" in result && result.automaticMatchAllowed, false);
});

test("invoice punctuation is not removed during normalization", () => {
    const result = resolveSales({ invoiceNumber: "026100" }, sales);
    assert.equal(result.status, "unmatched");
});
