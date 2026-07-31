import type { GeneratedDocumentType } from "@/lib/pdf/generated-documents/document-types";

export type GeneratedDocumentValidationField =
    | "company.legalName"
    | "company.street"
    | "company.postalCode"
    | "company.city"
    | "company.country"
    | "company.email"
    | "company.phone"
    | "company.vatId"
    | "company.taxNumber"

    | "customer.name"
    | "customer.street"
    | "customer.postalCode"
    | "customer.city"
    | "customer.country"
    | "customer.email"
    | "customer.phone"
    | "customer.vatId"

    | "vehicle.internalNumber"
    | "vehicle.manufacturer"
    | "vehicle.model"
    | "vehicle.vehicleType"
    | "vehicle.vin"
    | "vehicle.licensePlate"
    | "vehicle.firstRegistration"
    | "vehicle.constructionYear"

    | "sale.id"
    | "sale.saleDate"
    | "sale.invoiceNumber"
    | "sale.invoiceDate"
    | "sale.netAmount"
    | "sale.vatRate"
    | "sale.vatAmount"
    | "sale.grossAmount"

    | "purchase.id"
    | "purchase.purchaseNumber"
    | "purchase.purchaseDate"
    | "purchase.netAmount"
    | "purchase.vatRate"
    | "purchase.vatAmount"
    | "purchase.grossAmount"

    | "licensePlate.id"
    | "licensePlate.plateType"
    | "licensePlate.requestedAt"

    | "export.destinationCity"
    | "export.destinationCountry"
    | "export.arrivalMonth"
    | "export.arrivalYear"
    | "export.transportDate"
    | "export.transportType"
    | "export.receiverName"

    | "travel.driverName"
    | "travel.travelDate"
    | "travel.visitedCustomer"
    | "travel.location"
    | "travel.vehicleOrPlate"
    | "travel.purpose"
    | "travel.startMileage"
    | "travel.endMileage";

export type GeneratedDocumentValidationRule = {
    field: GeneratedDocumentValidationField;
    label: string;
    message: string;
};

export type GeneratedDocumentValidationResult = {
    canGenerate: boolean;
    missingFields: GeneratedDocumentValidationRule[];
};

export type GeneratedDocumentValidationData = {
    company?: {
        legalName?: string | null;
        street?: string | null;
        postalCode?: string | null;
        city?: string | null;
        country?: string | null;
        email?: string | null;
        website?: string | null;
        phone?: string | null;
        mobilePhone1?: string | null;
        mobilePhone2?: string | null;
        vatId?: string | null;
        taxNumber?: string | null;
    } | null;

    customer?: {
        name?: string | null;
        street?: string | null;
        postalCode?: string | null;
        city?: string | null;
        country?: string | null;
        email?: string | null;
        phone?: string | null;
        vatId?: string | null;
    } | null;

    vehicle?: {
        internalNumber?: string | null;
        manufacturer?: string | null;
        model?: string | null;
        vehicleType?: string | null;
        vin?: string | null;
        licensePlate?: string | null;
        firstRegistration?: string | null;
        constructionYear?: number | null;
    } | null;

    sale?: {
        id?: string | null;
        saleNumber?: string | null;
        saleType?: string | null;
        saleDate?: string | null;
        invoiceNumber?: string | null;
        invoiceDate?: string | null;
        netAmount?: number | null;
        vatRate?: number | null;
        vatAmount?: number | null;
        grossAmount?: number | null;
    } | null;

    documentDate?: {
        usedDate?: string | null;
        suggestedDate?: string | null;
        sourceDate?: string | null;
        calculationType?: string | null;
        transitDays?: number | null;
        countryCode?: string | null;
        countryName?: string | null;
        isOverridden?: boolean;
        explanation?: string | null;
    } | null;

    purchase?: {
        id?: string | null;
        purchaseNumber?: string | null;
        purchaseDate?: string | null;
        netAmount?: number | null;
        vatRate?: number | null;
        vatAmount?: number | null;
        grossAmount?: number | null;
    } | null;

    licensePlate?: {
        id?: string | null;
        plateType?: string | null;
        requestedAt?: string | null;
    } | null;

    export?: {
        destinationCity?: string | null;
        destinationCountry?: string | null;
        arrivalMonth?: string | null;
        arrivalYear?: string | null;
        transportDate?: string | null;
        transportType?: string | null;
        receiverName?: string | null;
    } | null;

    travel?: {
        driverName?: string | null;
        travelDate?: string | null;
        visitedCustomer?: string | null;
        location?: string | null;
        vehicleOrPlate?: string | null;
        purpose?: string | null;
        startMileage?: number | null;
        endMileage?: number | null;
    } | null;
};

const companyBaseRules: GeneratedDocumentValidationRule[] = [
    {
        field: "company.legalName",
        label: "Firma: Name",
        message: "Der Firmenname fehlt.",
    },
    {
        field: "company.street",
        label: "Firma: Straße",
        message: "Die Firmenstraße fehlt.",
    },
    {
        field: "company.postalCode",
        label: "Firma: PLZ",
        message: "Die Firmen-Postleitzahl fehlt.",
    },
    {
        field: "company.city",
        label: "Firma: Ort",
        message: "Der Firmenort fehlt.",
    },
    {
        field: "company.country",
        label: "Firma: Land",
        message: "Das Firmenland fehlt.",
    },
];

const customerBaseRules: GeneratedDocumentValidationRule[] = [
    {
        field: "customer.name",
        label: "Kunde: Name",
        message: "Der Kundenname fehlt.",
    },
    {
        field: "customer.street",
        label: "Kunde: Straße",
        message: "Die Kundenstraße fehlt.",
    },
    {
        field: "customer.postalCode",
        label: "Kunde: PLZ",
        message: "Die Kunden-Postleitzahl fehlt.",
    },
    {
        field: "customer.city",
        label: "Kunde: Stadt",
        message: "Die Kundenstadt fehlt.",
    },
    {
        field: "customer.country",
        label: "Kunde: Land",
        message: "Das Kundenland fehlt.",
    },
];

const vehicleBaseRules: GeneratedDocumentValidationRule[] = [
    {
        field: "vehicle.manufacturer",
        label: "Fahrzeug: Marke",
        message: "Die Fahrzeugmarke fehlt.",
    },
    {
        field: "vehicle.model",
        label: "Fahrzeug: Modell",
        message: "Das Fahrzeugmodell fehlt.",
    },
    {
        field: "vehicle.vehicleType",
        label: "Fahrzeug: Typ",
        message: "Der Fahrzeugtyp fehlt.",
    },
    {
        field: "vehicle.vin",
        label: "Fahrzeug: FIN/VIN",
        message: "Die Fahrgestellnummer / VIN fehlt.",
    },
];

const saleBaseRules: GeneratedDocumentValidationRule[] = [
    {
        field: "sale.id",
        label: "Verkauf",
        message: "Der Verkauf fehlt.",
    },
    {
        field: "sale.saleDate",
        label: "Verkauf: Datum",
        message: "Das Verkaufsdatum fehlt.",
    },
    {
        field: "sale.grossAmount",
        label: "Verkauf: Bruttobetrag",
        message: "Der Bruttobetrag des Verkaufs fehlt.",
    },
];

const invoiceRules: GeneratedDocumentValidationRule[] = [
    {
        field: "sale.invoiceNumber",
        label: "Rechnung: Nummer",
        message: "Die Rechnungsnummer fehlt.",
    },
    {
        field: "sale.invoiceDate",
        label: "Rechnung: Datum",
        message: "Das Rechnungsdatum fehlt.",
    },
];

const purchaseBaseRules: GeneratedDocumentValidationRule[] = [
    {
        field: "purchase.id",
        label: "Ankauf",
        message: "Der Ankauf fehlt.",
    },
    {
        field: "purchase.purchaseNumber",
        label: "Ankauf: Nummer",
        message: "Die Ankaufsnummer fehlt.",
    },
    {
        field: "purchase.purchaseDate",
        label: "Ankauf: Datum",
        message: "Das Ankaufsdatum fehlt.",
    },
    {
        field: "purchase.grossAmount",
        label: "Ankauf: Bruttobetrag",
        message: "Der Bruttobetrag des Ankaufs fehlt.",
    },
];

const exportBaseRules: GeneratedDocumentValidationRule[] = [
    {
        field: "export.destinationCity",
        label: "Export: Zielort",
        message: "Der Zielort / Empfangsort fehlt.",
    },
    {
        field: "export.destinationCountry",
        label: "Export: Zielland",
        message: "Das Zielland / Empfangsland fehlt.",
    },
];

export const documentValidationRules: Record<
    GeneratedDocumentType,
    GeneratedDocumentValidationRule[]
> = {
    invoice_pdf: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...saleBaseRules,
        ...invoiceRules,
    ],

    proforma_invoice: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...saleBaseRules,
    ],

    handover_protocol: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...saleBaseRules,
        ...invoiceRules,
    ],

    entry_certificate: [
        ...companyBaseRules,
        ...customerBaseRules,
        {
            field: "customer.vatId",
            label: "Kunde: USt-ID",
            message: "Die USt-ID des Kunden fehlt.",
        },
        ...vehicleBaseRules,
        ...saleBaseRules,
        ...invoiceRules,
        ...exportBaseRules,
    ],

    transport_proof: [
        ...companyBaseRules,
        ...customerBaseRules,
        {
            field: "customer.vatId",
            label: "Kunde: USt-ID",
            message: "Die USt-ID des Kunden fehlt.",
        },
        ...vehicleBaseRules,
        ...saleBaseRules,
        ...invoiceRules,
        ...exportBaseRules,
        {
            field: "export.transportType",
            label: "Verbringung: Art",
            message: "Die Art der Verbringung fehlt.",
        },
    ],

    license_plate_consent: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        {
            field: "licensePlate.id",
            label: "Kennzeichen-Vorgang",
            message: "Der Kennzeichen-Vorgang fehlt.",
        },
        {
            field: "licensePlate.plateType",
            label: "Kennzeichen: Typ",
            message: "Der Kennzeichentyp fehlt.",
        },
        {
            field: "licensePlate.requestedAt",
            label: "Kennzeichen: Antragsdatum",
            message: "Das Antragsdatum fehlt.",
        },
    ],

    travel_expense_form: [
        ...companyBaseRules,
        {
            field: "travel.driverName",
            label: "Reisekosten: Fahrer",
            message: "Der Mitarbeiter / Fahrer fehlt.",
        },
        {
            field: "travel.travelDate",
            label: "Reisekosten: Datum",
            message: "Das Fahrtdatum fehlt.",
        },
        {
            field: "travel.visitedCustomer",
            label: "Reisekosten: Kunde/Firma",
            message: "Der besuchte Kunde bzw. die Firma fehlt.",
        },
        {
            field: "travel.location",
            label: "Reisekosten: Ort",
            message: "Der Ort fehlt.",
        },
        {
            field: "travel.vehicleOrPlate",
            label: "Reisekosten: Fahrzeug/Kennzeichen",
            message: "Das Fahrzeug oder Kennzeichen fehlt.",
        },
        {
            field: "travel.purpose",
            label: "Reisekosten: Zweck",
            message: "Der Zweck der Fahrt fehlt.",
        },
    ],

    purchase_contract: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...purchaseBaseRules,
    ],

    sales_contract: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...saleBaseRules,
    ],

    abd_checklist: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...saleBaseRules,
        ...invoiceRules,
    ],

    exit_note_checklist: [
        ...companyBaseRules,
        ...customerBaseRules,
        ...vehicleBaseRules,
        ...saleBaseRules,
        ...invoiceRules,
    ],
};

function getValueByPath(
    data: GeneratedDocumentValidationData,
    path: GeneratedDocumentValidationField,
): unknown {
    return path.split(".").reduce<unknown>((currentValue, key) => {
        if (
            currentValue &&
            typeof currentValue === "object" &&
            key in currentValue
        ) {
            return (currentValue as Record<string, unknown>)[key];
        }

        return undefined;
    }, data);
}

function isMissing(value: unknown): boolean {
    if (value === null || value === undefined) return true;

    if (typeof value === "string") {
        return value.trim().length === 0;
    }

    if (typeof value === "number") {
        return !Number.isFinite(value);
    }

    return false;
}

export function validateGeneratedDocumentData(
    documentType: GeneratedDocumentType,
    data: GeneratedDocumentValidationData,
): GeneratedDocumentValidationResult {
    const rules = documentValidationRules[documentType];

    const missingFields = rules.filter((rule) => {
        const value = getValueByPath(data, rule.field);

        return isMissing(value);
    });

    return {
        canGenerate: missingFields.length === 0,
        missingFields,
    };
}
