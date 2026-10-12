import { PDFDocument } from "pdf-lib";

// Vercel Functions currently cap both request and response bodies at 4.5 MB.
// Keep room for multipart headers and response framing instead of advertising
// the 10 MB direct-to-Storage limit used by other document uploads.
export const maxPdfPageExtractionBytes = 4 * 1024 * 1024;

export type PdfPageExtractionErrorCode =
    | "invalid_pages"
    | "invalid_expected_page_count"
    | "invalid_pdf"
    | "encrypted_pdf"
    | "page_count_mismatch"
    | "page_out_of_range"
    | "extracted_pdf_too_large";

export class PdfPageExtractionError extends Error {
    readonly code: PdfPageExtractionErrorCode;
    readonly status: number;

    constructor(
        code: PdfPageExtractionErrorCode,
        status: number,
        message: string,
    ) {
        super(message);
        this.name = "PdfPageExtractionError";
        this.code = code;
        this.status = status;
    }
}

export function parseRequestedPages(value: string | null): number[] {
    let parsed: unknown;

    try {
        parsed = value === null ? null : JSON.parse(value);
    } catch {
        throw new PdfPageExtractionError(
            "invalid_pages",
            422,
            "pages muss ein gültiges JSON-Array sein.",
        );
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new PdfPageExtractionError(
            "invalid_pages",
            422,
            "pages muss eine nicht leere Liste enthalten.",
        );
    }

    const pages = parsed as unknown[];
    for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const previousPage = index > 0 ? pages[index - 1] : null;

        if (
            !Number.isSafeInteger(page) ||
            Number(page) < 1 ||
            (previousPage !== null && Number(page) <= Number(previousPage))
        ) {
            throw new PdfPageExtractionError(
                "invalid_pages",
                422,
                "pages muss eindeutige, aufsteigend sortierte, positive Ganzzahlen enthalten.",
            );
        }
    }

    return pages as number[];
}

export function parseExpectedPageCount(value: string | null): number {
    if (!value || !/^[1-9]\d*$/.test(value)) {
        throw new PdfPageExtractionError(
            "invalid_expected_page_count",
            422,
            "expectedPageCount muss eine positive Ganzzahl sein.",
        );
    }

    const pageCount = Number(value);
    if (!Number.isSafeInteger(pageCount)) {
        throw new PdfPageExtractionError(
            "invalid_expected_page_count",
            422,
            "expectedPageCount ist außerhalb des unterstützten Bereichs.",
        );
    }

    return pageCount;
}

export async function extractPdfPages(params: {
    bytes: Uint8Array;
    pages: number[];
    expectedPageCount: number;
}): Promise<{ bytes: Uint8Array; actualPageCount: number }> {
    let sourcePdf: PDFDocument;

    try {
        sourcePdf = await PDFDocument.load(params.bytes, {
            updateMetadata: false,
        });
    } catch (error) {
        const technicalName = error instanceof Error ? error.name : "";
        const technicalMessage = error instanceof Error ? error.message : "";
        const encrypted =
            technicalName === "EncryptedPDFError" ||
            technicalMessage.toLowerCase().includes("encrypted");

        throw new PdfPageExtractionError(
            encrypted ? "encrypted_pdf" : "invalid_pdf",
            422,
            encrypted
                ? "Verschlüsselte PDFs können nicht verarbeitet werden."
                : "Die PDF ist beschädigt oder kann nicht verarbeitet werden.",
        );
    }

    const actualPageCount = sourcePdf.getPageCount();
    if (actualPageCount !== params.expectedPageCount) {
        throw new PdfPageExtractionError(
            "page_count_mismatch",
            409,
            "Die tatsächliche Seitenzahl stimmt nicht mit expectedPageCount überein.",
        );
    }

    if (params.pages.some((page) => page > actualPageCount)) {
        throw new PdfPageExtractionError(
            "page_out_of_range",
            422,
            "Mindestens eine angeforderte Seite liegt außerhalb der PDF.",
        );
    }

    const outputPdf = await PDFDocument.create();
    const copiedPages = await outputPdf.copyPages(
        sourcePdf,
        params.pages.map((page) => page - 1),
    );
    copiedPages.forEach((page) => outputPdf.addPage(page));

    const outputBytes = await outputPdf.save({
        addDefaultPage: false,
        useObjectStreams: true,
        updateFieldAppearances: false,
    });

    if (outputBytes.byteLength > maxPdfPageExtractionBytes) {
        throw new PdfPageExtractionError(
            "extracted_pdf_too_large",
            413,
            "Die extrahierte PDF überschreitet das unterstützte Antwortlimit.",
        );
    }

    return { bytes: outputBytes, actualPageCount };
}

