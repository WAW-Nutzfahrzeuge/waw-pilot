import type {
    DocumentSource,
    DocumentStatus,
} from "@/lib/documents/document-queries";
import {
    getDocumentStatusLabel as getCentralDocumentStatusLabel,
    getDocumentStatusTone as getCentralDocumentStatusTone,
} from "@/utils/document-status";

export function getDocumentTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        invoice: "Rechnung",
        invoice_pdf: "Rechnungs-PDF",
        zugferd_invoice: "E-Rechnung (ZUGFeRD)",
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
        end_use_declaration: "Endverbleibserklärung",
        bzst_vat_verification_primary: "BZSt-Prüfnachweis – Ergebnisübersicht",
        bzst_vat_verification_secondary:
            "BZSt-Prüfnachweis – qualifizierte Bestätigung",
        abd_checklist: "ABD-Checkliste",
        exit_note_checklist: "Ausgangsvermerk-Checkliste",

        commercial_register: "Handelsregisterauszug",
        business_registration: "Gewerbeschein",
        owner_id: "Ausweis vom Inhaber / Käufer",
        customer_id: "Ausweis Kunde",
        tax_number_document: "Steuernummer",
        sale_custom_document: "Weiteres Dokument",

        customs: "Zolldokument / Ausfuhrnachweis / Ausgangsvermerk",
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
        other: "Sonstiges Dokument",
    };

    return labels[type] ?? formatUnknownDocumentType(type);
}

export function getDocumentSourceLabel(source: DocumentSource): string {
    const labels: Record<DocumentSource, string> = {
        generated: "Automatisch erzeugt",
        uploaded: "Hochgeladen",
    };

    return labels[source];
}

export function getDocumentStatusLabel(status: DocumentStatus): string {
    return getCentralDocumentStatusLabel(status);
}

export function getDocumentStatusTone(
    status: DocumentStatus,
): "success" | "warning" | "danger" {
    return getCentralDocumentStatusTone(status);
}

export function getDocumentSourceTone(
    source: DocumentSource,
): "info" | "neutral" {
    if (source === "generated") return "info";

    return "neutral";
}

export function formatFileSize(sizeInBytes: number | null): string {
    if (!sizeInBytes) return "—";

    if (sizeInBytes < 1024) {
        return `${sizeInBytes} B`;
    }

    if (sizeInBytes < 1024 * 1024) {
        return `${Math.round(sizeInBytes / 1024)} KB`;
    }

    return `${(sizeInBytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatUnknownDocumentType(type: string): string {
    return type
        .split("_")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
