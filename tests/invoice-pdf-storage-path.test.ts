import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("invoice PDF storage paths are scoped by the immutable invoice ID", async () => {
    const source = await readFile(
        new URL("../lib/pdf/invoice-storage.ts", import.meta.url),
        "utf8",
    );

    assert.match(source, /`invoices\/\$\{invoiceId\}\/\$\{fileName\}`/);
    assert.doesNotMatch(source, /const filePath = `invoices\/\$\{fileName\}`/);
});
