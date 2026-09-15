import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVin } from "../lib/vehicles/vin.ts";

test("normalizes VIN input immediately and trims whitespace", () => {
    assert.equal(normalizeVin("wdb9634031l123456"), "WDB9634031L123456");
    assert.equal(normalizeVin("  wdb123  "), "WDB123");
});
