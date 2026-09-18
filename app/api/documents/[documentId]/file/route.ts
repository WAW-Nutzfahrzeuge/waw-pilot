import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { getDocumentDownloadFileName } from "@/lib/documents/visible-file-names";
import { createDocumentUseCases } from "@/src/modules/documents/infrastructure/factories/document-use-case.factory";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{
        documentId: string;
    }>;
};

function createContentDisposition(disposition: "attachment" | "inline", fileName: string): string {
    const asciiFallback = fileName
        .replace(/[^\x20-\x7e]/g, "_")
        .replace(/"/g, "")
        .trim() || "Dokument";

    return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, context: RouteContext) {
    const { documentId } = await context.params;

    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";
    const versionId = url.searchParams.get("versionId") ?? undefined;
    const companyId = getCurrentCompanyId();
    const { getDocumentDetail, generateDocumentAccessUrl } = createDocumentUseCases();

    let file;
    try {
        await getDocumentDetail.execute({ companyId, documentId });
        file = await generateDocumentAccessUrl.execute({
            companyId,
            documentId,
            versionId,
            expiresInSeconds: 60,
        });
    } catch (error) {
        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : "Dokument konnte nicht geladen werden.",
            },
            { status: 404 },
        );
    }

    const response = await fetch(file.signedUrl, { cache: "no-store" });

    if (!response.ok) {
        return NextResponse.json(
            {
                message: "Datei konnte nicht aus Storage geladen werden.",
            },
            { status: 404 },
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const fileName = getDocumentDownloadFileName({
        storedFileName: file.fileName,
        documentType: file.documentType,
        mimeType: file.mimeType,
        invoiceNumber: file.invoiceNumber,
        storagePath: file.storagePath,
        versionNumber: file.versionNumber,
    });
    const contentType = file.mimeType || "application/octet-stream";
    const disposition = shouldDownload ? "attachment" : "inline";

    return new NextResponse(Buffer.from(arrayBuffer), {
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": createContentDisposition(disposition, fileName),
            "Cache-Control": "no-store",
        },
    });
}
