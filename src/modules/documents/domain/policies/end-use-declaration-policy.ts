const supportedCountries: Record<string, string> = {
    RU: "Russland",
    RUSSIA: "Russland",
    RUSSIANFEDERATION: "Russland",
    RUSSISCHEFODERATION: "Russland",
    KZ: "Kasachstan",
    KAZAKHSTAN: "Kasachstan",
    KIRGISISTAN: "Kirgisistan",
    KYRGYZSTAN: "Kirgisistan",
    KYRGYZREPUBLIC: "Kirgisistan",
    KG: "Kirgisistan",
    KASACHSTAN: "Kasachstan",
    TADSCHIKISTAN: "Tadschikistan",
    TAJIKISTAN: "Tadschikistan",
    TJ: "Tadschikistan",
    SYRIEN: "Syrien",
    SYRIA: "Syrien",
    SYRIANARABREPUBLIC: "Syrien",
    SY: "Syrien",
};

function normalizeCountry(value: string): string {
    return value
        .trim()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z]/g, "")
        .toUpperCase();
}

export function getEndUseDeclarationDestinationCountry(
    country: string | null | undefined,
): string | null {
    if (!country) return null;

    return supportedCountries[normalizeCountry(country)] ?? null;
}

export function requiresEndUseDeclaration(
    country: string | null | undefined,
): boolean {
    return getEndUseDeclarationDestinationCountry(country) !== null;
}
