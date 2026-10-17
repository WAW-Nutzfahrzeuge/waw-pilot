import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import {
    convertImageToPdf,
    ImageToPdfError,
    validateImageReadable,
} from "../lib/automation/image-to-pdf.ts";
import {
    detectAutomationOriginalFileType,
    mimeTypeMatchesOriginalFile,
} from "../lib/automation/file-signature.ts";

const maxBytes = 4 * 1024 * 1024;

test("recognizes PDF, JPEG and PNG by bytes and allows generic multipart MIME", async () => {
    const jpeg = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
    assert.equal(detectAutomationOriginalFileType(Buffer.from("%PDF-1.7")), "application/pdf");
    assert.equal(detectAutomationOriginalFileType(jpeg), "image/jpeg");
    assert.equal(detectAutomationOriginalFileType(png), "image/png");
    assert.equal(detectAutomationOriginalFileType(Buffer.from("not an image")), null);
    assert.equal(mimeTypeMatchesOriginalFile("application/octet-stream", "image/png"), true);
    assert.equal(mimeTypeMatchesOriginalFile("image/jpeg", "image/png"), false);
});

test("converts a PNG to one PDF page with the complete image aspect ratio", async () => {
    const png = await sharp({ create: { width: 120, height: 60, channels: 3, background: "blue" } }).png().toBuffer();
    const result = await convertImageToPdf({ bytes: png, mimeType: "image/png", maxOutputBytes: maxBytes });
    const pdf = await PDFDocument.load(result.bytes);
    const page = pdf.getPages()[0];

    assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual({ width: result.width, height: result.height }, { width: 120, height: 60 });
    assert.ok(page.getWidth() > page.getHeight());
    assert.equal(Buffer.from(result.bytes).subarray(0, 5).toString("ascii"), "%PDF-");
});

test("applies JPEG EXIF orientation before sizing the page", async () => {
    const jpeg = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
    const result = await convertImageToPdf({ bytes: jpeg, mimeType: "image/jpeg", maxOutputBytes: maxBytes });
    const pdf = await PDFDocument.load(result.bytes);
    const page = pdf.getPages()[0];

    assert.deepEqual({ width: result.width, height: result.height }, { width: 20, height: 40 });
    assert.ok(page.getHeight() > page.getWidth());
});

test("rejects malformed images and output over the configured limit", async () => {
    await assert.rejects(
        validateImageReadable(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        (error: unknown) => error instanceof ImageToPdfError && error.code === "invalid_image",
    );
    await assert.rejects(
        convertImageToPdf({ bytes: Buffer.from("not jpeg"), mimeType: "image/jpeg", maxOutputBytes: maxBytes }),
        (error: unknown) => error instanceof ImageToPdfError && error.code === "invalid_image",
    );
    const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "blue" } }).png().toBuffer();
    await assert.rejects(
        convertImageToPdf({ bytes: png, mimeType: "image/png", maxOutputBytes: 10 }),
        (error: unknown) => error instanceof ImageToPdfError && error.code === "converted_pdf_too_large",
    );
});

test("image originals remain raw and image-derived sale documents stay under review", () => {
    const originalsRoute = readFileSync("app/api/automation/document-returns/originals/route.ts", "utf8");
    const documentsRoute = readFileSync("app/api/automation/sales/[saleId]/documents/route.ts", "utf8");
    const conversionRoute = readFileSync("app/api/automation/document-returns/image-to-pdf/route.ts", "utf8");

    assert.match(originalsRoute, /upload\(path, bytes/);
    assert.match(originalsRoute, /createUploadFingerprint\(bytes/);
    assert.match(originalsRoute, /validateImageReadable\(bytes\)/);
    assert.match(conversionRoute, /authenticateAutomationRequest/);
    assert.match(conversionRoute, /originalUploadId/);
    assert.match(conversionRoute, /private, no-store/);
    assert.match(documentsRoute, /original\.mime_type === "image\/jpeg" \|\| original\.mime_type === "image\/png"/);
    assert.match(documentsRoute, /reviewStatus = "needs_review"/);
});
