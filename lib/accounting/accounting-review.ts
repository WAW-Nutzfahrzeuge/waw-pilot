export type AccountingReviewStatus = "REVIEW" | "CONTACT_REVIEW" | "NO_MATCH" | "PAYMENT_REVIEW" | string;

export type AccountingReviewItem = {
    id: number;
    bookingKey: string | null;
    bookingDate: string | null;
    valueDate: string | null;
    counterparty: string | null;
    purpose: string | null;
    amount: number | null;
    documentCount: number | null;
    status: AccountingReviewStatus;
    supplierEmail: string | null;
    matchedEmail: string | null;
    matchedAttachmentName: string | null;
    requestSentAt: string | null;
    documentFoundAt: string | null;
    sentToDatevAt: string | null;
    notes: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

export type AccountingReviewCounts = {
    total: number;
    review: number;
    contactReview: number;
    noMatch: number;
    paymentReview: number;
};

export type AccountingReviewReport = {
    counts: AccountingReviewCounts;
    items: AccountingReviewItem[];
};

const reviewStatuses = new Set(["REVIEW", "CONTACT_REVIEW", "NO_MATCH", "PAYMENT_REVIEW"]);

function stringValue(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function numberValue(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string" || !value.trim()) return null;

    const input = value.trim().replace(/\s/g, "");
    const lastComma = input.lastIndexOf(",");
    const lastDot = input.lastIndexOf(".");
    const normalized = lastComma >= 0 && lastDot >= 0
        ? lastComma > lastDot
            ? input.replace(/\./g, "").replace(",", ".")
            : input.replace(/,/g, "")
        : input.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function countValue(value: unknown): number {
    const parsed = numberValue(value);
    return parsed === null ? 0 : Math.max(0, Math.trunc(parsed));
}

function idValue(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeAccountingReviewPayload(
    payload: unknown,
    expectedCompany: string,
): AccountingReviewReport | null {
    if (!payload || typeof payload !== "object") return null;

    const rawPayload = payload as Record<string, unknown>;
    if (rawPayload.success !== true) return null;

    const company = stringValue(rawPayload.company);
    if (!company || company.toUpperCase() !== expectedCompany.toUpperCase()) return null;

    const rawCounts = rawPayload.counts;
    if (!rawCounts || typeof rawCounts !== "object" || !Array.isArray(rawPayload.items)) return null;

    const counts = rawCounts as Record<string, unknown>;
    const items: AccountingReviewItem[] = [];

    for (const rawItem of rawPayload.items) {
        if (!rawItem || typeof rawItem !== "object") return null;

        const item = rawItem as Record<string, unknown>;
        const id = idValue(item.id);
        if (id === null) return null;

        items.push({
            id,
            bookingKey: stringValue(item.bookingKey),
            bookingDate: stringValue(item.bookingDate),
            valueDate: stringValue(item.valueDate),
            counterparty: stringValue(item.counterparty),
            purpose: stringValue(item.purpose),
            amount: numberValue(item.amount),
            documentCount: countValue(item.documentCount),
            status: stringValue(item.status)?.toUpperCase() ?? "REVIEW",
            supplierEmail: stringValue(item.supplierEmail),
            matchedEmail: stringValue(item.matchedEmail),
            matchedAttachmentName: stringValue(item.matchedAttachmentName),
            requestSentAt: stringValue(item.requestSentAt),
            documentFoundAt: stringValue(item.documentFoundAt),
            sentToDatevAt: stringValue(item.sentToDatevAt),
            notes: stringValue(item.notes),
            createdAt: stringValue(item.createdAt),
            updatedAt: stringValue(item.updatedAt),
        });
    }

    const reviewItems = items.filter((item) => reviewStatuses.has(item.status));
    const paymentReviewFromApi = countValue(counts.paymentReview);

    return {
        counts: {
            total: countValue(counts.total),
            review: countValue(counts.review),
            contactReview: countValue(counts.contactReview),
            noMatch: countValue(counts.noMatch),
            paymentReview: paymentReviewFromApi || reviewItems.filter((item) => item.status === "PAYMENT_REVIEW").length,
        },
        items: reviewItems,
    };
}
