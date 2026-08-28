export type AccountingReportStatus =
    | "NEW"
    | "SEARCHING"
    | "FOUND"
    | "REQUEST_NEEDED"
    | "REQUEST_SENT"
    | "RECEIVED"
    | "SENT_TO_DATEV"
    | "MANUAL_REVIEW"
    | string;

export type AccountingReportItem = {
    id: string;
    company: string | null;
    bookingDate: string | null;
    valueDate: string | null;
    counterparty: string | null;
    iban: string | null;
    bic: string | null;
    purpose: string | null;
    amount: number | null;
    documentCount: number | null;
    checked: boolean | null;
    status: AccountingReportStatus;
    matchedEmail: string | null;
    matchedAttachmentName: string | null;
    supplierEmail: string | null;
    requestSentAt: string | null;
    documentFoundAt: string | null;
    sentToDatevAt: string | null;
    archiveCategory: string | null;
    archivePath: string | null;
    notes: string | null;
    sourceFileName: string | null;
    importBatchId: string | null;
    bookingKey: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

function stringValue(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function numberValue(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== "string") return null;

    const input = value.trim().replace(/\s/g, "");
    if (!input) return null;

    const lastComma = input.lastIndexOf(",");
    const lastDot = input.lastIndexOf(".");
    const normalized =
        lastComma >= 0 && lastDot >= 0
            ? lastComma > lastDot
                ? input.replace(/\./g, "").replace(",", ".")
                : input.replace(/,/g, "")
            : input.replace(",", ".");
    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown): number | null {
    const parsed = numberValue(value);
    return parsed === null ? null : Math.max(0, Math.trunc(parsed));
}

function booleanValue(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;

    return null;
}

export function normalizeAccountingReportItems(
    payload: unknown,
    expectedCompany: string,
): AccountingReportItem[] | null {
    let rawItems: unknown[];

    if (Array.isArray(payload)) {
        rawItems = payload;
    } else if (payload && typeof payload === "object") {
        const wrappedPayload = payload as Record<string, unknown>;
        if (wrappedPayload.success !== undefined && wrappedPayload.success !== true) return null;

        const payloadCompany = stringValue(wrappedPayload.company);
        if (payloadCompany && payloadCompany.toUpperCase() !== expectedCompany.toUpperCase()) {
            throw new Error("Report enthält einen unerwarteten Firmenkontext.");
        }

        if (!Array.isArray(wrappedPayload.items)) return null;
        rawItems = wrappedPayload.items;
    } else {
        return null;
    }

    return rawItems.map((rawItem, index) => {
        const item = rawItem && typeof rawItem === "object"
            ? rawItem as Record<string, unknown>
            : {};
        const company = stringValue(item.company);

        if (company && company.toUpperCase() !== expectedCompany.toUpperCase()) {
            throw new Error("Report enthält einen unerwarteten Firmenkontext.");
        }

        return {
            id: stringValue(item.id) ?? `report-item-${index}`,
            company,
            bookingDate: stringValue(item.bookingDate),
            valueDate: stringValue(item.valueDate),
            counterparty: stringValue(item.counterparty),
            iban: stringValue(item.iban),
            bic: stringValue(item.bic),
            purpose: stringValue(item.purpose),
            amount: numberValue(item.amount),
            documentCount: integerValue(item.documentCount),
            checked: booleanValue(item.checked),
            status: stringValue(item.status)?.toUpperCase() ?? "NEW",
            matchedEmail: stringValue(item.matchedEmail),
            matchedAttachmentName: stringValue(item.matchedAttachmentName),
            supplierEmail: stringValue(item.supplierEmail),
            requestSentAt: stringValue(item.requestSentAt),
            documentFoundAt: stringValue(item.documentFoundAt),
            sentToDatevAt: stringValue(item.sentToDatevAt),
            archiveCategory: stringValue(item.archiveCategory),
            archivePath: stringValue(item.archivePath),
            notes: stringValue(item.notes),
            sourceFileName: stringValue(item.sourceFileName),
            importBatchId: stringValue(item.importBatchId),
            bookingKey: stringValue(item.bookingKey),
            createdAt: stringValue(item.createdAt),
            updatedAt: stringValue(item.updatedAt),
        };
    });
}
