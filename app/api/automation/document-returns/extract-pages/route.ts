import { randomUUID } from "node:crypto";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { isPdf } from "@/lib/automation/file-signature";
import {
    extractPdfPages,
    maxPdfPageExtractionBytes,
    parseExpectedPageCount,
    parseRequestedPages,
    PdfPageExtractionError,
} from "@/lib/automation/pdf-page-extraction";

export const runtime = "nodejs";

function textField(form: FormData, key: string): string | null {
    const value = form.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
    const requestId = randomUUID();
    if (!authenticateAutomationRequest(request)) return automationUnauthorized();

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return automationError(400, "invalid_multipart", "Ungültige multipart/form-data-Anfrage.", { requestId });
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
        return automationError(422, "file_required", "Eine PDF-Datei ist erforderlich.", { requestId });
    }
    if (file.size > maxPdfPageExtractionBytes) {
        return automationError(413, "file_too_large", "Die PDF darf für die Seitenextraktion maximal 4 MB groß sein.", { requestId });
    }

    try {
        const pages = parseRequestedPages(textField(form, "pages"));
        const expectedPageCount = parseExpectedPageCount(textField(form, "expectedPageCount"));
        const inputBytes = new Uint8Array(await file.arrayBuffer());

        if (file.type !== "application/pdf" || !isPdf(Buffer.from(inputBytes))) {
            return automationError(415, "invalid_file_type", "Nur echte PDF-Dateien werden akzeptiert.", { requestId });
        }

        const extracted = await extractPdfPages({
            bytes: inputBytes,
            pages,
            expectedPageCount,
        });
        const pageSuffix = pages.join("-");
        const fileName = `extrahierte-seiten-${pageSuffix}.pdf`;

        return new Response(Buffer.from(extracted.bytes), {
            status: 200,
            headers: {
                "content-type": "application/pdf",
                "content-disposition": `attachment; filename="${fileName}"`,
                "content-length": String(extracted.bytes.byteLength),
                "cache-control": "private, no-store, max-age=0",
                pragma: "no-cache",
                "x-content-type-options": "nosniff",
                "x-waw-source-page-count": String(extracted.actualPageCount),
                "x-waw-extracted-pages": pages.join(","),
                "x-waw-pdf-signatures": "validity-not-guaranteed-after-extraction",
            },
        });
    } catch (error) {
        if (error instanceof PdfPageExtractionError) {
            console.warn("automation.pdf_pages.rejected", {
                requestId,
                code: error.code,
            });
            return automationError(error.status, error.code, error.message, { requestId });
        }

        console.error("automation.pdf_pages.failed", {
            requestId,
            code: "pdf_extraction_failed",
        });
        return automationError(500, "pdf_extraction_failed", "Die PDF-Seiten konnten nicht extrahiert werden.", { requestId });
    }
}

