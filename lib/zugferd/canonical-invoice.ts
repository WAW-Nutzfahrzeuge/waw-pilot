import { getInvoiceTypeLabel } from "@/lib/invoices/invoice-numbering";
import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";

export type ZugferdValidationIssue = {
    source?: "FACTUR_X" | "EN16931" | "XRECHNUNG" | "PDF_A";
    severity: "error" | "warning" | "notice";
    ruleId?: string;
    message: string;
    location?: string;
    blocking?: boolean;
};

export type CanonicalInvoiceData = {
    invoiceNumber: string;
    invoiceDate: string;
    deliveryDate: string;
    currency: "EUR";
    invoiceType: "380";
    standardVersion: "ZUGFeRD 2.5 / Factur-X 1.09";
    profile: "EN16931";
    seller: {
        name: string;
        street: string;
        postalCode: string;
        city: string;
        countryCode: string;
        vatId: string | null;
        registrationId: string | null;
        identifier: string | null;
        taxNumber: string | null;
        email: string | null;
        phone: string | null;
    };
    buyer: {
        name: string;
        street: string;
        postalCode: string;
        city: string;
        countryCode: string;
        vatId: string | null;
    };
    lines: Array<{
        id: string;
        name: string;
        quantity: number;
        unitCode: "C62";
        netUnitPrice: number;
        netLineTotal: number;
        vatRate: number;
        taxCategory: string;
        vin: string | null;
    }>;
    tax: {
        category: string;
        rate: number;
        basisAmount: number;
        taxAmount: number;
        exemptionReason: string | null;
    };
    totals: {
        lineTotal: number;
        taxBasisTotal: number;
        taxTotal: number;
        grandTotal: number;
        duePayable: number;
    };
    payment: {
        terms: string;
        iban: string;
        bic: string;
        bankName: string;
    };
};

export class ZugferdDataValidationError extends Error {
    readonly issues: ZugferdValidationIssue[];
    readonly missingFields: string[];

    constructor(missingFields: string[]) {
        super(
            `ZUGFeRD konnte nicht erstellt werden. Bitte ergänze folgende Pflichtdaten: ${missingFields.join(
                ", ",
            )}`,
        );
        this.name = "ZugferdDataValidationError";
        this.missingFields = missingFields;
        this.issues = missingFields.map((message) => ({
            severity: "error",
            message,
        }));
    }
}

function isPresent(value: string | null | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
}

function isFiniteAmount(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function getCountryCode(country: string | null | undefined): string {
    const normalizedCountry = (country ?? "").trim().toLowerCase();
    const countryCodes: Record<string, string> = {
        deutschland: "DE",
        germany: "DE",
        österreich: "AT",
        austria: "AT",
        schweiz: "CH",
        switzerland: "CH",
        polen: "PL",
        poland: "PL",
        bulgarien: "BG",
        bulgaria: "BG",
        frankreich: "FR",
        france: "FR",
        italien: "IT",
        italy: "IT",
        spanien: "ES",
        spain: "ES",
        niederlande: "NL",
        netherlands: "NL",
        belgien: "BE",
        belgium: "BE",
        rumänien: "RO",
        romania: "RO",
        tschechien: "CZ",
        czechia: "CZ",
        slowakei: "SK",
        slovakia: "SK",
        ungarn: "HU",
        hungary: "HU",
        dänemark: "DK",
        denmark: "DK",
        schweden: "SE",
        sweden: "SE",
        norwegen: "NO",
        norway: "NO",
        finnland: "FI",
        finland: "FI",
        saudiarabien: "SA",
        "saudi arabia": "SA",
        dubai: "AE",
        "vereinigte arabische emirate": "AE",
        "united arab emirates": "AE",
        libyen: "LY",
        libya: "LY",
        marokko: "MA",
        morocco: "MA",
    };

    if (/^[a-z]{2}$/i.test(normalizedCountry)) {
        return normalizedCountry.toUpperCase();
    }

    return countryCodes[normalizedCountry] ?? "";
}

function normalizeVatId(
    value: string | null | undefined,
    countryCode: string,
): string | null {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    const cleaned = (value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[\s\-./]/g, "");

    if (!cleaned) {
        return null;
    }

    if (/^[A-Z]{2}/.test(cleaned)) {
        return cleaned;
    }

    if (normalizedCountryCode === "DE" && /^[0-9]{9}$/.test(cleaned)) {
        return `DE${cleaned}`;
    }

    return cleaned;
}

function isValidVatIdForCountry(vatId: string, countryCode: string): boolean {
    const normalizedCountryCode = countryCode.trim().toUpperCase();

    if (normalizedCountryCode === "DE") {
        return /^DE[0-9]{9}$/.test(vatId);
    }

    return /^[A-Z]{2}.+/.test(vatId);
}

function getTaxCategoryCode(data: InvoicePdfData): string {
    if (data.amounts.vatRate > 0) return "S";
    if (data.saleType === "eu") return "K";
    if (data.saleType === "export_third_country") return "G";
    return "Z";
}

function getTaxExemptionReason(data: InvoicePdfData): string | null {
    if (data.amounts.vatRate > 0) return null;
    if (data.saleType === "eu") {
        return "Steuerfreie innergemeinschaftliche Lieferung";
    }
    if (data.saleType === "export_third_country") {
        return "Steuerfreie Ausfuhrlieferung";
    }
    return "Steuerfreie Rechnung";
}

function getVehicleDescription(data: InvoicePdfData): string {
    return [
        data.vehicle.vehicleType,
        data.vehicle.manufacturer,
        data.vehicle.model,
        data.vehicle.internalNumber
            ? `(Interne Nr. ${data.vehicle.internalNumber})`
            : null,
        data.vehicle.vin ? `VIN ${data.vehicle.vin}` : null,
    ]
        .filter(Boolean)
        .join(" ");
}

export function buildCanonicalInvoiceData(
    data: InvoicePdfData,
): CanonicalInvoiceData {
    const missingFields: string[] = [];
    const sellerCountryCode = getCountryCode(data.company.country);
    const buyerCountryCode = getCountryCode(data.customer.country);
    const vehicleDescription = getVehicleDescription(data);

    if (data.invoiceType !== "standard") {
        missingFields.push(
            `${getInvoiceTypeLabel(data.invoiceType)} wird für ZUGFeRD aktuell nicht unterstützt`,
        );
    }

    if (!isPresent(data.company.legalName)) missingFields.push("Firmenname fehlt");
    if (!isPresent(data.company.street)) missingFields.push("Firmenadresse fehlt");
    if (!isPresent(data.company.postalCode)) missingFields.push("Firmen-PLZ fehlt");
    if (!isPresent(data.company.city)) missingFields.push("Firmenstadt fehlt");
    if (!isPresent(data.company.country)) missingFields.push("Firmenland fehlt");
    if (!sellerCountryCode) missingFields.push("Firmenland muss als ISO-Ländercode abbildbar sein");

    const sellerVatId = normalizeVatId(data.company.vatId, sellerCountryCode);
    const sellerRegistrationId = data.company.registrationId?.trim() || null;
    if (sellerVatId && !isValidVatIdForCountry(sellerVatId, sellerCountryCode)) {
        missingFields.push(
            "Die USt-IdNr. des Verkäufers ist ungültig. Erwartetes Format: DE123456789.",
        );
    }
    if (!sellerVatId && !sellerRegistrationId) {
        missingFields.push(
            "Für die E-Rechnung fehlt eine eindeutige Verkäuferkennung. Bitte hinterlege die USt-IdNr. oder Handelsregisternummer von W.A.W Nutzfahrzeuge.",
        );
    }
    if (!isPresent(data.company.bankIban)) missingFields.push("Bankverbindung: IBAN fehlt");
    if (!isPresent(data.company.bankName)) missingFields.push("Bankverbindung: Bankname fehlt");

    if (!isPresent(data.customer.name)) missingFields.push("Kundenname fehlt");
    if (!isPresent(data.customer.street)) missingFields.push("Kundenstraße fehlt");
    if (!isPresent(data.customer.postalCode)) missingFields.push("Kunden-PLZ fehlt");
    if (!isPresent(data.customer.city)) missingFields.push("Kunden-Stadt fehlt");
    if (!isPresent(data.customer.country)) missingFields.push("Kunden-Land fehlt");
    if (!buyerCountryCode) missingFields.push("Kunden-Land muss als ISO-Ländercode abbildbar sein");
    const buyerVatId = normalizeVatId(data.customer.vatId, buyerCountryCode);
    if (buyerVatId && !isValidVatIdForCountry(buyerVatId, buyerCountryCode)) {
        missingFields.push(
            "Die USt-IdNr. des Käufers ist ungültig. Bitte hinterlege sie mit ISO-Ländercode, z. B. DE123456789.",
        );
    }

    if (!isPresent(data.invoiceNumber)) missingFields.push("Rechnungsnummer fehlt");
    if (!isPresent(data.invoiceDate)) missingFields.push("Rechnungsdatum fehlt");
    if (!isFiniteAmount(data.amounts.netAmount)) missingFields.push("Netto-Betrag fehlt");
    if (!isFiniteAmount(data.amounts.vatAmount)) missingFields.push("Umsatzsteuerbetrag fehlt");
    if (!isFiniteAmount(data.amounts.grossAmount)) missingFields.push("Brutto-Betrag fehlt");
    if (!Number.isFinite(data.amounts.vatRate)) missingFields.push("Steuersatz fehlt");
    if (!isPresent(vehicleDescription)) missingFields.push("Rechnungsposition fehlt");

    const expectedGross = roundMoney(data.amounts.netAmount + data.amounts.vatAmount);

    if (
        isFiniteAmount(data.amounts.grossAmount) &&
        Math.abs(expectedGross - roundMoney(data.amounts.grossAmount)) > 0.01
    ) {
        missingFields.push("Netto-, Steuer- und Bruttobetrag sind nicht konsistent");
    }

    if (missingFields.length > 0) {
        throw new ZugferdDataValidationError(missingFields);
    }

    const taxCategory = getTaxCategoryCode(data);

    return {
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        deliveryDate: data.invoiceDate,
        currency: "EUR",
        invoiceType: "380",
        standardVersion: "ZUGFeRD 2.5 / Factur-X 1.09",
        profile: "EN16931",
        seller: {
            name: data.company.legalName,
            street: data.company.street,
            postalCode: data.company.postalCode,
            city: data.company.city,
            countryCode: sellerCountryCode,
            vatId: sellerVatId,
            registrationId: sellerRegistrationId,
            identifier: null,
            taxNumber: data.company.taxNumber,
            email: data.company.email,
            phone: data.company.phone,
        },
        buyer: {
            name: data.customer.name,
            street: data.customer.street ?? "",
            postalCode: data.customer.postalCode ?? "",
            city: data.customer.city ?? "",
            countryCode: buyerCountryCode,
            vatId: buyerVatId,
        },
        lines: [
            {
                id: "1",
                name: vehicleDescription,
                quantity: 1,
                unitCode: "C62",
                netUnitPrice: roundMoney(data.amounts.netAmount),
                netLineTotal: roundMoney(data.amounts.netAmount),
                vatRate: data.amounts.vatRate,
                taxCategory,
                vin: data.vehicle.vin || null,
            },
        ],
        tax: {
            category: taxCategory,
            rate: data.amounts.vatRate,
            basisAmount: roundMoney(data.amounts.netAmount),
            taxAmount: roundMoney(data.amounts.vatAmount),
            exemptionReason: getTaxExemptionReason(data),
        },
        totals: {
            lineTotal: roundMoney(data.amounts.netAmount),
            taxBasisTotal: roundMoney(data.amounts.netAmount),
            taxTotal: roundMoney(data.amounts.vatAmount),
            grandTotal: roundMoney(data.amounts.grossAmount),
            duePayable: roundMoney(data.amounts.grossAmount),
        },
        payment: {
            terms: "Zahlbar innerhalb von 7 Tagen ohne Abzug.",
            iban: data.company.bankIban ?? "",
            bic: data.company.bankBic ?? "",
            bankName: data.company.bankName ?? "",
        },
    };
}
