export const ownerIdFallbackRuleVersion = "owner-id-country-fallback-v1";
export const ownerIdFallbackTimeZone = "Europe/Berlin";

export type OwnerIdPage = {
    pageNumber: number;
    documentIds: string[];
    unknownOrUnassigned: boolean;
};

export type OwnerIdAnalyzedDocument = {
    documentId: string;
    documentType: string;
    pageNumbers: number[];
    identifiers?: {
        saleIdentifier?: string;
        invoiceNumber?: string;
        vin?: string;
    };
    countryEvidence?: {
        kind: string;
        reliable: boolean;
        value: string | null;
    };
};

export type OwnerIdAnalyzedAttachment = {
    sourceAttachmentId: string;
    originalUploadId: string;
    analysisStatus: "complete" | "incomplete" | "failed";
    pageCount: number;
    pages: OwnerIdPage[];
    documents: OwnerIdAnalyzedDocument[];
};

export type OwnerIdMailAnalysis = {
    source: string;
    sourceEmailId: string;
    returnId: string;
    receivedAt: string;
    analysisStatus: "complete" | "incomplete" | "failed";
    attachmentEnumerationComplete: boolean;
    originalAttachmentCount: number;
    conflictStatus: "none" | "conflict" | "unknown";
    attachments: OwnerIdAnalyzedAttachment[];
};

export type OwnerIdIntakeDecision = {
    outcome: "assigned" | "manual_review";
    assignmentSource: "direct_identifier" | "same_email_identifier" | "country_fallback" | null;
    saleId: string | null;
    reason: string | null;
    countryCode: string | null;
    searchStartDate: string | null;
    searchEndDate: string | null;
    candidateSaleIds: string[];
};

export type OwnerIdStrongResolution =
    | { kind: "none" }
    | { kind: "unresolved"; reason: string }
    | { kind: "matched"; saleId: string; source: "direct_identifier" | "same_email_identifier" };

export type CountryFallbackCandidate = {
    id: string;
    companyId: string;
    saleDate: string | null;
    status: string;
    customerCountryCode: string | null;
};

export function getBerlinCalendarDate(value: string | Date): string | null {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: ownerIdFallbackTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
}

export function getOwnerIdFallbackDateRange(receivedAt: string): {
    startDate: string;
    endDate: string;
} | null {
    const endDate = getBerlinCalendarDate(receivedAt);
    if (!endDate) return null;
    const [year, month, day] = endDate.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day - 20));
    const startDate = [
        start.getUTCFullYear(),
        String(start.getUTCMonth() + 1).padStart(2, "0"),
        String(start.getUTCDate()).padStart(2, "0"),
    ].join("-");
    return { startDate, endDate };
}

function getDocumentMap(attachment: OwnerIdAnalyzedAttachment) {
    return new Map(attachment.documents.map((document) => [document.documentId, document]));
}

export function hasCompletePageCoverage(attachment: OwnerIdAnalyzedAttachment): boolean {
    if (!Number.isSafeInteger(attachment.pageCount) || attachment.pageCount < 1) return false;
    if (attachment.pages.length !== attachment.pageCount) return false;
    const pageNumbers = attachment.pages.map((page) => page.pageNumber);
    if (new Set(pageNumbers).size !== pageNumbers.length) return false;
    if (pageNumbers.some((page) => !Number.isSafeInteger(page) || page < 1 || page > attachment.pageCount)) return false;

    const documentMap = getDocumentMap(attachment);
    if (documentMap.size !== attachment.documents.length) return false;
    if (attachment.documents.some((document) =>
        !document.documentId ||
        !Array.isArray(document.pageNumbers) ||
        document.pageNumbers.length === 0 ||
        new Set(document.pageNumbers).size !== document.pageNumbers.length ||
        document.pageNumbers.some((page) => !pageNumbers.includes(page)),
    )) return false;

    for (const page of attachment.pages) {
        if (!Array.isArray(page.documentIds) || page.documentIds.length === 0) return false;
        for (const documentId of page.documentIds) {
            const document = documentMap.get(documentId);
            if (!document || !document.pageNumbers.includes(page.pageNumber)) return false;
        }
    }
    for (const document of attachment.documents) {
        for (const pageNumber of document.pageNumbers) {
            if (!attachment.pages.find((page) => page.pageNumber === pageNumber)?.documentIds.includes(document.documentId)) {
                return false;
            }
        }
    }
    return true;
}

export function getOwnerIdFallbackIneligibilityReason(
    analysis: OwnerIdMailAnalysis,
    ownerDocumentId: string,
): string | null {
    if (analysis.source !== "inbound_email") return "source_not_inbound_email";
    if (analysis.analysisStatus !== "complete") return "mail_analysis_incomplete";
    if (!analysis.attachmentEnumerationComplete) return "attachment_enumeration_incomplete";
    if (!Number.isSafeInteger(analysis.originalAttachmentCount) || analysis.originalAttachmentCount < 0) return "attachment_count_invalid";
    if (analysis.originalAttachmentCount !== analysis.attachments.length) return "attachment_count_mismatch";
    if (analysis.originalAttachmentCount !== 1 || analysis.attachments.length !== 1) return "mail_has_multiple_attachments";
    if (analysis.conflictStatus !== "none") return "mail_has_conflicting_or_unknown_identifiers";

    const attachment = analysis.attachments[0];
    if (attachment.analysisStatus !== "complete") return "attachment_analysis_incomplete";
    if (!hasCompletePageCoverage(attachment)) return "page_coverage_incomplete";
    const ownerDocument = attachment.documents.find((document) => document.documentId === ownerDocumentId);
    if (!ownerDocument || ownerDocument.documentType !== "owner_id") return "owner_document_not_identified";
    if (attachment.documents.length !== 1) return "attachment_contains_other_documents";
    if (attachment.pages.some((page) => page.unknownOrUnassigned)) return "attachment_contains_unknown_pages";
    if (attachment.pages.some((page) =>
        page.documentIds.length !== 1 || page.documentIds[0] !== ownerDocumentId,
    )) return "attachment_contains_other_documents";
    if (ownerDocument.pageNumbers.length !== attachment.pageCount) return "owner_document_does_not_cover_all_pages";
    if (ownerDocument.pageNumbers.some((page) => !attachment.pages.find((item) => item.pageNumber === page)?.documentIds.includes(ownerDocumentId))) {
        return "owner_document_page_mapping_invalid";
    }
    if (ownerDocument.countryEvidence?.kind !== "residence_country" || !ownerDocument.countryEvidence.reliable || !ownerDocument.countryEvidence.value?.trim()) {
        return "reliable_residence_country_missing";
    }
    return null;
}

export function findCountryFallbackCandidates(params: {
    companyId: string;
    countryCode: string;
    startDate: string;
    endDate: string;
    sales: CountryFallbackCandidate[];
}): CountryFallbackCandidate[] {
    return params.sales.filter((sale) =>
        sale.companyId === params.companyId &&
        (sale.status === "active" || sale.status === "completed") &&
        Boolean(sale.saleDate) &&
        sale.saleDate! >= params.startDate &&
        sale.saleDate! <= params.endDate &&
        sale.customerCountryCode === params.countryCode,
    );
}

export function decideOwnerIdAssignment(params: {
    analysis: OwnerIdMailAnalysis;
    ownerDocumentId: string;
    strongResolution: OwnerIdStrongResolution;
    countryCode: string | null;
    countryCandidates: Array<{ id: string }>;
    dateRange: { startDate: string; endDate: string } | null;
}): OwnerIdIntakeDecision {
    if (params.strongResolution.kind === "matched") {
        return {
            outcome: "assigned",
            assignmentSource: params.strongResolution.source,
            saleId: params.strongResolution.saleId,
            reason: null,
            countryCode: null,
            searchStartDate: null,
            searchEndDate: null,
            candidateSaleIds: [params.strongResolution.saleId],
        };
    }
    if (params.strongResolution.kind === "unresolved") {
        return manualDecision(params.strongResolution.reason, params.countryCode, params.dateRange, params.countryCandidates);
    }

    const ineligibilityReason = getOwnerIdFallbackIneligibilityReason(params.analysis, params.ownerDocumentId);
    if (ineligibilityReason) {
        return manualDecision(ineligibilityReason, params.countryCode, params.dateRange, params.countryCandidates);
    }
    if (!params.countryCode) {
        return manualDecision("residence_country_unrecognized", null, params.dateRange, []);
    }
    if (!params.dateRange) {
        return manualDecision("received_at_invalid", params.countryCode, null, []);
    }
    if (params.countryCandidates.length === 1) {
        return {
            outcome: "assigned",
            assignmentSource: "country_fallback",
            saleId: params.countryCandidates[0].id,
            reason: null,
            countryCode: params.countryCode,
            searchStartDate: params.dateRange.startDate,
            searchEndDate: params.dateRange.endDate,
            candidateSaleIds: [params.countryCandidates[0].id],
        };
    }
    return manualDecision(
        params.countryCandidates.length === 0 ? "no_country_candidate" : "multiple_country_candidates",
        params.countryCode,
        params.dateRange,
        params.countryCandidates,
    );
}

function manualDecision(
    reason: string,
    countryCode: string | null,
    dateRange: { startDate: string; endDate: string } | null,
    candidates: Array<{ id: string }>,
): OwnerIdIntakeDecision {
    return {
        outcome: "manual_review",
        assignmentSource: null,
        saleId: null,
        reason,
        countryCode,
        searchStartDate: dateRange?.startDate ?? null,
        searchEndDate: dateRange?.endDate ?? null,
        candidateSaleIds: candidates.map((candidate) => candidate.id),
    };
}
