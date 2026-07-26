export type DocumentExportCategoryKey =
    | "invoices"
    | "contracts"
    | "export_proofs"
    | "vehicle_documents"
    | "payment_proofs"
    | "other_documents";

export type DocumentExportCategory = {
    key: DocumentExportCategoryKey;
    folderName: string;
    sortOrder: number;
};

const categories: Record<DocumentExportCategoryKey, DocumentExportCategory> = {
    invoices: {
        key: "invoices",
        folderName: "01_Rechnungen",
        sortOrder: 1,
    },
    contracts: {
        key: "contracts",
        folderName: "02_Vertragsunterlagen",
        sortOrder: 2,
    },
    export_proofs: {
        key: "export_proofs",
        folderName: "03_Exportnachweise",
        sortOrder: 3,
    },
    vehicle_documents: {
        key: "vehicle_documents",
        folderName: "04_Fahrzeugdokumente",
        sortOrder: 4,
    },
    payment_proofs: {
        key: "payment_proofs",
        folderName: "05_Zahlungsnachweise",
        sortOrder: 5,
    },
    other_documents: {
        key: "other_documents",
        folderName: "06_Sonstige_Dokumente",
        sortOrder: 6,
    },
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

const contractDocumentTypes = new Set([
    "contract",
    "purchase_contract",
    "sales_contract",
    "handover_protocol",
]);

const exportProofDocumentTypes = new Set([
    "entry_certificate",
    "transport_proof",
    "bzst_vat_verification_primary",
    "bzst_vat_verification_secondary",
    "abd_checklist",
    "exit_note_checklist",
    "customs",
    "export_documents",
]);

const vehicleDocumentTypes = new Set([
    "vehicle_registration",
    "registration_documents",
    "license_plate_document",
    "license_plate_consent",
    "license_plate_insurance",
    "license_plate_power_of_attorney",
    "license_plate_registration",
    "insurance_document",
    "tax_document",
]);

const paymentProofDocumentTypes = new Set([
    "purchase_payment_proof",
    "purchase_receipt",
    "cashbook_receipt",
    "payment_receipt",
    "payment_proof",
    "refund_receipt",
]);

export class DocumentExportCategoryPolicy {
    getCategory(documentType: string): DocumentExportCategory {
        if (invoiceDocumentTypes.has(documentType)) return categories.invoices;
        if (contractDocumentTypes.has(documentType)) return categories.contracts;
        if (exportProofDocumentTypes.has(documentType)) return categories.export_proofs;
        if (vehicleDocumentTypes.has(documentType)) return categories.vehicle_documents;
        if (paymentProofDocumentTypes.has(documentType)) return categories.payment_proofs;

        return categories.other_documents;
    }
}

export function getDocumentExportCategories(): DocumentExportCategory[] {
    return Object.values(categories).sort((left, right) => left.sortOrder - right.sortOrder);
}
