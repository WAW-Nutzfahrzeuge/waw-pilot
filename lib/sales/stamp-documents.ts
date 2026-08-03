import type { EmailLanguage } from "@/lib/customers/email-languages";
import { composeBilingualEmailText } from "@/lib/email/bilingual-email";
import type { SaleType } from "@/lib/sales/sale-queries";

export const STAMP_DOCUMENT_TYPES = [
    {
        key: "transport_proof",
        label: "Verbringungsnachweis",
        acceptedDocumentTypes: ["transport_proof", "transfer_receipt"],
        filePatterns: [/verbringungsnachweis/i, /transport[_\s-]?proof/i],
    },
    {
        key: "entry_certificate",
        label: "Gelangensbestätigung",
        acceptedDocumentTypes: ["entry_certificate", "confirmation_of_arrival"],
        filePatterns: [/gelangensbestaetigung/i, /gelangensbestätigung/i, /entry[_\s-]?certificate/i],
    },
    {
        key: "handover_protocol",
        label: "Übergabebestätigung",
        acceptedDocumentTypes: [
            "handover_protocol",
            "handover_confirmation",
            "handover_certificate",
        ],
        filePatterns: [/uebergabe/i, /übergabe/i, /handover/i],
    },
] as const;

export type StampDocumentKey = (typeof STAMP_DOCUMENT_TYPES)[number]["key"];

const STAMP_DOCUMENT_KEYS_BY_SALE_TYPE: Record<SaleType, readonly StampDocumentKey[]> = {
    inland: ["handover_protocol"],
    eu: ["entry_certificate", "transport_proof", "handover_protocol"],
    export_third_country: [],
};

export function getStampDocumentKeysForSaleType(
    saleType: SaleType,
): readonly StampDocumentKey[] {
    return STAMP_DOCUMENT_KEYS_BY_SALE_TYPE[saleType];
}

export type StampDocumentCandidate = {
    id: string;
    document_type: string;
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size?: number | null;
    status?: string | null;
};

export function getStampDocumentType(
    document: Pick<StampDocumentCandidate, "document_type" | "file_name">,
): (typeof STAMP_DOCUMENT_TYPES)[number] | null {
    return (
        STAMP_DOCUMENT_TYPES.find(
            (definition) =>
                (definition.acceptedDocumentTypes as readonly string[]).includes(
                    document.document_type,
                ) ||
                definition.filePatterns.some((pattern) => pattern.test(document.file_name)),
        ) ?? null
    );
}

export function getAvailableStampDocuments(
    documents: StampDocumentCandidate[],
    saleType: SaleType = "eu",
): Array<StampDocumentCandidate & { stampKey: StampDocumentKey; label: string }> {
    const usedKeys = new Set<StampDocumentKey>();
    const allowedKeys = new Set(getStampDocumentKeysForSaleType(saleType));
    const result: Array<StampDocumentCandidate & { stampKey: StampDocumentKey; label: string }> = [];

    for (const document of documents) {
        const definition = getStampDocumentType(document);

        if (!definition || !allowedKeys.has(definition.key) || usedKeys.has(definition.key)) continue;
        if (!document.file_path || document.status === "missing") continue;

        usedKeys.add(definition.key);
        result.push({
            ...document,
            stampKey: definition.key,
            label: definition.label,
        });
    }

    return result;
}

export function getMissingStampDocumentLabels(
    documents: StampDocumentCandidate[],
    saleType: SaleType = "eu",
): string[] {
    const availableKeys = new Set(
        getAvailableStampDocuments(documents, saleType).map((document) => document.stampKey),
    );

    return STAMP_DOCUMENT_TYPES.filter(
        (definition) =>
            getStampDocumentKeysForSaleType(saleType).includes(definition.key) &&
            !availableKeys.has(definition.key),
    ).map((definition) => definition.label);
}

export function getStampDocumentsEmailTemplate({
                                                   language,
                                                   customerName,
                                                   vehicleLabel,
                                                   documentLabels,
                                               }: {
    language: EmailLanguage;
    customerName: string;
    vehicleLabel: string;
    documentLabels: string[];
}) {
    const documentList = documentLabels.map((label) => `- ${label}`).join("\n");

    if (language === "pl") {
        const subject = `Dokumenty do podpisu i opieczętowania - pojazd ${vehicleLabel}`;
        const text = `Dzień dobry ${customerName},

w załączniku przesyłamy dokumenty dotyczące pojazdu ${vehicleLabel}.

Prosimy o sprawdzenie załączonych dokumentów, podpisanie oraz opieczętowanie ich w wyznaczonych miejscach, a następnie odesłanie kompletnych dokumentów e-mailem.

Załączone dokumenty:
${documentList}

        Dziękujemy.

Z poważaniem
W.A.W Nutzfahrzeuge`;

        return {
            subject,
            text: composeBilingualEmailText({
                language,
                localizedText: text,
                englishText: getEnglishStampDocumentsEmailText({
                    customerName,
                    vehicleLabel,
                    documentList,
                }),
            }),
        };
    }

    if (language === "bg") {
        const subject = `Документи за подпис и печат - превозно средство ${vehicleLabel}`;
        const text = `Здравейте ${customerName},

в прикачения файл изпращаме документите за вашето превозно средство ${vehicleLabel}.

Моля, проверете приложените документи, подпишете и подпечатайте ги на посочените места и ни върнете попълнените документи по имейл.

Приложени документи:
${documentList}

Благодарим Ви.

С уважение
W.A.W Nutzfahrzeuge`;

        return {
            subject,
            text: composeBilingualEmailText({
                language,
                localizedText: text,
                englishText: getEnglishStampDocumentsEmailText({
                    customerName,
                    vehicleLabel,
                    documentList,
                }),
            }),
        };
    }

    const englishSubject = `Documents for signature and stamp - Vehicle ${vehicleLabel}`;
    const englishText = getEnglishStampDocumentsEmailText({
        customerName,
        vehicleLabel,
        documentList,
    });

    if (language === "en") {
        return { subject: englishSubject, text: englishText };
    }

    const subject = `Dokumente zum Unterschreiben und Stempeln - Fahrzeug ${vehicleLabel}`;
    const germanText = `Guten Tag ${customerName},

anbei erhalten Sie die Unterlagen zu Ihrem Fahrzeug ${vehicleLabel}.

Bitte prüfen Sie die beigefügten Dokumente, unterschreiben beziehungsweise stempeln Sie diese an den vorgesehenen Stellen und senden Sie uns die vollständig ausgefüllten Unterlagen anschließend per E-Mail zurück.

Folgende Dokumente sind beigefügt:
${documentList}

Vielen Dank.

Mit freundlichen Grüßen
W.A.W Nutzfahrzeuge`;
    const text = composeBilingualEmailText({
        language,
        localizedText: germanText,
        englishText,
    });

    return { subject, text };
}

function getEnglishStampDocumentsEmailText({
                                                    customerName,
                                                    vehicleLabel,
                                                    documentList,
                                                }: {
    customerName: string;
    vehicleLabel: string;
    documentList: string;
}): string {
    return `Hello ${customerName},

please find attached the documents relating to your vehicle ${vehicleLabel}.

Please review the attached documents, sign and stamp them where indicated, and return the completed documents to us by email.

Attached documents:
${documentList}

Thank you.

Kind regards
W.A.W Nutzfahrzeuge`;
}
