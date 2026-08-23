import "server-only";

import {
    normalizeAccountingReportItems,
    type AccountingReportItem,
} from "@/lib/accounting/accounting-report";

const REPORT_TIMEOUT_MS = 20_000;

export class AccountingReportRequestError extends Error {
    constructor(
        public readonly code: "CONFIGURATION" | "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE",
        message: string,
    ) {
        super(message);
        this.name = "AccountingReportRequestError";
    }
}

function getReportConfig(): {
    reportUrl: string;
    reportSecret: string;
} {
    const reportUrl = process.env.N8N_ACCOUNTING_WAW_REPORT_URL?.trim() ?? "";
    const rawSecret = process.env.N8N_ACCOUNTING_WAW_REPORT_SECRET;
    const reportSecret = rawSecret?.trim() ?? "";

    let parsedUrl: URL | null = null;
    try {
        if (reportUrl) parsedUrl = new URL(reportUrl);
    } catch {
        parsedUrl = null;
    }

    if (!reportUrl || !reportSecret) {
        throw new AccountingReportRequestError(
            "CONFIGURATION",
            "Der WAW-Buchhaltungsreport ist noch nicht konfiguriert.",
        );
    }

    if (!parsedUrl || parsedUrl.protocol !== "https:") {
        throw new AccountingReportRequestError(
            "CONFIGURATION",
            "Die Konfiguration des WAW-Buchhaltungsreports ist ungültig.",
        );
    }

    return { reportUrl, reportSecret };
}

export async function fetchWawAccountingReport(): Promise<AccountingReportItem[]> {
    const { reportUrl, reportSecret } = getReportConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);

    try {
        const response = await fetch(reportUrl, {
            method: "GET",
            headers: {
                "x-api-key": reportSecret,
                Accept: "application/json",
            },
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error("[accounting-report] WAW report request failed", {
                status: response.status,
            });
            throw new AccountingReportRequestError(
                "UPSTREAM",
                "Der WAW-Buchhaltungsreport konnte nicht geladen werden.",
            );
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new AccountingReportRequestError(
                "INVALID_RESPONSE",
                "Der WAW-Buchhaltungsreport hat keine gültige Antwort geliefert.",
            );
        }

        try {
            const items = normalizeAccountingReportItems(payload, "WAW");
            if (!items) {
                throw new Error("Erwartet wurde ein Array von Reporteinträgen.");
            }

            return items;
        } catch (error) {
            console.error("[accounting-report] WAW report response invalid", {
                reason: error instanceof Error ? error.message : "unknown",
            });
            throw new AccountingReportRequestError(
                "INVALID_RESPONSE",
                "Die Antwort des WAW-Buchhaltungsreports ist ungültig.",
            );
        }
    } catch (error) {
        if (error instanceof AccountingReportRequestError) throw error;

        if (error instanceof DOMException && error.name === "AbortError") {
            throw new AccountingReportRequestError(
                "TIMEOUT",
                "Der WAW-Buchhaltungsreport hat zu lange gebraucht.",
            );
        }

        console.error("[accounting-report] WAW report request error");
        throw new AccountingReportRequestError(
            "UPSTREAM",
            "Der WAW-Buchhaltungsreport konnte nicht geladen werden.",
        );
    } finally {
        clearTimeout(timeout);
    }
}
