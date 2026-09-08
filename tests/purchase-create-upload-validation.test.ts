import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    isConvertibleVehicleDocumentImage,
} from "../lib/documents/client-image-compression.ts";
import {
    getPurchaseCreateUploadTooLargeMessage,
    getUnsupportedVehicleDocumentTypeMessage,
    isAllowedVehicleDocumentFile,
    maxPurchaseCreateUploadPayloadBytes,
} from "../lib/documents/upload-validation.ts";

describe("purchase create upload validation", () => {
    it("allows vehicle document PDF and image types", () => {
        assert.equal(
            isAllowedVehicleDocumentFile({
                name: "fahrzeugschein.pdf",
                type: "application/pdf",
            } as File),
            true,
        );
        assert.equal(
            isAllowedVehicleDocumentFile({
                name: "fahrzeugschein.jpg",
                type: "image/jpeg",
            } as File),
            true,
        );
    });

    it("rejects unsupported upload types", () => {
        assert.equal(
            isAllowedVehicleDocumentFile({
                name: "fahrzeugschein.heic",
                type: "image/heic",
            } as File),
            false,
        );
        assert.equal(
            getUnsupportedVehicleDocumentTypeMessage(),
            "Dieser Dateityp wird nicht unterstützt. Bitte wähle PDF, JPG oder PNG.",
        );
    });

    it("converts only browser-safe vehicle document images to PDF", () => {
        assert.equal(
            isConvertibleVehicleDocumentImage({ type: "image/jpeg" } as File),
            true,
        );
        assert.equal(
            isConvertibleVehicleDocumentImage({ type: "image/png" } as File),
            true,
        );
        assert.equal(
            isConvertibleVehicleDocumentImage({ type: "application/pdf" } as File),
            false,
        );
        assert.equal(
            isConvertibleVehicleDocumentImage({ type: "image/heic" } as File),
            false,
        );
    });

    it("keeps purchase-create uploads below the Vercel function payload limit", () => {
        const smallPdf = 512 * 1024;
        const pdfNearLimit = maxPurchaseCreateUploadPayloadBytes - smallPdf;

        assert.equal(smallPdf + pdfNearLimit <= maxPurchaseCreateUploadPayloadBytes, true);
        assert.equal(
            smallPdf + pdfNearLimit + 1 > maxPurchaseCreateUploadPayloadBytes,
            true,
        );
        assert.equal(
            getPurchaseCreateUploadTooLargeMessage(),
            "Die Datei ist zu groß. Bitte wähle für den Ankauf Dokumente mit zusammen maximal 3,5 MB aus.",
        );
    });
});
