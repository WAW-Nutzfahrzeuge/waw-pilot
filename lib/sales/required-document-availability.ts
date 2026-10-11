export type RequiredDocumentAvailabilityInput = {
    document_type: string;
    status: "available" | "missing" | "needs_review";
    source?: string | null;
};

const SIGNED_RETURN_DOCUMENT_TYPES = new Set([
    "handover_protocol",
    "entry_certificate",
    "transport_proof",
]);

export function isRequiredDocumentAvailable(
    document: RequiredDocumentAvailabilityInput,
): boolean {
    if (
        SIGNED_RETURN_DOCUMENT_TYPES.has(document.document_type) &&
        document.source === "generated"
    ) {
        return false;
    }

    return document.status === "available" ||
        (document.status === "needs_review" && document.source === "generated");
}
