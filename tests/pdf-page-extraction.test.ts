import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument, rgb } from "pdf-lib";

import {
    extractPdfPages,
    parseExpectedPageCount,
    parseRequestedPages,
    PdfPageExtractionError,
} from "../lib/automation/pdf-page-extraction.ts";

async function createSyntheticPdf(pageCount = 5): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    for (let index = 0; index < pageCount; index += 1) {
        const page = pdf.addPage([500 + index, 700 + index]);
        page.drawRectangle({
            x: 20 + index,
            y: 30 + index,
            width: 100,
            height: 50,
            color: rgb(index / pageCount, 0.3, 0.6),
        });
    }
    return pdf.save();
}

async function getOutputPageSizes(bytes: Uint8Array) {
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPages().map((page) => page.getSize());
}

test("extracts one original PDF page", async () => {
    const source = await createSyntheticPdf();
    const result = await extractPdfPages({ bytes: source, pages: [2], expectedPageCount: 5 });
    assert.deepEqual(await getOutputPageSizes(result.bytes), [{ width: 501, height: 701 }]);
});

test("extracts several consecutive original PDF pages", async () => {
    const source = await createSyntheticPdf();
    const result = await extractPdfPages({ bytes: source, pages: [2, 3, 4], expectedPageCount: 5 });
    assert.deepEqual(await getOutputPageSizes(result.bytes), [
        { width: 501, height: 701 },
        { width: 502, height: 702 },
        { width: 503, height: 703 },
    ]);
});

test("extracts non-consecutive pages in requested ascending order", async () => {
    const source = await createSyntheticPdf();
    const result = await extractPdfPages({ bytes: source, pages: [1, 4], expectedPageCount: 5 });
    assert.deepEqual(await getOutputPageSizes(result.bytes), [
        { width: 500, height: 700 },
        { width: 503, height: 703 },
    ]);
});

test("rejects invalid, duplicate and unsorted page selections", () => {
    for (const value of [null, "[]", "[1,1]", "[2,1]", "[0]", "[1.5]", "not-json"]) {
        assert.throws(
            () => parseRequestedPages(value),
            (error: unknown) => error instanceof PdfPageExtractionError && error.code === "invalid_pages",
        );
    }
});

test("rejects a mismatching analyzed page count", async () => {
    const source = await createSyntheticPdf(3);
    await assert.rejects(
        extractPdfPages({ bytes: source, pages: [1], expectedPageCount: 4 }),
        (error: unknown) => error instanceof PdfPageExtractionError && error.code === "page_count_mismatch",
    );
});

test("rejects pages outside the source PDF", async () => {
    const source = await createSyntheticPdf(3);
    await assert.rejects(
        extractPdfPages({ bytes: source, pages: [4], expectedPageCount: 3 }),
        (error: unknown) => error instanceof PdfPageExtractionError && error.code === "page_out_of_range",
    );
});

test("validates expectedPageCount as a positive integer", () => {
    assert.equal(parseExpectedPageCount("5"), 5);
    for (const value of [null, "", "0", "-1", "1.5", "x"]) {
        assert.throws(() => parseExpectedPageCount(value));
    }
});

test("route requires the existing automation authentication and disables caching", () => {
    const route = readFileSync(
        "app/api/automation/document-returns/extract-pages/route.ts",
        "utf8",
    );
    assert.match(route, /authenticateAutomationRequest\(request\)/);
    assert.match(route, /automationUnauthorized\(\)/);
    assert.match(route, /private, no-store, max-age=0/);
    assert.doesNotMatch(route, /storage\.from|from\("documents"\)|from\("sales"\)/);
});

