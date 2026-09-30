import { EuTransitTimePolicy } from "@/src/modules/documents/domain/policies/eu-transit-time-policy";

export type DateSuggestionDocumentType =
    | "handover_protocol"
    | "entry_certificate"
    | "transport_proof"
    | "end_use_declaration";

export type DocumentDateSuggestion = {
    suggestedDate: string | null;
    usedDate: string | null;
    sourceDate: string | null;
    calculationType: "invoice_date" | "eu_calendar_transit" | "manual_required";
    transitDays: number | null;
    countryCode: string | null;
    countryName: string | null;
    isOverridden: boolean;
    explanation: string;
};

function addCalendarDays(dateOnly: string, days: number): string {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
}

export class DocumentDatePolicy {
    constructor(private readonly transitTimePolicy = new EuTransitTimePolicy()) {}

    suggest(params: {
        documentType: DateSuggestionDocumentType;
        invoiceDate: string | null | undefined;
        saleDate: string | null | undefined;
        transportStartDate?: string | null;
        destinationCountry?: string | null;
        overrideDate?: string | null;
    }): DocumentDateSuggestion {
        if (
            params.documentType === "handover_protocol" ||
            params.documentType === "end_use_declaration"
        ) {
            const sourceDate = params.invoiceDate ?? params.saleDate ?? null;

            return this.buildSuggestion({
                suggestedDate: sourceDate,
                sourceDate,
                calculationType: "invoice_date",
                transitDays: null,
                countryCode: null,
                countryName: null,
                overrideDate: params.overrideDate,
                explanation:
                    params.documentType === "handover_protocol"
                        ? sourceDate
                            ? "Übergabebestätigung: Rechnungs- bzw. Verkaufsdatum."
                            : "Für die Übergabebestätigung fehlt das Rechnungs- bzw. Verkaufsdatum."
                        : sourceDate
                            ? "Endverbleibserklärung: Rechnungs- bzw. Verkaufsdatum."
                            : "Für die Endverbleibserklärung fehlt das Rechnungs- bzw. Verkaufsdatum.",
            });
        }

        const sourceDate =
            params.transportStartDate ?? params.invoiceDate ?? params.saleDate ?? null;
        const transitTime = this.transitTimePolicy.getTransitTime(
            params.destinationCountry,
        );

        if (!sourceDate || !transitTime) {
            return this.buildSuggestion({
                suggestedDate: null,
                sourceDate,
                calculationType: "manual_required",
                transitDays: null,
                countryCode: transitTime?.countryCode ?? null,
                countryName: transitTime?.countryName ?? null,
                overrideDate: params.overrideDate,
                explanation:
                    "Für dieses Zielland konnte keine EU-Standardlaufzeit ermittelt werden. Bitte Datum manuell setzen.",
            });
        }

        const suggestedDate = addCalendarDays(sourceDate, transitTime.calendarDays);

        return this.buildSuggestion({
            suggestedDate,
            sourceDate,
            calculationType: "eu_calendar_transit",
            transitDays: transitTime.calendarDays,
            countryCode: transitTime.countryCode,
            countryName: transitTime.countryName,
            overrideDate: params.overrideDate,
            explanation: `Vorgeschlagenes Ankunftsdatum: Ausgangsdatum + ${transitTime.calendarDays} Kalendertage für ${transitTime.countryName}.`,
        });
    }

    private buildSuggestion(params: {
        suggestedDate: string | null;
        sourceDate: string | null;
        calculationType: DocumentDateSuggestion["calculationType"];
        transitDays: number | null;
        countryCode: string | null;
        countryName: string | null;
        overrideDate?: string | null;
        explanation: string;
    }): DocumentDateSuggestion {
        const normalizedOverride = params.overrideDate?.trim() || null;

        return {
            suggestedDate: params.suggestedDate,
            usedDate: normalizedOverride ?? params.suggestedDate,
            sourceDate: params.sourceDate,
            calculationType: params.calculationType,
            transitDays: params.transitDays,
            countryCode: params.countryCode,
            countryName: params.countryName,
            isOverridden: Boolean(
                normalizedOverride && normalizedOverride !== params.suggestedDate,
            ),
            explanation: params.explanation,
        };
    }
}
