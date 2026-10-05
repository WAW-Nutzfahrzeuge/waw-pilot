export type SortDirection = "ascending" | "descending";

export function compareNumberedReferences(
    firstReference: string | null,
    secondReference: string | null,
    direction: SortDirection,
): number {
    if (firstReference === null && secondReference === null) return 0;
    if (firstReference === null) return 1;
    if (secondReference === null) return -1;

    const result = firstReference.localeCompare(secondReference, "de", {
        numeric: true,
        sensitivity: "base",
    });

    return direction === "ascending" ? result : -result;
}
