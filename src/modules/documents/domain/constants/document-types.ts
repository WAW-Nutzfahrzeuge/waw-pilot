export type DocumentTypeCode =
    | "invoice"
    | "invoice_pdf"
    | "zugferd_invoice"
    | "purchase_invoice"
    | "purchase_contract"
    | "purchase_receipt"
    | "purchase_payment_proof"
    | "seller_id"
    | "seller_commercial_register"
    | "proforma_invoice"
    | "down_payment_invoice"
    | "cancellation_invoice"
    | "credit_note"
    | "vehicle_registration"
    | "contract"
    | "handover_protocol"
    | "entry_certificate"
    | "transport_proof"
    | "bzst_vat_verification_primary"
    | "bzst_vat_verification_secondary"
    | "abd_checklist"
    | "exit_note_checklist"
    | "commercial_register"
    | "business_registration"
    | "owner_id"
    | "customer_id"
    | "tax_number_document"
    | "customs"
    | "cashbook_receipt"
    | "license_plate_document"
    | "license_plate_consent"
    | "license_plate_insurance"
    | "license_plate_power_of_attorney"
    | "license_plate_registration"
    | "travel_expense_form"
    | "export_documents"
    | "registration_documents"
    | "insurance_document"
    | "tax_document"
    | "accounting_receipt"
    | "other";

export type DocumentRelationType =
    | "VEHICLE"
    | "SALE"
    | "PURCHASE"
    | "CUSTOMER"
    | "PARTNER"
    | "INVOICE"
    | "PAYMENT"
    | "FINANCIAL_ENTRY"
    | "EXPORT_BATCH"
    | "LICENSE_PLATE_CASE";

export type DocumentBadgeTone = "success" | "warning" | "error" | "info" | "neutral";

export type DocumentTypeDefinition = {
    code: DocumentTypeCode;
    label: string;
    description: string;
    allowedMimeTypes: readonly string[];
    maxFileSizeBytes: number;
    canBeRequired: boolean;
    replacementAllowed: boolean;
    archiveAllowed: boolean;
    allowedRelations: readonly DocumentRelationType[];
    sortOrder: number;
    badgeTone: DocumentBadgeTone;
    defaultStatus: "ACTIVE" | "REVIEW_REQUIRED";
};

const commonDocumentMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
] as const;

const vehicleDocumentMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
] as const;

const maxGeneralDocumentSizeBytes = 5 * 1024 * 1024;

function defineDocumentType(
    definition: Omit<DocumentTypeDefinition, "allowedMimeTypes" | "maxFileSizeBytes" | "description"> & {
        description?: string;
        allowedMimeTypes?: readonly string[];
        maxFileSizeBytes?: number;
    },
): DocumentTypeDefinition {
    return {
        description: definition.description ?? definition.label,
        allowedMimeTypes: definition.allowedMimeTypes ?? commonDocumentMimeTypes,
        maxFileSizeBytes: definition.maxFileSizeBytes ?? maxGeneralDocumentSizeBytes,
        ...definition,
    };
}

export const documentTypeDefinitions: readonly DocumentTypeDefinition[] = [
    defineDocumentType({
        code: "invoice",
        label: "Rechnung",
        canBeRequired: false,
        replacementAllowed: false,
        archiveAllowed: true,
        allowedRelations: ["INVOICE", "SALE", "CUSTOMER", "VEHICLE", "FINANCIAL_ENTRY"],
        sortOrder: 10,
        badgeTone: "info",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "invoice_pdf",
        label: "Rechnungs-PDF",
        canBeRequired: false,
        replacementAllowed: false,
        archiveAllowed: true,
        allowedRelations: ["INVOICE", "SALE", "CUSTOMER", "VEHICLE", "FINANCIAL_ENTRY"],
        sortOrder: 11,
        badgeTone: "info",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "zugferd_invoice",
        label: "E-Rechnung (ZUGFeRD)",
        canBeRequired: false,
        replacementAllowed: false,
        archiveAllowed: true,
        allowedRelations: ["INVOICE", "SALE", "CUSTOMER", "VEHICLE"],
        sortOrder: 12,
        badgeTone: "info",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "proforma_invoice",
        label: "Proforma-Rechnung",
        canBeRequired: false,
        replacementAllowed: false,
        archiveAllowed: true,
        allowedRelations: ["INVOICE", "SALE", "CUSTOMER", "VEHICLE"],
        sortOrder: 13,
        badgeTone: "info",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "cancellation_invoice",
        label: "Stornorechnung",
        canBeRequired: false,
        replacementAllowed: false,
        archiveAllowed: true,
        allowedRelations: ["INVOICE", "SALE", "CUSTOMER", "VEHICLE", "FINANCIAL_ENTRY"],
        sortOrder: 14,
        badgeTone: "error",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "credit_note",
        label: "Gutschrift",
        canBeRequired: false,
        replacementAllowed: false,
        archiveAllowed: true,
        allowedRelations: ["INVOICE", "SALE", "CUSTOMER", "VEHICLE", "FINANCIAL_ENTRY"],
        sortOrder: 15,
        badgeTone: "warning",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "purchase_invoice",
        label: "Einkaufsrechnung",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["PURCHASE", "VEHICLE", "PARTNER", "FINANCIAL_ENTRY"],
        sortOrder: 30,
        badgeTone: "warning",
        defaultStatus: "ACTIVE",
        allowedMimeTypes: vehicleDocumentMimeTypes,
    }),
    defineDocumentType({
        code: "vehicle_registration",
        label: "Fahrzeugschein",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["VEHICLE", "PURCHASE"],
        sortOrder: 40,
        badgeTone: "neutral",
        defaultStatus: "ACTIVE",
        allowedMimeTypes: vehicleDocumentMimeTypes,
    }),
    defineDocumentType({
        code: "handover_protocol",
        label: "Übergabeprotokoll",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["SALE", "VEHICLE", "CUSTOMER"],
        sortOrder: 50,
        badgeTone: "success",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "entry_certificate",
        label: "Gelangensbestätigung",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["SALE", "VEHICLE", "CUSTOMER"],
        sortOrder: 51,
        badgeTone: "success",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "transport_proof",
        label: "Verbringungsnachweis",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["SALE", "VEHICLE", "CUSTOMER"],
        sortOrder: 52,
        badgeTone: "success",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "customs",
        label: "Zolldokument / Ausfuhrnachweis / Ausgangsvermerk",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["SALE", "VEHICLE", "CUSTOMER"],
        sortOrder: 55,
        badgeTone: "warning",
        defaultStatus: "REVIEW_REQUIRED",
    }),
    defineDocumentType({
        code: "bzst_vat_verification_primary",
        label: "BZSt-Prüfnachweis – Ergebnisübersicht",
        description:
            "Screenshot oder PDF der manuellen BZSt-Prüfung mit Ergebnisübersicht.",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["SALE", "CUSTOMER"],
        sortOrder: 53,
        badgeTone: "warning",
        defaultStatus: "REVIEW_REQUIRED",
        maxFileSizeBytes: 10 * 1024 * 1024,
    }),
    defineDocumentType({
        code: "bzst_vat_verification_secondary",
        label: "BZSt-Prüfnachweis – qualifizierte Bestätigung",
        description:
            "Screenshot oder PDF der qualifizierten manuellen BZSt-Bestätigung.",
        canBeRequired: true,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["SALE", "CUSTOMER"],
        sortOrder: 54,
        badgeTone: "warning",
        defaultStatus: "REVIEW_REQUIRED",
        maxFileSizeBytes: 10 * 1024 * 1024,
    }),
    defineDocumentType({
        code: "cashbook_receipt",
        label: "Kassenbuch-Beleg",
        canBeRequired: false,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["FINANCIAL_ENTRY", "PAYMENT", "SALE", "PURCHASE"],
        sortOrder: 70,
        badgeTone: "success",
        defaultStatus: "ACTIVE",
    }),
    defineDocumentType({
        code: "other",
        label: "Sonstiges Dokument",
        canBeRequired: false,
        replacementAllowed: true,
        archiveAllowed: true,
        allowedRelations: ["VEHICLE", "SALE", "PURCHASE", "CUSTOMER", "INVOICE", "PAYMENT", "FINANCIAL_ENTRY"],
        sortOrder: 999,
        badgeTone: "neutral",
        defaultStatus: "ACTIVE",
    }),
];

const fallbackDefinitions = new Set<DocumentTypeCode>(
    documentTypeDefinitions.map((definition) => definition.code),
);

export function normalizeDocumentTypeCode(value: string): DocumentTypeCode {
    return fallbackDefinitions.has(value as DocumentTypeCode)
        ? (value as DocumentTypeCode)
        : "other";
}

export function getDocumentTypeDefinition(value: string): DocumentTypeDefinition {
    const normalizedCode = normalizeDocumentTypeCode(value);

    return (
        documentTypeDefinitions.find((definition) => definition.code === normalizedCode) ??
        documentTypeDefinitions[documentTypeDefinitions.length - 1]
    );
}
