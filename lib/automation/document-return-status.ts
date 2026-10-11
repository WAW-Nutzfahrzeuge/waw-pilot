export function isSignedReturnSatisfied(params: {
    signatureStatus: string | null;
    reviewStatus: string | null;
    documentId: string | null;
    documentVersionId: string | null;
    activeVersionId: string | null | undefined;
}): boolean {
    return Boolean(params.documentId) &&
        Boolean(params.documentVersionId) &&
        params.documentVersionId === params.activeVersionId &&
        params.signatureStatus === "present" &&
        params.reviewStatus === "accepted";
}

export function getAutomationReturnDocumentStatus(params: {
    signatureStatus: string | null;
    reviewStatus: string | null;
}): "available" | "needs_review" {
    return params.signatureStatus === "present" &&
        params.reviewStatus === "accepted"
        ? "available"
        : "needs_review";
}
