const supportedCountries: Record<string, string> = {
    RU: "Russland",
    RUSSIA: "Russland",
    RUSSIANFEDERATION: "Russland",
    RUSSISCHEFODERATION: "Russland",
    BY: "Belarus",
    BELARUS: "Belarus",
    BELARUSREPUBLIC: "Belarus",
    GE: "Georgien",
    GEORGIA: "Georgien",
    GEORGIEN: "Georgien",
    KZ: "Kasachstan",
    KAZAKHSTAN: "Kasachstan",
    KIRGISISTAN: "Kirgisistan",
    KIRGISTAN: "Kirgisistan",
    KYRGYZSTAN: "Kirgisistan",
    KYRGYZREPUBLIC: "Kirgisistan",
    KG: "Kirgisistan",
    KASACHSTAN: "Kasachstan",
    TADSCHIKISTAN: "Tadschikistan",
    TAJIKISTAN: "Tadschikistan",
    TJ: "Tadschikistan",
    UZ: "Usbekistan",
    UZBEKISTAN: "Usbekistan",
    USBEKISTAN: "Usbekistan",
    SY: "Syrien",
    SYRIA: "Syrien",
    SYRIANARABREPUBLIC: "Syrien",
    SYRIEN: "Syrien",
};

const optionalCountries = new Set(["Syrien"]);

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
    const destinationCountry = getEndUseDeclarationDestinationCountry(country);
    return destinationCountry !== null && !optionalCountries.has(destinationCountry);
}

export function canGenerateEndUseDeclaration(
    country: string | null | undefined,
): boolean {
    return getEndUseDeclarationDestinationCountry(country) !== null;
}

export function isEndUseDeclarationOptional(
    country: string | null | undefined,
): boolean {
    const destinationCountry = getEndUseDeclarationDestinationCountry(country);
    return destinationCountry !== null && optionalCountries.has(destinationCountry);
}
