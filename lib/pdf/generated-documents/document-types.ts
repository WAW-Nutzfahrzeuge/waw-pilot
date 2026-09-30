export type GeneratedDocumentContext =
    | "sale"
    | "purchase"
    | "license_plate"
    | "internal";

export type GeneratedDocumentType =
    | "invoice_pdf"
    | "proforma_invoice"
    | "handover_protocol"
    | "entry_certificate"
    | "transport_proof"
    | "end_use_declaration"
    | "license_plate_consent"
    | "travel_expense_form"
    | "purchase_contract"
    | "sales_contract"
    | "abd_checklist"
    | "exit_note_checklist";

export type GeneratedDocumentStatus =
    | "missing_data"
    | "can_generate"
    | "generated_needs_signature"
    | "generated_available"
    | "sent_to_customer"
    | "signed_received"
    | "external_process"
    | "generator_planned"
    | "not_relevant";

export type GeneratedDocumentDefinition = {
    type: GeneratedDocumentType;
    documentType: string;
    label: string;
    context: GeneratedDocumentContext;
    requiresSignature: boolean;
    description: string;
};

export const generatedDocumentDefinitions: GeneratedDocumentDefinition[] = [
    {
        type: "invoice_pdf",
        documentType: "invoice_pdf",
        label: "Rechnung",
        context: "sale",
        requiresSignature: false,
        description:
            "Rechnung mit Kundendaten, Fahrzeugdaten, Preisen, Bankdaten und Steuerhinweisen.",
    },
    {
        type: "proforma_invoice",
        documentType: "proforma_invoice",
        label: "Proforma-Rechnung",
        context: "sale",
        requiresSignature: false,
        description:
            "Proforma- bzw. Anzahlungsrechnung für Verkauf oder Vorauszahlung.",
    },
    {
        type: "handover_protocol",
        documentType: "handover_protocol",
        label: "Übergabeprotokoll",
        context: "sale",
        requiresSignature: true,
        description:
            "Übergabedokument für Fahrzeug, Fahrzeugpapiere, Schlüssel und Zubehör.",
    },
    {
        type: "entry_certificate",
        documentType: "entry_certificate",
        label: "Gelangensbestätigung",
        context: "sale",
        requiresSignature: true,
        description:
            "Bestätigung über das Gelangen des Fahrzeugs in einen anderen EU-Mitgliedstaat.",
    },
    {
        type: "transport_proof",
        documentType: "transport_proof",
        label: "Verbringungsnachweis",
        context: "sale",
        requiresSignature: true,
        description:
            "Nachweis und Empfangsbestätigung zur Verbringung in das übrige Gemeinschaftsgebiet.",
    },
    {
        type: "end_use_declaration",
        documentType: "end_use_declaration",
        label: "Endverbleibserklärung",
        context: "sale",
        requiresSignature: true,
        description:
            "Erklärung zum Endverbleib für Verkäufe nach Russland, Kasachstan, Kirgisistan, Tadschikistan oder Syrien.",
    },
    {
        type: "license_plate_consent",
        documentType: "license_plate_document",
        label: "Einverständniserklärung Kennzeichen",
        context: "license_plate",
        requiresSignature: true,
        description:
            "Einverständniserklärung zur Nutzung von Kurzzeit- und Ausfuhrkennzeichen.",
    },
    {
        type: "travel_expense_form",
        documentType: "travel_expense_form",
        label: "Reisekostenformular",
        context: "internal",
        requiresSignature: true,
        description:
            "Formular zur Dokumentation von Kundenfahrten, Händlerfahrten und Servicefahrten.",
    },
    {
        type: "purchase_contract",
        documentType: "purchase_contract",
        label: "Ankaufsvertrag",
        context: "purchase",
        requiresSignature: true,
        description:
            "Vertrag für den Ankauf eines Fahrzeugs vom Verkäufer.",
    },
    {
        type: "sales_contract",
        documentType: "contract",
        label: "Kaufvertrag",
        context: "sale",
        requiresSignature: true,
        description:
            "Kaufvertrag für den Fahrzeugverkauf.",
    },
    {
        type: "abd_checklist",
        documentType: "abd_checklist",
        label: "ABD-Checkliste",
        context: "sale",
        requiresSignature: false,
        description:
            "Interne Checkliste für Ausfuhrbegleitdokumente.",
    },
    {
        type: "exit_note_checklist",
        documentType: "exit_note_checklist",
        label: "Ausgangsvermerk-Checkliste",
        context: "sale",
        requiresSignature: false,
        description:
            "Interne Checkliste zur Prüfung des Ausgangsvermerks.",
    },
];

export function getGeneratedDocumentDefinition(
    type: GeneratedDocumentType,
): GeneratedDocumentDefinition {
    const definition = generatedDocumentDefinitions.find(
        (item) => item.type === type,
    );

    if (!definition) {
        throw new Error(`Unbekannter Dokumenttyp: ${type}`);
    }

    return definition;
}

export function getGeneratedDocumentsByContext(
    context: GeneratedDocumentContext,
): GeneratedDocumentDefinition[] {
    return generatedDocumentDefinitions.filter(
        (definition) => definition.context === context,
    );
}

export const supportedSaleGeneratedDocumentTypes = [
    "handover_protocol",
    "entry_certificate",
    "transport_proof",
    "end_use_declaration",
] as const satisfies readonly GeneratedDocumentType[];

export type SupportedSaleGeneratedDocumentType =
    (typeof supportedSaleGeneratedDocumentTypes)[number];

export function isSupportedSaleGeneratedDocumentType(
    type: GeneratedDocumentType,
): type is SupportedSaleGeneratedDocumentType {
    return supportedSaleGeneratedDocumentTypes.includes(
        type as SupportedSaleGeneratedDocumentType,
    );
}
