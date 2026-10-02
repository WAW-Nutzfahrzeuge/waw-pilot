export const EMAIL_LANGUAGE_OPTIONS = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "Englisch" },
    { value: "sq", label: "Albanisch" },
    { value: "ar", label: "Arabisch" },
    { value: "be", label: "Belarussisch" },
    { value: "bs", label: "Bosnisch" },
    { value: "bg", label: "Bulgarisch" },
    { value: "ca", label: "Katalanisch" },
    { value: "hr", label: "Kroatisch" },
    { value: "da", label: "Dänisch" },
    { value: "et", label: "Estnisch" },
    { value: "fi", label: "Finnisch" },
    { value: "fr", label: "Französisch" },
    { value: "el", label: "Griechisch" },
    { value: "ga", label: "Irisch" },
    { value: "is", label: "Isländisch" },
    { value: "it", label: "Italienisch" },
    { value: "lv", label: "Lettisch" },
    { value: "lt", label: "Litauisch" },
    { value: "lb", label: "Luxemburgisch" },
    { value: "mk", label: "Mazedonisch" },
    { value: "mt", label: "Maltesisch" },
    { value: "nl", label: "Niederländisch" },
    { value: "no", label: "Norwegisch" },
    { value: "pl", label: "Polnisch" },
    { value: "pt", label: "Portugiesisch" },
    { value: "ro", label: "Rumänisch" },
    { value: "ru", label: "Russisch" },
    { value: "sr", label: "Serbisch" },
    { value: "sk", label: "Slowakisch" },
    { value: "sl", label: "Slowenisch" },
    { value: "es", label: "Spanisch" },
    { value: "sv", label: "Schwedisch" },
    { value: "cs", label: "Tschechisch" },
    { value: "tr", label: "Türkisch" },
    { value: "uk", label: "Ukrainisch" },
    { value: "hu", label: "Ungarisch" },
] as const;

export type EmailLanguage = (typeof EMAIL_LANGUAGE_OPTIONS)[number]["value"];

const EMAIL_LANGUAGE_VALUES = new Set<string>(
    EMAIL_LANGUAGE_OPTIONS.map((option) => option.value),
);

export function normalizeEmailLanguage(
    language: string | null | undefined,
    fallback: EmailLanguage = "de",
): EmailLanguage {
    if (language && EMAIL_LANGUAGE_VALUES.has(language)) {
        return language as EmailLanguage;
    }

    return fallback;
}

export function getEmailLanguageLabel(
    language: string | null | undefined,
): string {
    const normalizedLanguage = normalizeEmailLanguage(language);

    return (
        EMAIL_LANGUAGE_OPTIONS.find((option) => option.value === normalizedLanguage)
            ?.label ?? "Deutsch"
    );
}

const COUNTRY_EMAIL_LANGUAGES: Partial<Record<string, EmailLanguage>> = {
    AL: "sq",
    AD: "ca",
    AT: "de",
    BA: "bs",
    BE: "nl",
    BG: "bg",
    BY: "be",
    CH: "de",
    CY: "el",
    CZ: "cs",
    DE: "de",
    DK: "da",
    EE: "et",
    ES: "es",
    FI: "fi",
    FR: "fr",
    GB: "en",
    GR: "el",
    HR: "hr",
    HU: "hu",
    IE: "ga",
    IS: "is",
    IT: "it",
    LI: "de",
    LT: "lt",
    LU: "lb",
    LV: "lv",
    MC: "fr",
    MD: "ro",
    ME: "sr",
    MK: "mk",
    MT: "mt",
    NL: "nl",
    NO: "no",
    PL: "pl",
    PT: "pt",
    RO: "ro",
    RS: "sr",
    RU: "ru",
    SE: "sv",
    SI: "sl",
    SK: "sk",
    SM: "it",
    TR: "tr",
    UA: "uk",
    VA: "it",
    XK: "sq",
    // French is the principal business language in these countries.
    BF: "fr",
    BJ: "fr",
    CD: "fr",
    CF: "fr",
    CG: "fr",
    CI: "fr",
    DJ: "fr",
    GA: "fr",
    GN: "fr",
    MG: "fr",
    ML: "fr",
    NE: "fr",
    RW: "fr",
    SN: "fr",
    TG: "fr",
    // Portuguese is the principal business language in these countries.
    AO: "pt",
    BR: "pt",
    CV: "pt",
    GW: "pt",
    MZ: "pt",
    ST: "pt",
    TL: "pt",
    // Spanish is the principal business language in these countries.
    AR: "es",
    BO: "es",
    CL: "es",
    CO: "es",
    CR: "es",
    CU: "es",
    DO: "es",
    EC: "es",
    GQ: "es",
    GT: "es",
    HN: "es",
    MX: "es",
    NI: "es",
    PA: "es",
    PE: "es",
    PR: "es",
    PY: "es",
    SV: "es",
    UY: "es",
    VE: "es",
    // Arabic is the principal business language in these countries.
    AE: "ar",
    BH: "ar",
    DZ: "ar",
    EG: "ar",
    IQ: "ar",
    JO: "ar",
    KW: "ar",
    LB: "ar",
    LY: "ar",
    MA: "ar",
    OM: "ar",
    PS: "ar",
    QA: "ar",
    SA: "ar",
    SY: "ar",
    TN: "ar",
    YE: "ar",
};

/**
 * Returns the appropriate supported mail language for a selected customer country.
 * Countries without a supported local-language template deliberately fall back to English.
 */
export function getEmailLanguageForCountry({
    countryCode,
    country,
}: {
    countryCode?: string | null;
    country?: string | null;
}): EmailLanguage {
    const normalizedCountryCode =
        countryCode?.trim().toUpperCase() ?? getCustomerCountryCode(country);

    if (!normalizedCountryCode) return "en";

    return COUNTRY_EMAIL_LANGUAGES[normalizedCountryCode] ?? "en";
}

export function getSuggestedEmailLanguage({
                                              countryCode,
                                              country,
                                              preferredLanguage,
                                              selectedLanguage,
                                          }: {
    countryCode?: string | null;
    country?: string | null;
    preferredLanguage?: string | null;
    selectedLanguage?: string | null;
}): EmailLanguage {
    if (selectedLanguage && EMAIL_LANGUAGE_VALUES.has(selectedLanguage)) {
        return selectedLanguage as EmailLanguage;
    }

    if (preferredLanguage && EMAIL_LANGUAGE_VALUES.has(preferredLanguage)) {
        return preferredLanguage as EmailLanguage;
    }

    return getEmailLanguageForCountry({ countryCode, country });
}
import { getCustomerCountryCode } from "@/lib/countries/country-options";
