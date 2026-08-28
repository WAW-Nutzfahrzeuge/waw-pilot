import "server-only";

import {
    normalizeAccountingReviewPayload,
    type AccountingReviewReport,
} from "@/lib/accounting/accounting-review";

const REVIEW_TIMEOUT_MS = 20_000;

export class AccountingReviewRequestError extends Error {
    constructor(
        public readonly code: "CONFIGURATION" | "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE" | "INVALID_REQUEST",
        message: string,
    ) {
        super(message);
        this.name = "AccountingReviewRequestError";
    }
}

function getReviewUrl(environmentVariable: string): string {
    const reviewUrl = process.env[environmentVariable]?.trim() ?? "";

    if (!reviewUrl) {
        throw new AccountingReviewRequestError(
            "CONFIGURATION",
            "Die manuelle WAW-Buchhaltungsprüfung ist noch nicht konfiguriert.",
        );
    }

    try {
        if (new URL(reviewUrl).protocol !== "https:") throw new Error("HTTPS required");
    } catch {
        throw new AccountingReviewRequestError(
            "CONFIGURATION",
            "Die Konfiguration der manuellen WAW-Buchhaltungsprüfung ist ungültig.",
        );
    }

    return reviewUrl;
}

function getReportSecret(): string {
    const secret = process.env.N8N_ACCOUNTING_WAW_REPORT_SECRET?.trim() ?? "";

    if (!secret) {
        throw new AccountingReviewRequestError(
            "CONFIGURATION",
            "Der WAW-Buchhaltungsreport ist noch nicht konfiguriert.",
        );
    }

    return secret;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

export async function fetchWawAccountingReview(): Promise<AccountingReviewReport> {
    const reviewUrl = getReviewUrl("N8N_ACCOUNTING_WAW_REVIEW_URL");
    const reportSecret = getReportSecret();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);

    try {
        const response = await fetch(reviewUrl, {
            method: "GET",
            headers: {
                "x-api-key": reportSecret,
                Accept: "application/json",
            },
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error("[accounting-review] WAW review request failed", { status: response.status });
            throw new AccountingReviewRequestError(
                "UPSTREAM",
                "Die manuellen Buchhaltungsfälle konnten nicht geladen werden.",
            );
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new AccountingReviewRequestError(
                "INVALID_RESPONSE",
                "Der WAW-Review-Service hat keine gültige Antwort geliefert.",
            );
        }

        const report = normalizeAccountingReviewPayload(payload, "WAW");
        if (!report) {
            throw new AccountingReviewRequestError(
                "INVALID_RESPONSE",
                "Die Antwort des WAW-Review-Service ist ungültig.",
            );
        }

        return report;
    } catch (error) {
        if (error instanceof AccountingReviewRequestError) throw error;
        if (isAbortError(error)) {
            throw new AccountingReviewRequestError(
                "TIMEOUT",
                "Die manuellen Buchhaltungsfälle haben zu lange gebraucht.",
            );
        }

        console.error("[accounting-review] WAW review request error");
        throw new AccountingReviewRequestError(
            "UPSTREAM",
            "Die manuellen Buchhaltungsfälle konnten nicht geladen werden.",
        );
    } finally {
        clearTimeout(timeout);
    }
}

export type SaveWawSupplierEmailInput = {
    bookingId: number;
    supplierName: string;
    email: string;
};

function validateSupplierEmailInput(input: SaveWawSupplierEmailInput): void {
    if (!Number.isFinite(input.bookingId) || !Number.isInteger(input.bookingId) || input.bookingId < 0) {
        throw new AccountingReviewRequestError("INVALID_REQUEST", "Die Buchung ist ungültig.");
    }

    if (!input.supplierName.trim()) {
        throw new AccountingReviewRequestError("INVALID_REQUEST", "Der Lieferantenname fehlt.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
        throw new AccountingReviewRequestError("INVALID_REQUEST", "Bitte gib eine gültige E-Mail-Adresse ein.");
    }
}

export async function saveWawSupplierEmail(input: SaveWawSupplierEmailInput): Promise<string> {
    validateSupplierEmailInput(input);

    const reviewUrl = getReviewUrl("N8N_ACCOUNTING_WAW_REVIEW_ACTION_URL");
    const reportSecret = getReportSecret();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);

    try {
        const response = await fetch(reviewUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": reportSecret,
                Accept: "application/json",
            },
            body: JSON.stringify({
                action: "SAVE_SUPPLIER_EMAIL",
                bookingId: input.bookingId,
                supplierName: input.supplierName.trim(),
                email: input.email.trim(),
            }),
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            console.error("[accounting-review] WAW review action failed", { status: response.status });
            throw new AccountingReviewRequestError(
                "UPSTREAM",
                "Die Lieferanten-E-Mail konnte nicht gespeichert werden.",
            );
        }

        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            throw new AccountingReviewRequestError(
                "INVALID_RESPONSE",
                "Der Review-Service hat keine gültige Bestätigung geliefert.",
            );
        }

        if (!payload || typeof payload !== "object" || (payload as Record<string, unknown>).success !== true) {
            throw new AccountingReviewRequestError(
                "INVALID_RESPONSE",
                "Der Review-Service hat die Speicherung nicht bestätigt.",
            );
        }

        return "Lieferanten-E-Mail wurde gespeichert.";
    } catch (error) {
        if (error instanceof AccountingReviewRequestError) throw error;
        if (isAbortError(error)) {
            throw new AccountingReviewRequestError("TIMEOUT", "Die Speicherung hat zu lange gedauert.");
        }

        console.error("[accounting-review] WAW review action request error");
        throw new AccountingReviewRequestError(
            "UPSTREAM",
            "Die Lieferanten-E-Mail konnte nicht gespeichert werden.",
        );
    } finally {
        clearTimeout(timeout);
    }
}
