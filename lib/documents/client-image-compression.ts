"use client";

import { PDFDocument } from "pdf-lib";

type ConvertImageToPdfOptions = {
    maxSizeBytes: number;
    maxDimension?: number;
    initialQuality?: number;
    minQuality?: number;
};

const a4Page = {
    width: 595.28,
    height: 841.89,
};

export function isConvertibleVehicleDocumentImage(file: Pick<File, "type">): boolean {
    return file.type === "image/jpeg" || file.type === "image/png";
}

function getPdfFileName(fileName: string): string {
    const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "dokument";

    return `${baseName}.pdf`;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Bild konnte nicht gelesen werden."));
        };
        image.src = objectUrl;
    });
}

function getScaledSize(
    width: number,
    height: number,
    maxDimension: number,
): { width: number; height: number } {
    const longestSide = Math.max(width, height);

    if (longestSide <= maxDimension) {
        return { width, height };
    }

    const scale = maxDimension / longestSide;

    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
    };
}

function canvasToJpegBlob(
    canvas: HTMLCanvasElement,
    quality: number,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error("Bild konnte nicht komprimiert werden."));
                    return;
                }

                resolve(blob);
            },
            "image/jpeg",
            quality,
        );
    });
}

async function createPdfFromJpegBlob(jpegBlob: Blob): Promise<Uint8Array> {
    const pdfDocument = await PDFDocument.create();
    const imageBytes = await jpegBlob.arrayBuffer();
    const image = await pdfDocument.embedJpg(imageBytes);
    const page = pdfDocument.addPage([a4Page.width, a4Page.height]);
    const margin = 28;
    const maxWidth = a4Page.width - margin * 2;
    const maxHeight = a4Page.height - margin * 2;
    const imageScale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const imageWidth = image.width * imageScale;
    const imageHeight = image.height * imageScale;

    page.drawImage(image, {
        x: (a4Page.width - imageWidth) / 2,
        y: (a4Page.height - imageHeight) / 2,
        width: imageWidth,
        height: imageHeight,
    });

    return pdfDocument.save();
}

export async function convertVehicleDocumentImageToPdf(
    file: File,
    {
        maxSizeBytes,
        maxDimension = 1800,
        initialQuality = 0.82,
        minQuality = 0.5,
    }: ConvertImageToPdfOptions,
): Promise<File> {
    if (!isConvertibleVehicleDocumentImage(file)) {
        return file;
    }

    const image = await loadImageFromFile(file);
    const size = getScaledSize(image.width, image.height, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d");

    if (!context) {
        return file;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);

    let quality = initialQuality;
    let bestPdfBytes: Uint8Array | null = null;

    while (quality >= minQuality) {
        const jpegBlob = await canvasToJpegBlob(canvas, quality);
        const pdfBytes = await createPdfFromJpegBlob(jpegBlob);
        bestPdfBytes = pdfBytes;

        if (pdfBytes.byteLength <= maxSizeBytes) {
            break;
        }

        quality -= 0.08;
    }

    if (!bestPdfBytes) {
        return file;
    }

    const pdfBlob = new Blob([bestPdfBytes.slice()], { type: "application/pdf" });

    return new File([pdfBlob], getPdfFileName(file.name), {
        type: "application/pdf",
        lastModified: Date.now(),
    });
}
