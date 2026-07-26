export type ExportFileNameContext = {
    saleReference: string;
    vehicleLabel?: string | null;
    documentType: string;
    originalFileName?: string | null;
    mimeType?: string | null;
    createdAt?: string | null;
};

const windowsReservedNames = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
]);

const documentFilePrefixes: Record<string, string> = {
    invoice: "Rechnung",
    invoice_pdf: "Rechnung",
    zugferd_invoice: "ZUGFeRD_Rechnung",
    proforma_invoice: "Proforma_Rechnung",
    down_payment_invoice: "Anzahlungsrechnung",
    cancellation_invoice: "Stornorechnung",
    credit_note: "Gutschrift",
    contract: "Kaufvertrag",
    purchase_contract: "Ankaufsvertrag",
    sales_contract: "Kaufvertrag",
    handover_protocol: "Uebergabeprotokoll",
    entry_certificate: "Gelangensbestaetigung",
    transport_proof: "Verbringungsnachweis",
    bzst_vat_verification_primary: "BZSt_Nachweis_1",
    bzst_vat_verification_secondary: "BZSt_Nachweis_2",
    abd_checklist: "ABD_Checkliste",
    exit_note_checklist: "Ausgangsvermerk_Checkliste",
    customs: "Zollnachweis",
    vehicle_registration: "Fahrzeugschein",
    registration_documents: "Zulassungsunterlagen",
    purchase_payment_proof: "Zahlungsnachweis",
    cashbook_receipt: "Zahlungsbeleg",
    travel_expense_form: "Reisekostenformular",
    other: "Dokument",
};

export function normalizeFileNamePart(value: string): string {
    const normalized = value
        .trim()
        .replace(/ä/g, "ae")
        .replace(/Ä/g, "Ae")
        .replace(/ö/g, "oe")
        .replace(/Ö/g, "Oe")
        .replace(/ü/g, "ue")
        .replace(/Ü/g, "Ue")
        .replace(/ß/g, "ss")
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^\.+/, "")
        .replace(/[ ._]+$/g, "");

    if (!normalized) return "Datei";

    return windowsReservedNames.has(normalized.toUpperCase())
        ? `${normalized}_Datei`
        : normalized;
}

function getExtensionFromMimeType(mimeType: string | null | undefined): string | null {
    if (!mimeType) return null;

    const extensions: Record<string, string> = {
        "application/pdf": "pdf",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "text/plain": "txt",
        "application/xml": "xml",
        "text/xml": "xml",
    };

    return extensions[mimeType.toLowerCase()] ?? null;
}

function getExtensionFromFileName(fileName: string | null | undefined): string | null {
    if (!fileName) return null;

    const extension = fileName.split(".").pop()?.trim().toLowerCase();

    return extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : null;
}

function trimToMaxLength(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;

    return value.slice(0, maxLength).replace(/[ ._]+$/g, "");
}

export class ExportFileNamePolicy {
    createArchiveFolderName(params: {
        saleReference: string;
    }): string {
        return trimToMaxLength(
            normalizeFileNamePart(`Verkauf ${params.saleReference}`),
            96,
        );
    }

    createZipFileName(params: {
        saleReference: string;
    }): string {
        return `${this.createArchiveFolderName(params)}.zip`;
    }

    createDocumentFileName(context: ExportFileNameContext): string {
        const prefix = documentFilePrefixes[context.documentType] ?? documentFilePrefixes.other;
        const extension =
            getExtensionFromMimeType(context.mimeType) ??
            getExtensionFromFileName(context.originalFileName) ??
            "bin";
        const datePart = context.createdAt?.slice(0, 10);
        const parts = [
            prefix,
            context.saleReference,
            context.vehicleLabel,
            datePart,
        ].filter((part): part is string => Boolean(part?.trim()));
        const baseName = trimToMaxLength(normalizeFileNamePart(parts.join("_")), 150);

        return `${baseName}.${extension}`;
    }
}

export function createUniqueFileName(
    requestedName: string,
    usedNames: Set<string>,
): string {
    if (!usedNames.has(requestedName)) {
        usedNames.add(requestedName);
        return requestedName;
    }

    const lastDotIndex = requestedName.lastIndexOf(".");
    const baseName =
        lastDotIndex > 0 ? requestedName.slice(0, lastDotIndex) : requestedName;
    const extension = lastDotIndex > 0 ? requestedName.slice(lastDotIndex) : "";
    let counter = 2;

    while (usedNames.has(`${baseName}_${counter}${extension}`)) {
        counter += 1;
    }

    const uniqueName = `${baseName}_${counter}${extension}`;
    usedNames.add(uniqueName);

    return uniqueName;
}
