export type SaleBuyerType = "company" | "private";
export type SaleDeliveryType = "inland" | "eu" | "export_third_country";

export type SaleTaxConfiguration = {
    defaultVatRate: number;
    forceVatRate: boolean;
    showVatId: boolean;
    showTaxNumber: boolean;
    showCommercialRegister: boolean;
    vatIdLabel: string;
    hint: string;
};

type SaleTaxConfigurationInput = {
    buyerType?: SaleBuyerType | string | null;
    deliveryType?: SaleDeliveryType | string | null;
    billingCountry?: string | null;
};

export function normalizeSaleBuyerType(
    value: SaleTaxConfigurationInput["buyerType"],
): SaleBuyerType {
    return value === "private" ? "private" : "company";
}

export function normalizeSaleDeliveryType(
    value: SaleTaxConfigurationInput["deliveryType"],
): SaleDeliveryType {
    if (value === "eu" || value === "export_third_country") return value;

    return "inland";
}

export function normalizeVatId(value: string | null | undefined): string | null {
    const normalizedValue = value
        ?.trim()
        .toUpperCase()
        .replace(/[\s.-]+/g, "");

    return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
}

export function getSaleTaxConfiguration({
    buyerType,
    deliveryType,
}: SaleTaxConfigurationInput): SaleTaxConfiguration {
    const normalizedBuyerType = normalizeSaleBuyerType(buyerType);
    const normalizedDeliveryType = normalizeSaleDeliveryType(deliveryType);

    if (normalizedBuyerType === "private" && normalizedDeliveryType === "eu") {
        return {
            defaultVatRate: 19,
            forceVatRate: true,
            showVatId: false,
            showTaxNumber: false,
            showCommercialRegister: false,
            vatIdLabel: "USt-ID",
            hint: "Bei einer EU-Lieferung an eine Privatperson wird deutsche Mehrwertsteuer berechnet.",
        };
    }

    if (
        normalizedBuyerType === "private" &&
        normalizedDeliveryType === "export_third_country"
    ) {
        return {
            defaultVatRate: 0,
            forceVatRate: true,
            showVatId: false,
            showTaxNumber: false,
            showCommercialRegister: false,
            vatIdLabel: "USt-ID",
            hint: "Bei einem Drittlandexport wird die Rechnung vorbehaltlich des erforderlichen Ausfuhrnachweises ohne deutsche Mehrwertsteuer erstellt.",
        };
    }

    if (normalizedDeliveryType === "eu") {
        return {
            defaultVatRate: 0,
            forceVatRate: false,
            showVatId: normalizedBuyerType === "company",
            showTaxNumber: false,
            showCommercialRegister: false,
            vatIdLabel: "USt-ID | VAT | NIP",
            hint: "Bei einer EU-Lieferung an ein Unternehmen wird die Umsatzsteuer standardmäßig mit 0 % angesetzt. Die USt-ID muss geprüft und hinterlegt sein.",
        };
    }

    if (normalizedDeliveryType === "export_third_country") {
        return {
            defaultVatRate: 0,
            forceVatRate: false,
            showVatId: false,
            showTaxNumber: false,
            showCommercialRegister: false,
            vatIdLabel: "USt-ID",
            hint: "Drittlandexport: steuerfreie Ausfuhrlieferung möglich. Bitte Ausfuhrnachweise/Zollnachweise prüfen.",
        };
    }

    if (normalizedBuyerType === "private") {
        return {
            defaultVatRate: 19,
            forceVatRate: false,
            showVatId: false,
            showTaxNumber: false,
            showCommercialRegister: false,
            vatIdLabel: "USt-ID",
            hint: "Inlandsverkauf an eine Privatperson mit deutscher Umsatzsteuer.",
        };
    }

    return {
        defaultVatRate: 19,
        forceVatRate: false,
        showVatId: false,
        showTaxNumber: true,
        showCommercialRegister: false,
        vatIdLabel: "USt-ID",
        hint: "Inlandsverkauf mit deutscher Umsatzsteuer.",
    };
}
