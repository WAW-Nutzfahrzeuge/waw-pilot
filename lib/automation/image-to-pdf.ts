import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import type { AutomationOriginalFileType } from "@/lib/automation/file-signature";

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 24;
const MAX_IMAGE_PIXELS = 40_000_000;

export class ImageToPdfError extends Error {
    public readonly code: "invalid_image" | "unsupported_image_type" | "converted_pdf_too_large";
    public readonly status: 413 | 415 | 422;

    constructor(
        code: "invalid_image" | "unsupported_image_type" | "converted_pdf_too_large",
        status: 413 | 415 | 422,
        message: string,
    ) {
        super(message);
        this.name = "ImageToPdfError";
        this.code = code;
        this.status = status;
    }
}

export async function validateImageReadable(bytes: Buffer): Promise<void> {
    try {
        const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
        const metadata = await image.metadata();
        if (
            !metadata.width ||
            !metadata.height ||
            !["jpeg", "png"].includes(metadata.format ?? "") ||
            metadata.width * metadata.height > MAX_IMAGE_PIXELS
        ) {
            throw new Error("invalid_image_dimensions");
        }
        // stats() forces a full decode so truncated or corrupt pixel data is
        // rejected before the original is registered.
        await image.stats();
    } catch {
        throw new ImageToPdfError("invalid_image", 422, "Das Bild ist beschädigt oder nicht lesbar.");
    }
}

export async function convertImageToPdf(params: {
    bytes: Buffer;
    mimeType: AutomationOriginalFileType;
    maxOutputBytes: number;
}): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    if (params.mimeType !== "image/jpeg" && params.mimeType !== "image/png") {
        throw new ImageToPdfError("unsupported_image_type", 415, "Nur JPEG- und PNG-Bilder können umgewandelt werden.");
    }

    try {
        // rotate() without an angle applies EXIF orientation and removes the
        // orientation tag. The original input buffer is never modified.
        const pipeline = sharp(params.bytes, {
            failOn: "error",
            limitInputPixels: MAX_IMAGE_PIXELS,
        }).rotate();
        const metadata = await pipeline.metadata();

        if (
            !metadata.width ||
            !metadata.height ||
            !["jpeg", "png"].includes(metadata.format ?? "") ||
            metadata.width * metadata.height > MAX_IMAGE_PIXELS
        ) {
            throw new ImageToPdfError("invalid_image", 422, "Das Bild ist beschädigt oder nicht lesbar.");
        }

        const normalized = params.mimeType === "image/jpeg"
            ? await pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer()
            : await pipeline.png({ compressionLevel: 9 }).toBuffer();
        const normalizedMetadata = await sharp(normalized).metadata();
        const width = normalizedMetadata.width;
        const height = normalizedMetadata.height;

        if (!width || !height) {
            throw new ImageToPdfError("invalid_image", 422, "Das Bild ist beschädigt oder nicht lesbar.");
        }

        const landscape = width > height;
        const pageWidth = landscape ? A4_PORTRAIT.height : A4_PORTRAIT.width;
        const pageHeight = landscape ? A4_PORTRAIT.width : A4_PORTRAIT.height;
        const availableWidth = pageWidth - PAGE_MARGIN * 2;
        const availableHeight = pageHeight - PAGE_MARGIN * 2;
        const scale = Math.min(availableWidth / width, availableHeight / height);
        const drawWidth = width * scale;
        const drawHeight = height * scale;

        const pdf = await PDFDocument.create();
        const page = pdf.addPage([pageWidth, pageHeight]);
        const image = params.mimeType === "image/jpeg"
            ? await pdf.embedJpg(normalized)
            : await pdf.embedPng(normalized);

        page.drawImage(image, {
            x: (pageWidth - drawWidth) / 2,
            y: (pageHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
        });

        const pdfBytes = await pdf.save({ useObjectStreams: true });
        if (pdfBytes.byteLength > params.maxOutputBytes) {
            throw new ImageToPdfError(
                "converted_pdf_too_large",
                413,
                "Die erzeugte PDF überschreitet das unterstützte Größenlimit.",
            );
        }

        return { bytes: pdfBytes, width, height };
    } catch (error) {
        if (error instanceof ImageToPdfError) throw error;
        throw new ImageToPdfError("invalid_image", 422, "Das Bild ist beschädigt oder nicht lesbar.");
    }
}
