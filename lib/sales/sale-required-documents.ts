import type { SaleType } from "@/lib/sales/sale-queries";
import { VatVerificationRequirementPolicy } from "@/src/modules/documents/domain/policies/vat-verification-requirement-policy";

export type RequiredDocumentDefinition = {
    documentType: string;
    label: string;
    acceptedDocumentTypes?: string[];
    uploadOptions?: {
        documentType: string;
        label: string;
    }[];
    helperText?: string;
};

export type SaleDocumentInput = {
    document_type: string;
    status: "available" | "missing" | "needs_review";
    source?: string | null;
};

const BASE_REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
    {
        documentType: "handover_protocol",
        label: "Übergabeprotokoll / Übergabebestätigung",
    },
    {
        documentType: "owner_id",
        label: "Ausweis vom Inhaber / Käufer",
    },
];

const INLAND_REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
    {
        documentType: "commercial_register",
        label: "Handelsregisterauszug oder Gewerbeschein",
        acceptedDocumentTypes: ["commercial_register", "business_registration"],
        uploadOptions: [
            {
                documentType: "commercial_register",
                label: "Handelsregisterauszug",
            },
            {
                documentType: "business_registration",
                label: "Gewerbeschein",
            },
        ],
        helperText: "Eines von beiden ist erforderlich.",
    },
];

const EU_REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
    {
        documentType: "entry_certificate",
        label: "Gelangensbestätigung",
    },
    {
        documentType: "transport_proof",
        label: "Verbringungsnachweis",
    },
];

const EU_COMPANY_VAT_REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
    {
        documentType: "bzst_vat_verification_primary",
        label: "BZSt-Prüfnachweis – Ergebnisübersicht",
        helperText: "Erster Screenshot der manuellen USt-ID-Prüfung.",
    },
    {
        documentType: "bzst_vat_verification_secondary",
        label: "BZSt-Prüfnachweis – qualifizierte Bestätigung",
        helperText: "Zweiter Screenshot der qualifizierten BZSt-Bestätigung.",
    },
];

const THIRD_COUNTRY_REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
    {
        documentType: "customs",
        label: "Zolldokument / Ausfuhrnachweis / Ausgangsvermerk",
    },
];

export function getRequiredDocumentsForSale({
                                                saleType,
                                                isCompanyCustomer,
                                            }: {
    saleType: SaleType;
    isCompanyCustomer: boolean;
}): RequiredDocumentDefinition[] {
    void isCompanyCustomer;

    if (saleType === "export_third_country") {
        return [...THIRD_COUNTRY_REQUIRED_DOCUMENTS];
    }

    const requiredDocuments = [...BASE_REQUIRED_DOCUMENTS];

    if (saleType === "inland") {
        requiredDocuments.push(...INLAND_REQUIRED_DOCUMENTS);
    }

    if (saleType === "eu") {
        requiredDocuments.push(...EU_REQUIRED_DOCUMENTS);
    }

    if (
        new VatVerificationRequirementPolicy().isRequired({
            saleType,
            buyerType: isCompanyCustomer ? "company" : "private",
        })
    ) {
        requiredDocuments.push(...EU_COMPANY_VAT_REQUIRED_DOCUMENTS);
    }

    return requiredDocuments;
}

export function evaluateRequiredDocuments({
                                              requiredDocuments,
                                              documents,
                                          }: {
    requiredDocuments: RequiredDocumentDefinition[];
    documents: SaleDocumentInput[];
}) {
    const availableDocumentTypes = new Set(
        documents
            .filter(
                (document) =>
                    document.status === "available" ||
                    (document.status === "needs_review" && document.source === "generated"),
            )
            .map((document) => document.document_type),
    );

    const missingDocuments = requiredDocuments.filter(
        (requiredDocument) => {
            const acceptedDocumentTypes =
                requiredDocument.acceptedDocumentTypes ?? [
                    requiredDocument.documentType,
                ];

            return !acceptedDocumentTypes.some((documentType) =>
                availableDocumentTypes.has(documentType),
            );
        },
    );

    return {
        requiredCount: requiredDocuments.length,
        availableCount: requiredDocuments.length - missingDocuments.length,
        missingCount: missingDocuments.length,
        missingLabels: missingDocuments.map((document) => document.label),
        isComplete: missingDocuments.length === 0,
    };
}
