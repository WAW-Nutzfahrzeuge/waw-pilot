import "server-only";

import {
    DATEV_EXPORT_MAX_UPLOAD_BYTES,
    type DatevAccountingCompany,
} from "@/lib/accounting/datev-export-limits";

type DatevWebhookResponse = {
    success?: unknown;
    company?: unknown;
};

export class DatevExportRequestError extends Error {
    constructor(
        public readonly code:
            | "INVALID_REQUEST"
            | "PAYLOAD_TOO_LARGE"
            | "CONFIGURATION_ERROR"
            | "TIMEOUT"
            | "UPSTREAM_ERROR",
        message: string,
    ) {
        super(message);
        this.name = "DatevExportRequestError";
    }
}

function getWebhookUrl(company: DatevAccountingCompany): string {
    const environmentVariable =
        company === "WAW"
            ? "N8N_DATEV_WAW_WEBHOOK_URL"
            : "N8N_DATEV_WBT_WEBHOOK_URL";
    const webhookUrl = process.env[environmentVariable]?.trim();

    if (!webhookUrl) {
        throw new DatevExportRequestError(
            "CONFIGURATION_ERROR",
            "Der DATEV-Webhook ist noch nicht konfiguriert.",
        );
    }

    try {
        const parsedUrl = new URL(webhookUrl);

        if (parsedUrl.protocol !== "https:") {
            throw new Error("Webhook muss HTTPS verwenden");
        }
    } catch {
        throw new DatevExportRequestError(
            "CONFIGURATION_ERROR",
            "Die DATEV-Webhook-Konfiguration ist ungültig.",
        );
    }

    return webhookUrl;
}

export function validateDatevCsvFile(file: File): void {
    if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new DatevExportRequestError(
            "INVALID_REQUEST",
            "Bitte wähle eine DATEV-Datei im CSV-Format aus.",
        );
    }

    if (file.size <= 0) {
        throw new DatevExportRequestError(
            "INVALID_REQUEST",
            "Die ausgewählte CSV-Datei ist leer.",
        );
    }

    if (file.size > DATEV_EXPORT_MAX_UPLOAD_BYTES) {
        throw new DatevExportRequestError(
            "PAYLOAD_TOO_LARGE",
            "Die CSV-Datei darf maximal 10 MB groß sein.",
        );
    }

    const allowedMimeTypes = new Set([
        "",
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "text/plain",
        "application/octet-stream",
    ]);

    if (!allowedMimeTypes.has(file.type.toLowerCase())) {
        throw new DatevExportRequestError(
            "INVALID_REQUEST",
            "Die ausgewählte Datei hat keinen unterstützten CSV-Dateityp.",
        );
    }
}

function getSafeFileName(fileName: string): string {
    const safeFileName = fileName
        .replace(/[\\/\0\r\n]/g, "_")
        .replace(/[^\p{L}\p{N}._ ()-]/gu, "_")
        .trim();

    return safeFileName.toLowerCase().endsWith(".csv") && safeFileName.length > 4
        ? safeFileName.slice(0, 180)
        : "datev-export.csv";
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

export async function forwardDatevExportToN8n({
    file,
    company,
    uploadedBy,
}: {
    file: File;
    company: DatevAccountingCompany;
    uploadedBy: string;
}): Promise<{ company: DatevAccountingCompany; message: string }> {
    validateDatevCsvFile(file);

    const webhookUrl = getWebhookUrl(company);
    const safeFileName = getSafeFileName(file.name);
    const webhookBody = new FormData();

    webhookBody.append("company", company);
    webhookBody.append("file", file, safeFileName);
    webhookBody.append("filename", safeFileName);
    webhookBody.append("uploadedAt", new Date().toISOString());
    webhookBody.append("uploadedBy", uploadedBy);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
        console.log("[datev-export] sending to n8n", {
            company,
            fileName: file.name,
            fileSize: file.size,
        });

        const response = await fetch(webhookUrl, {
            method: "POST",
            body: webhookBody,
            signal: controller.signal,
            cache: "no-store",
        });

        console.log("[datev-export] n8n response", {
            company,
            status: response.status,
        });

        if (!response.ok) {
            console.error("[datev-export] n8n returned an error", {
                company,
                status: response.status,
            });
            throw new DatevExportRequestError(
                "UPSTREAM_ERROR",
                "Der DATEV-Export konnte nicht an n8n übergeben werden.",
            );
        }

        const rawResponse = await response.text();

        console.log("[datev-export] raw n8n response", {
            company,
            status: response.status,
            contentType: response.headers.get("content-type"),
            body: rawResponse,
        });

        let responseData: DatevWebhookResponse;

        try {
            responseData = JSON.parse(rawResponse) as DatevWebhookResponse;
        } catch {
            throw new DatevExportRequestError(
                "UPSTREAM_ERROR",
                "n8n hat keine gültige Bestätigung zurückgegeben.",
            );
        }

        if (
            responseData.success !== true ||
            (responseData.company !== undefined && responseData.company !== company)
        ) {
            console.error("[datev-export] n8n returned an invalid confirmation", {
                company,
                responseCompany: responseData.company,
            });
            throw new DatevExportRequestError(
                "UPSTREAM_ERROR",
                "n8n hat den DATEV-Export nicht bestätigt.",
            );
        }

        return {
            company,
            message: "DATEV-Export wurde erfolgreich an die Verarbeitung übergeben.",
        };
    } catch (error) {
        if (error instanceof DatevExportRequestError) {
            throw error;
        }

        if (isAbortError(error)) {
            throw new DatevExportRequestError(
                "TIMEOUT",
                "Die Verarbeitung hat zu lange gedauert. Bitte versuche es erneut.",
            );
        }

        console.error("[datev-export] n8n request failed", { company });
        throw new DatevExportRequestError(
            "UPSTREAM_ERROR",
            "DATEV-Export konnte nicht verarbeitet werden. Bitte versuche es erneut.",
        );
    } finally {
        clearTimeout(timeout);
    }
}
