export type CountryOption = {
    value: string;
    label: string;
    keywords: string[];
};

const COUNTRY_CODES = `
AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW XK
`
    .trim()
    .split(/\s+/);

const germanCountryNames = new Intl.DisplayNames(["de"], { type: "region" });
const englishCountryNames = new Intl.DisplayNames(["en"], { type: "region" });

const additionalKeywords: Record<string, string[]> = {
    DE: ["Germany", "Federal Republic of Germany"],
    KZ: ["Kasachstan", "Kazakhstan"],
    KG: ["Kyrgyzstan", "Kirghizia", "Kirgistan"],
    RU: ["Russia", "Russian Federation", "Russische Föderation"],
    SY: ["Syria", "Syrian Arab Republic", "Syrien"],
    TJ: ["Tajikistan", "Tadschikistan"],
    TR: ["Türkiye", "Turkey"],
    AE: ["Dubai", "United Arab Emirates"],
};

export const COUNTRY_OPTIONS: CountryOption[] = COUNTRY_CODES.map((code) => {
    const label = germanCountryNames.of(code) ?? code;
    const englishName = englishCountryNames.of(code) ?? code;

    return {
        value: label,
        label,
        keywords: [code, englishName, ...(additionalKeywords[code] ?? [])],
    };
}).sort((first, second) => first.label.localeCompare(second.label, "de"));

const countryByNormalizedName = new Map<string, string>();
const countryCodeByNormalizedName = new Map<string, string>();

for (const country of COUNTRY_OPTIONS) {
    for (const name of [country.value, ...country.keywords]) {
        countryByNormalizedName.set(normalizeCountrySearchValue(name), country.value);
        countryCodeByNormalizedName.set(normalizeCountrySearchValue(name), country.keywords[0]);
    }
}

/**
 * Converts a selected country (or an ISO code / known legacy alias) to the
 * canonical German name persisted for customers. Unknown free text is rejected.
 */
export function normalizeCustomerCountry(value: string | null | undefined): string | null {
    const normalizedValue = normalizeCountrySearchValue(value ?? "");

    if (!normalizedValue) return null;

    return countryByNormalizedName.get(normalizedValue) ?? null;
}

/** Resolves a country selection or legacy country name to its ISO 3166-1 alpha-2 code. */
export function getCustomerCountryCode(value: string | null | undefined): string | null {
    const normalizedValue = normalizeCountrySearchValue(value ?? "");

    if (!normalizedValue) return null;

    return countryCodeByNormalizedName.get(normalizedValue) ?? null;
}

function normalizeCountrySearchValue(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase("de")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]/g, "");
}
