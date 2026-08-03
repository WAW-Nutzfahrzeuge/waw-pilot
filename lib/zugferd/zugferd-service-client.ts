import type {
    CanonicalInvoiceData,
    ZugferdValidationIssue,
} from "@/lib/zugferd/canonical-invoice";

const ZUGFERD_SERVICE_TIMEOUT_MS = 240_000;

type ZugferdServiceRequestErrorCode =
    | "UNAUTHORIZED"
    | "PAYLOAD_TOO_LARGE"
    | "TIMEOUT"
    | "SERVICE_UNAVAILABLE"
    | "SERVICE_ERROR";

export type ZugferdServiceValidationSummary = {
    status: "valid" | "invalid";
    mustangVersion?: string;
    veraPdfVersion?: string;
    xmlValid: boolean;
    pdfAValid: boolean;
    consistencyValid: boolean;
    issues: ZugferdValidationIssue[];
    blockingErrors?: ZugferdValidationIssue[];
    warnings?: ZugferdValidationIssue[];
    profileNotices?: ZugferdValidationIssue[];
};

export type ZugferdServiceResult = {
    pdfBase64: string;
    fileName?: string;
    sha256: string;
    standardVersion: string;
    profile: "EN16931";
    validation: ZugferdServiceValidationSummary;
};

export class ZugferdServiceConfigurationError extends Error {
    constructor() {
        super(
            "ZUGFeRD-Service ist noch nicht eingerichtet. Bitte ZUGFERD_SERVICE_URL und ZUGFERD_SERVICE_API_KEY konfigurieren.",
        );
        this.name = "ZugferdServiceConfigurationError";
    }
}

export class ZugferdServiceValidationError extends Error {
    readonly issues: ZugferdValidationIssue[];

    constructor(issues: ZugferdValidationIssue[]) {
        super("ZUGFeRD konnte nicht validiert werden.");
        this.name = "ZugferdServiceValidationError";
        this.issues = issues;
    }
}

export class ZugferdServiceRequestError extends Error {
    constructor(
        readonly code: ZugferdServiceRequestErrorCode,
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = "ZugferdServiceRequestError";
    }
}

function getServiceConfig(): { url: string; apiKey: string } {
    const url = process.env.ZUGFERD_SERVICE_URL?.trim();
    const apiKey = process.env.ZUGFERD_SERVICE_API_KEY?.trim();

    if (!url || !apiKey) {
        throw new ZugferdServiceConfigurationError();
    }

    return {
        url: url.replace(/\/+$/, ""),
        apiKey,
    };
}

export function isZugferdServiceConfigured(): boolean {
    return Boolean(
        process.env.ZUGFERD_SERVICE_URL?.trim() &&
            process.env.ZUGFERD_SERVICE_API_KEY?.trim(),
    );
}

async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

function assertValidServiceResult(result: ZugferdServiceResult): void {
    const validation = result.validation;
    const blockingErrors =
        validation.blockingErrors ??
        validation.issues.filter((issue) => issue.blocking);

    if (
        validation.status !== "valid" ||
        !validation.xmlValid ||
        !validation.pdfAValid ||
        !validation.consistencyValid ||
        blockingErrors.length > 0
    ) {
        throw new ZugferdServiceValidationError(
            blockingErrors.length > 0 ? blockingErrors : validation.issues,
        );
    }
}

export async function generateValidatedZugferdPdf({
    invoice,
    visiblePdfBase64,
}: {
    invoice: CanonicalInvoiceData;
    visiblePdfBase64: string;
}): Promise<ZugferdServiceResult> {
    const { url, apiKey } = getServiceConfig();
    let response: Response;

    try {
        response = await fetchWithTimeout(
            `${url}/generate`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    standardVersion: "ZUGFeRD 2.5 / Factur-X 1.09",
                    profile: "EN16931",
                    invoiceProfile: "ZUGFERD_EN16931",
                    invoice,
                    visiblePdfBase64,
                }),
            },
            ZUGFERD_SERVICE_TIMEOUT_MS,
        );
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new ZugferdServiceRequestError(
                "TIMEOUT",
                "Der ZUGFeRD-Service hat nicht rechtzeitig geantwortet.",
            );
        }

        throw new ZugferdServiceRequestError(
            "SERVICE_UNAVAILABLE",
            "Der ZUGFeRD-Service ist aktuell nicht erreichbar.",
        );
    }

    if (!response.ok) {
        let issues: ZugferdValidationIssue[] = [];
        let message: string | null = null;

        try {
            const body = (await response.json()) as {
                issues?: ZugferdValidationIssue[];
                message?: string;
                error?: {
                    message?: string;
                };
            };
            message = body.message ?? body.error?.message ?? null;
            issues =
                body.issues ??
                (message
                    ? [{ severity: "error", message }]
                    : []);
        } catch {
            issues = [];
        }

        if (response.status === 401 || response.status === 403) {
            throw new ZugferdServiceRequestError(
                "UNAUTHORIZED",
                message ??
                    "Der ZUGFeRD-Service hat die Anfrage nicht autorisiert.",
                response.status,
            );
        }

        if (response.status === 413) {
            throw new ZugferdServiceRequestError(
                "PAYLOAD_TOO_LARGE",
                message ?? "Die Rechnungs-PDF ist zu groß für den ZUGFeRD-Service.",
                response.status,
            );
        }

        if (response.status >= 500) {
            throw new ZugferdServiceRequestError(
                "SERVICE_ERROR",
                message ?? "Der ZUGFeRD-Service konnte die Anfrage nicht verarbeiten.",
                response.status,
            );
        }

        throw new ZugferdServiceValidationError(
            issues.length > 0
                ? issues
                : [
                      {
                          severity: "error",
                          message: "ZUGFeRD-Service konnte die Rechnung nicht validieren.",
                      },
                  ],
        );
    }

    const result = (await response.json()) as ZugferdServiceResult;

    assertValidServiceResult(result);

    return result;
}
