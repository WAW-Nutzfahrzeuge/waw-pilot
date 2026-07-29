const englishSectionSeparator = "----------------------------\n\nEnglish version";

export function composeBilingualEmailText({
    language,
    localizedText,
    englishText,
}: {
    language: string | null | undefined;
    localizedText: string;
    englishText: string;
}): string {
    if (language !== "de") {
        return localizedText;
    }

    return `${localizedText}\n\n${englishSectionSeparator}\n\n${englishText}`;
}
