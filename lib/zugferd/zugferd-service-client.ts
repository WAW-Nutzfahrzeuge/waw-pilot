import type {
    ZugferdValidationIssue,
} from "@/lib/zugferd/canonical-invoice";

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

export function isZugferdServiceConfigured(): boolean {
    return Boolean(
        process.env.ZUGFERD_SERVICE_URL?.trim() &&
            process.env.ZUGFERD_SERVICE_API_KEY?.trim(),
    );
}
