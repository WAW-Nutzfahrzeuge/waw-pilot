export function normalizeSaleSearchQuery(value: string): string {
    return value.trim().toLowerCase();
}

export function buildSaleSearchText(values: readonly (string | null | undefined)[]): string {
    return values.filter(Boolean).join(" ").toLowerCase();
}

export function matchesSaleSearchText(searchText: string, query: string): boolean {
    const normalizedQuery = normalizeSaleSearchQuery(query);
    return !normalizedQuery || searchText.includes(normalizedQuery);
}
