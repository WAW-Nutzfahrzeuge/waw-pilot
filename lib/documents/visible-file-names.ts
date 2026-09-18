const technicalNamePatterns = [
    /^image(?:[-_\s.]|$)/i,
    /\bcropped\b/i,
    /^blob(?:[-_\s.]|$)/i,
    /^upload(?:[-_\s.]|$)/i,
    /^tmp(?:[-_\s.]|$)/i,
    /^temp(?:[-_\s.]|$)/i,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
];

const mimeTypeExtensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/zip": "zip",
    "application/xml": "xml",
    "text/xml": "xml",
};

const invoiceDocumentTypes = new Set([
    "invoice",
    "invoice_pdf",
    "zugferd_invoice",
    "proforma_invoice",
    "down_payment_invoice",
    "cancellation_invoice",
    "credit_note",
]);

const documentTypeLabels: Record<string, string> = {
    invoice: "Rechnung",
    invoice_pdf: "Rechnung",
    zugferd_invoice: "Rechnung",
    purchase_invoice: "Einkaufsrechnung",
    purchase_contract: "Ankaufsvertrag",
    purchase_receipt: "Ankaufsbeleg",
    purchase_payment_proof: "Zahlungsnachweis Ankauf",
    seller_id: "Ausweis Verkäufer",
    seller_commercial_register: "Handelsregister Verkäufer",
    proforma_invoice: "Proforma-Rechnung",
    down_payment_invoice: "Anzahlungsrechnung",
    cancellation_invoice: "Stornorechnung",
    credit_note: "Gutschrift",
    vehicle_registration: "Fahrzeugschein",
    contract: "Kaufvertrag",
    handover_protocol: "Übergabeprotokoll",
    entry_certificate: "Gelangensbestätigung",
    transport_proof: "Verbringungsnachweis",
    bzst_vat_verification_primary: "BZSt Prüfnachweis Ergebnisübersicht",
    bzst_vat_verification_secondary: "BZSt Prüfnachweis qualifizierte Bestätigung",
    abd_checklist: "ABD-Checkliste",
    exit_note_checklist: "Ausgangsvermerk-Checkliste",
    commercial_register: "Handelsregisterauszug",
    business_registration: "Gewerbeschein",
    owner_id: "Ausweis Inhaber Käufer",
    customer_id: "Ausweis Kunde",
    tax_number_document: "Steuernummer",
    customs: "Zolldokument",
    cashbook_receipt: "Kassenbuch-Beleg",
    license_plate_document: "Kennzeichen-Dokument",
    license_plate_consent: "Einverständniserklärung Kennzeichen",
    license_plate_insurance: "Kennzeichen-Versicherung",
    license_plate_power_of_attorney: "Kennzeichen-Vollmacht",
    license_plate_registration: "Kennzeichen-Zulassung",
    travel_expense_form: "Reisekostenformular",
    export_documents: "Exportdokumente",
    registration_documents: "Zulassungsunterlagen",
    insurance_document: "Versicherungsdokument",
    tax_document: "Steuerdokument",
    other: "Dokument",
};

type DownloadFileNameInput = {
    storedFileName: string | null | undefined;
    documentType: string | null | undefined;
    mimeType: string | null | undefined;
    invoiceNumber?: string | null;
    storagePath?: string | null;
    versionNumber?: number | null;
};

function getBaseName(fileName: string): string {
    const pathlessName = fileName.split(/[\\/]/).pop() ?? fileName;

    return pathlessName.replace(/\.[^.]+$/, "").trim();
}

function getExtensionFromName(fileName: string | null | undefined): string | null {
    if (!fileName) return null;

    const pathlessName = fileName.split(/[\\/]/).pop() ?? fileName;
    const match = /\.([a-z0-9]{1,8})$/i.exec(pathlessName.trim());

    return match?.[1]?.toLowerCase() ?? null;
}

function getExtensionForFile(input: Pick<DownloadFileNameInput, "mimeType" | "storedFileName" | "storagePath">): string {
    const mimeExtension = input.mimeType
        ? mimeTypeExtensions[input.mimeType.toLowerCase()]
        : null;

    return (
        mimeExtension ??
        getExtensionFromName(input.storedFileName) ??
        getExtensionFromName(input.storagePath) ??
        "bin"
    );
}

function sanitizeOriginalFileName(fileName: string, extension: string): string {
    const pathlessName = fileName.split(/[\\/]/).pop() ?? fileName;
    const baseName = getBaseName(pathlessName)
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, " ")
        .trim();
    const safeBaseName = baseName.length > 0 ? baseName : "Dokument";

    return `${safeBaseName}.${extension}`;
}

function sanitizeFallbackBaseName(label: string): string {
    const baseName = label
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/[–—]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .trim();

    return baseName.length > 0 ? baseName : "Dokument";
}

function getFallbackDocumentTypeLabel(documentType: string): string {
    return (
        documentTypeLabels[documentType] ??
        documentType
            .split("_")
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ") ??
        "Dokument"
    );
}

export function isTechnicalGeneratedFileName(fileName: string | null | undefined): boolean {
    if (!fileName) return true;

    const baseName = getBaseName(fileName);

    if (!baseName) return true;

    return technicalNamePatterns.some((pattern) => pattern.test(baseName));
}

export function getVisibleCroppedFileName(fileName: string, mimeType: string): string {
    const extension = getExtensionForFile({
        mimeType,
        storedFileName: fileName,
        storagePath: null,
    });

    return sanitizeOriginalFileName(fileName, extension);
}

export function getDocumentDownloadFileName(input: DownloadFileNameInput): string {
    const extension = getExtensionForFile(input);
    const storedFileName = input.storedFileName?.trim();

    if (storedFileName && !isTechnicalGeneratedFileName(storedFileName)) {
        return sanitizeOriginalFileName(storedFileName, extension);
    }

    const documentType = input.documentType?.trim() || "other";
    const invoiceNumber = input.invoiceNumber?.trim();

    if (invoiceNumber && invoiceDocumentTypes.has(documentType)) {
        return `${sanitizeFallbackBaseName(`${getFallbackDocumentTypeLabel(documentType)}_${invoiceNumber}`)}.${extension}`;
    }

    const versionNumber = input.versionNumber && input.versionNumber > 0 ? input.versionNumber : 1;
    const baseName = sanitizeFallbackBaseName(`${getFallbackDocumentTypeLabel(documentType)}_${versionNumber}`);

    return `${baseName}.${extension}`;
}
