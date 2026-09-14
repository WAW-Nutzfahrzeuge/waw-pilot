export type VehicleDocumentCandidate = {
    id: string;
    document_type: string;
    file_path: string | null;
    status: "available" | "missing" | "needs_review";
    created_at: string;
};

function timestamp(value: string): number {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

export function selectCurrentVehicleDocument<T extends VehicleDocumentCandidate>(
    documents: readonly T[],
    documentType: string,
): T | null {
    return (
        documents
            .filter(
                (document) =>
                    document.document_type === documentType &&
                    Boolean(document.file_path) &&
                    document.status !== "missing",
            )
            .sort(
                (left, right) =>
                    timestamp(right.created_at) - timestamp(left.created_at) ||
                    right.id.localeCompare(left.id),
            )[0] ?? null
    );
}
