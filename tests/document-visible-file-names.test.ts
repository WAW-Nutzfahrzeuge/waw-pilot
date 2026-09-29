import assert from "node:assert/strict";
import test from "node:test";

import {
    getDocumentDownloadFileName,
    getVisibleCroppedFileName,
    isTechnicalGeneratedFileName,
} from "../lib/documents/visible-file-names.ts";

test("download keeps a real original upload filename", () => {
    assert.equal(
        getDocumentDownloadFileName({
            storedFileName: "Fahrzeugschein_Vorderseite.jpg",
            documentType: "vehicle_registration",
            mimeType: "image/jpeg",
            storagePath: "vehicles/abc/image-cropped-uuid.jpg",
            versionNumber: 1,
        }),
        "Fahrzeugschein_Vorderseite.jpg",
    );
});

test("download replaces technical crop names with a fachlicher fallback", () => {
    assert.equal(
        getDocumentDownloadFileName({
            storedFileName: "image-cropped-6c6c2f0e.jpg",
            documentType: "vehicle_registration",
            mimeType: "image/jpeg",
            storagePath: "vehicles/abc/image-cropped-6c6c2f0e.jpg",
            versionNumber: 2,
        }),
        "Fahrzeugschein_2.jpg",
    );
});

test("vehicle registration downloads use vehicle and purchase customer data over the original upload name", () => {
    assert.equal(
        getDocumentDownloadFileName({
            storedFileName: "upload.jpg",
            documentType: "vehicle_registration",
            mimeType: "application/pdf",
            storagePath: "vehicles/abc/upload.jpg",
            vehicleRegistration: {
                manufacturer: "Mercedes-Benz",
                vehicleType: "Sattelzugmaschine",
                model: "Actros 1845",
                vin: "WDB123456789",
                purchaseCustomerName: "Muster Transporte GmbH",
            },
        }),
        "Mercedes-Benz_Sattelzugmaschine_Actros_1845_WDB123456789_Muster_Transporte_GmbH.pdf",
    );
});

test("download replaces technical purchase invoice names with Einkaufsrechnung fallback", () => {
    assert.equal(
        getDocumentDownloadFileName({
            storedFileName: "image-cropped-ankauf.pdf",
            documentType: "purchase_invoice",
            mimeType: "application/pdf",
            storagePath: "vehicles/abc/image-cropped-ankauf.pdf",
            versionNumber: 1,
        }),
        "Einkaufsrechnung_1.pdf",
    );
});

test("download creates invoice fallback names with invoice number", () => {
    assert.equal(
        getDocumentDownloadFileName({
            storedFileName: "Image-cropped.pdf",
            documentType: "invoice",
            mimeType: "application/pdf",
            invoiceNumber: "026-135",
            storagePath: "sales/invoices/Image-cropped.pdf",
            versionNumber: 1,
        }),
        "Rechnung_026-135.pdf",
    );
});

test("download extension follows the actual mime type", () => {
    assert.equal(
        getDocumentDownloadFileName({
            storedFileName: "Fahrzeugschein_Vorderseite.jpg",
            documentType: "vehicle_registration",
            mimeType: "application/pdf",
            storagePath: "documents/file.pdf",
            versionNumber: 1,
        }),
        "Fahrzeugschein_Vorderseite.pdf",
    );
});

test("crop output preserves the visible original name instead of adding cropped", () => {
    assert.equal(
        getVisibleCroppedFileName("Fahrzeugschein vorne.jpg", "image/jpeg"),
        "Fahrzeugschein vorne.jpg",
    );
    assert.equal(isTechnicalGeneratedFileName("image-cropped-uuid.jpg"), true);
});
