"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentCompanyId } from "@/lib/company";
import {
    getInvoiceTypeDocumentType,
    getNextInvoiceNumber,
} from "@/lib/invoices/invoice-numbering";
import { assertCompanySignatureStampConfigured } from "@/lib/pdf/company-signature-assets";
import { generateAndStoreInvoicePdf } from "@/lib/pdf/invoice-storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SaleType } from "@/lib/sales/sale-queries";
import { logActivity } from "@/lib/activity/activity-log";
import { isValidPhoneNumber } from "@/lib/validation/phone";
import {
    normalizeEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";
import {
    uploadCustomerBzstEvidenceDocuments,
    validateCustomerBzstEvidenceFiles,
} from "@/lib/customers/customer-bzst-evidence-upload";
import { isAllowedArrivalPeriod } from "@/lib/sales/export-date-rules";
import {
    evaluateVehicleSaleEligibility,
    normalizeVinForSale,
} from "@/lib/sales/vehicle-sale-eligibility";
import {
    getSaleTaxConfiguration,
    normalizeVatId,
    type SaleBuyerType,
} from "@/utils/sale-tax-rules";
import { calculatePaymentStatus } from "@/utils/payment-utils";
import { getNextVehicleInternalNumber } from "@/lib/vehicles/vehicle-numbering";
import {
    getDuplicateInternalNumberMessage,
    getDuplicateVinMessage,
    translateVehicleDatabaseError,
} from "@/lib/vehicles/vehicle-save-errors";

type CreateSaleState = {
    success: boolean;
    message: string;
};

type UpdateSaleBuyerTaxDataCommand = {
    customerId: string;
    taxNumber: string | null;
    vatId: string | null;
};

type UpdateSaleBuyerTaxDataState = {
    success: boolean;
    message: string;
    taxNumber: string | null;
    vatId: string | null;
};

type SupabaseErrorLike = {
    code?: string;
    message: string;
};

type CustomerType = "company" | "private";
type SelectionMode = "existing" | "new";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeOptionalTextValue(value: string | null): string | null {
    const trimmedValue = value?.trim() ?? "";

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function isMissingVehicleIntakeColumn(error: SupabaseErrorLike | null | undefined): boolean {
    if (!error) return false;

    return (
        error.code === "PGRST204" &&
        (error.message.includes("'mileage' column") ||
            error.message.includes("'color' column") ||
            error.message.includes("'vehicle_category' column"))
    );
}

function getNumberValue(formData: FormData, key: string): number | null {
    const value = getStringValue(formData, key);

    if (!value) return null;

    const normalizedValue = value.replace(",", ".");
    const numberValue = Number(normalizedValue);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function getSaleTypeValue(formData: FormData): SaleType {
    const value = getStringValue(formData, "sale_type");

    if (
        value === "inland" ||
        value === "eu" ||
        value === "export_third_country"
    ) {
        return value;
    }

    return "inland";
}

async function getNextSalePaymentReference(companyId: string): Promise<string> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("next_sale_payment_reference", {
        target_company_id: companyId,
    });

    if (error || typeof data !== "string") {
        throw new Error("Zahlungsreferenz konnte nicht erzeugt werden.");
    }

    return data;
}

function requiresExportDetails(saleType: SaleType): boolean {
    return saleType === "eu" || saleType === "export_third_country";
}

function resolveVatRate({
                            formData,
                            saleType,
                            buyerType,
                            billingCountry,
                        }: {
    formData: FormData;
    saleType: SaleType;
    buyerType: SaleBuyerType;
    billingCountry?: string | null;
}): number {
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType,
        deliveryType: saleType,
        billingCountry,
    });

    if (taxConfiguration.forceVatRate) {
        return taxConfiguration.defaultVatRate;
    }

    const submittedVatRate = getNumberValue(formData, "vat_rate");

    if (submittedVatRate === null || submittedVatRate < 0 || submittedVatRate > 100) {
        return taxConfiguration.defaultVatRate;
    }

    return submittedVatRate;
}

function getNewCustomerType(formData: FormData): CustomerType {
    const value = getStringValue(formData, "new_customer_type");

    if (value === "company" || value === "private") {
        return value;
    }

    return "company";
}

function getSelectionMode(formData: FormData, key: string): SelectionMode {
    return getStringValue(formData, key) === "new" ? "new" : "existing";
}

function getNewCustomerEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(
        getStringValue(formData, "new_customer_preferred_language"),
    );
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

export async function updateSaleBuyerTaxDataAction(
    command: UpdateSaleBuyerTaxDataCommand,
): Promise<UpdateSaleBuyerTaxDataState> {
    const customerId = normalizeOptionalTextValue(command.customerId);
    const taxNumber = normalizeOptionalTextValue(command.taxNumber);
    const vatId = normalizeVatId(command.vatId);

    if (!customerId) {
        return {
            success: false,
            message: "Bitte wähle zuerst einen Käufer aus.",
            taxNumber,
            vatId,
        };
    }

    if (!taxNumber && !vatId) {
        return {
            success: false,
            message: "Bitte gib eine Steuernummer oder USt-IdNr. ein.",
            taxNumber,
            vatId,
        };
    }

    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id, type, company_name, first_name, last_name")
        .eq("id", customerId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (customerError || !customer) {
        return {
            success: false,
            message: "Der Käufer konnte nicht im aktuellen Unternehmen gefunden werden.",
            taxNumber,
            vatId,
        };
    }

    const { error } = await supabase
        .from("customers")
        .update({
            tax_number: taxNumber,
            vat_id: vatId,
        })
        .eq("id", customerId)
        .eq("company_id", companyId);

    if (error) {
        return {
            success: false,
            message: "Steuerdaten konnten nicht gespeichert werden. Bitte versuche es erneut.",
            taxNumber,
            vatId,
        };
    }

    const customerName =
        customer.type === "company"
            ? customer.company_name ?? "Unbekannte Firma"
            : [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
              "Unbekannte Privatperson";

    await logActivity({
        action: `Steuerdaten von ${customerName} im Verkaufsprozess aktualisiert`,
        entityType: "customer",
        entityId: customer.id as string,
    });

    revalidatePath("/dashboard/sales/new");
    revalidatePath(`/dashboard/customers/${customerId}`);
    revalidatePath("/dashboard/customers");

    return {
        success: true,
        message: "Steuerdaten wurden beim Käufer gespeichert. Du kannst den Verkauf jetzt speichern.",
        taxNumber,
        vatId,
    };
}

function addDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);

    return date.toISOString().slice(0, 10);
}

function getCreatedCustomerName({
                                    type,
                                    companyName,
                                    firstName,
                                    lastName,
                                }: {
    type: CustomerType;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
}): string {
    if (type === "company") {
        return companyName ?? "Unbekannte Firma";
    }

    return [firstName, lastName].filter(Boolean).join(" ") || "Unbekannte Privatperson";
}

function getVehicleActivityName(vehicle: {
    internal_number: string | null;
    manufacturer: string | null;
    model: string | null;
}): string {
    const name = [vehicle.internal_number, vehicle.manufacturer, vehicle.model]
        .filter(Boolean)
        .join(" · ")
        .trim();

    return name || "unbekanntes Fahrzeug";
}

async function getNextSaleNumber(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
): Promise<string> {
    const { data: rpcSaleNumber, error: rpcSaleNumberError } = await supabase.rpc(
        "next_sale_number",
        {
            target_company_id: companyId,
        },
    );

    if (!rpcSaleNumberError && typeof rpcSaleNumber === "string") {
        return rpcSaleNumber;
    }

    const { data, error } = await supabase
        .from("sales")
        .select("sale_number")
        .eq("company_id", companyId)
        .not("sale_number", "is", null);

    if (error) {
        throw new Error(`Verkaufsnummer konnte nicht geprüft werden: ${error.message}`);
    }

    const highestNumber = (data ?? []).reduce((highest, sale) => {
        if (typeof sale.sale_number !== "string") return highest;

        const match = sale.sale_number.match(/^VK-?(\d+)$/i);

        if (!match) return highest;

        const numberValue = Number(match[1]);

        if (!Number.isFinite(numberValue)) return highest;

        return Math.max(highest, numberValue);
    }, 0);

    return `VK-${highestNumber + 1}`;
}

async function createBuyerCustomerFromSaleForm(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
    formData: FormData,
    saleType: SaleType,
): Promise<
    | {
    success: true;
    customerId: string;
    customerName: string;
}
    | {
    success: false;
    message: string;
}
> {
    const type = getNewCustomerType(formData);

    const companyName = getStringValue(formData, "new_customer_company_name");
    const ownerName = getStringValue(formData, "new_customer_owner_name");
    const firstName = getStringValue(formData, "new_customer_first_name");
    const lastName = getStringValue(formData, "new_customer_last_name");

    const street = getStringValue(formData, "new_customer_street");
    const postalCode = getStringValue(formData, "new_customer_postal_code");
    const city = getStringValue(formData, "new_customer_city");
    const country = getStringValue(formData, "new_customer_country") ?? "Deutschland";

    const email = getStringValue(formData, "new_customer_email");
    const preferredLanguage = getNewCustomerEmailLanguage(formData);
    const phone = getStringValue(formData, "new_customer_phone");
    const rawVatId = getStringValue(formData, "new_customer_vat_id");
    const taxNumber = getStringValue(formData, "new_customer_tax_number");
    const commercialRegisterNumber = getStringValue(
        formData,
        "new_customer_commercial_register_number",
    );
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: type,
        deliveryType: saleType,
        billingCountry: country,
    });
    const vatId = type === "company" && rawVatId ? normalizeVatId(rawVatId) : null;
    const relevantTaxNumber = taxNumber;

    if (!street || !postalCode || !city) {
        return {
            success: false,
            message: "Bitte gib Straße, PLZ und Ort für den neuen Käufer ein.",
        };
    }

    if (type === "company" && !companyName) {
        return {
            success: false,
            message: "Bitte gib einen Firmennamen für den neuen Käufer ein.",
        };
    }

    if (type === "private" && (!firstName || !lastName)) {
        return {
            success: false,
            message: "Bitte gib Vorname und Nachname für den neuen Käufer ein.",
        };
    }

    if (taxConfiguration.showTaxNumber && !relevantTaxNumber) {
        return {
            success: false,
            message:
                "Für Inland-Verkäufe muss beim Kunden eine Steuernummer hinterlegt sein.",
        };
    }

    if (taxConfiguration.showVatId && !vatId) {
        return {
            success: false,
            message:
                "Für EU-Verkäufe muss beim Kunden eine USt-IdNr. hinterlegt sein.",
        };
    }

    if (!isValidPhoneNumber(phone)) {
        return {
            success: false,
            message: "Bitte gib eine gültige Telefonnummer ein.",
        };
    }

    const evidenceValidationError =
        type === "company" ? validateCustomerBzstEvidenceFiles(formData) : null;
    if (evidenceValidationError) {
        return {
            success: false,
            message: evidenceValidationError,
        };
    }

    const duplicateCustomer = await findDuplicateCustomer({
        supabase,
        companyId,
        type,
        companyName,
        firstName,
        lastName,
        email,
        phone,
        vatId,
        postalCode,
        city,
    });

    if (duplicateCustomer) {
        return {
            success: false,
            message:
                "Es gibt bereits einen möglichen passenden Kunden. Bitte wähle den bestehenden Kunden über die Suche aus oder prüfe die Stammdaten.",
        };
    }

    const { data: customer, error } = await supabase
        .from("customers")
        .insert({
            company_id: companyId,
            type,
            company_name: type === "company" ? companyName : null,
            owner_name: ownerName,
            first_name: type === "private" ? firstName : null,
            last_name: type === "private" ? lastName : null,
            street,
            postal_code: postalCode,
            city,
            country,
            email,
            preferred_language: preferredLanguage,
            phone,
            tax_number: relevantTaxNumber,
            vat_id: vatId,
            commercial_register_number:
                type === "company" ? commercialRegisterNumber : null,
            notes: "Direkt beim Verkauf angelegt.",
        })
        .select("id")
        .single();

    if (error || !customer) {
        return {
            success: false,
            message: `Neuer Käufer konnte nicht gespeichert werden: ${
                error?.message ?? "Keine Kunden-ID erhalten"
            }`,
        };
    }

    if (type === "company") {
        const evidenceUpload = await uploadCustomerBzstEvidenceDocuments({
            supabase,
            companyId,
            customerId: customer.id as string,
            formData,
        });

        if (!evidenceUpload.success) {
            return {
                success: false,
                message: `Neuer Käufer wurde angelegt, aber ${evidenceUpload.message}`,
            };
        }
    }

    return {
        success: true,
        customerId: customer.id as string,
        customerName: getCreatedCustomerName({
            type,
            companyName,
            firstName,
            lastName,
        }),
    };
}

async function validateBuyerCustomerFromSaleForm(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
    formData: FormData,
    saleType: SaleType,
): Promise<{ success: true } | { success: false; message: string }> {
    const type = getNewCustomerType(formData);
    const companyName = getStringValue(formData, "new_customer_company_name");
    const firstName = getStringValue(formData, "new_customer_first_name");
    const lastName = getStringValue(formData, "new_customer_last_name");
    const street = getStringValue(formData, "new_customer_street");
    const postalCode = getStringValue(formData, "new_customer_postal_code");
    const city = getStringValue(formData, "new_customer_city");
    const country = getStringValue(formData, "new_customer_country") ?? "Deutschland";
    const email = getStringValue(formData, "new_customer_email");
    const phone = getStringValue(formData, "new_customer_phone");
    const rawVatId = getStringValue(formData, "new_customer_vat_id");
    const taxNumber = getStringValue(formData, "new_customer_tax_number");
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: type,
        deliveryType: saleType,
        billingCountry: country,
    });
    const vatId = type === "company" && rawVatId ? normalizeVatId(rawVatId) : null;

    if (!street || !postalCode || !city) {
        return {
            success: false,
            message: "Bitte gib Straße, PLZ und Ort für den neuen Käufer ein.",
        };
    }

    if (type === "company" && !companyName) {
        return {
            success: false,
            message: "Bitte gib einen Firmennamen für den neuen Käufer ein.",
        };
    }

    if (type === "private" && (!firstName || !lastName)) {
        return {
            success: false,
            message: "Bitte gib Vorname und Nachname für den neuen Käufer ein.",
        };
    }

    if (taxConfiguration.showTaxNumber && !taxNumber) {
        return {
            success: false,
            message:
                "Für Inland-Verkäufe muss beim Kunden eine Steuernummer hinterlegt sein.",
        };
    }

    if (taxConfiguration.showVatId && !vatId) {
        return {
            success: false,
            message:
                "Für EU-Verkäufe muss beim Kunden eine USt-IdNr. hinterlegt sein.",
        };
    }

    if (!isValidPhoneNumber(phone)) {
        return {
            success: false,
            message: "Bitte gib eine gültige Telefonnummer ein.",
        };
    }

    const evidenceValidationError =
        type === "company" ? validateCustomerBzstEvidenceFiles(formData) : null;
    if (evidenceValidationError) {
        return {
            success: false,
            message: evidenceValidationError,
        };
    }

    const duplicateCustomer = await findDuplicateCustomer({
        supabase,
        companyId,
        type,
        companyName,
        firstName,
        lastName,
        email,
        phone,
        vatId,
        postalCode,
        city,
    });

    if (duplicateCustomer) {
        return {
            success: false,
            message:
                "Es gibt bereits einen möglichen passenden Kunden. Bitte wähle den bestehenden Kunden über die Suche aus oder prüfe die Stammdaten.",
        };
    }

    return { success: true };
}

async function findDuplicateCustomer({
    supabase,
    companyId,
    type,
    companyName,
    firstName,
    lastName,
    email,
    phone,
    vatId,
    postalCode,
    city,
}: {
    supabase: ReturnType<typeof createServerSupabaseClient>;
    companyId: string;
    type: CustomerType;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    vatId: string | null;
    postalCode: string | null;
    city: string | null;
}): Promise<boolean> {
    async function hasMatch(
        query: PromiseLike<{ data: { id: string }[] | null }>,
    ): Promise<boolean> {
        const { data } = await query;

        return (data ?? []).length > 0;
    }

    if (vatId) {
        if (
            await hasMatch(
            supabase
                .from("customers")
                .select("id")
                .eq("company_id", companyId)
                .eq("vat_id", vatId)
                .limit(1),
            )
        ) {
            return true;
        }
    }

    if (email) {
        if (
            await hasMatch(
            supabase
                .from("customers")
                .select("id")
                .eq("company_id", companyId)
                .ilike("email", email)
                .limit(1),
            )
        ) {
            return true;
        }
    }

    if (phone) {
        if (
            await hasMatch(
            supabase
                .from("customers")
                .select("id")
                .eq("company_id", companyId)
                .eq("phone", phone)
                .limit(1),
            )
        ) {
            return true;
        }
    }

    if (type === "company" && companyName && postalCode && city) {
        if (
            await hasMatch(
            supabase
                .from("customers")
                .select("id")
                .eq("company_id", companyId)
                .eq("type", "company")
                .ilike("company_name", companyName)
                .eq("postal_code", postalCode)
                .ilike("city", city)
                .limit(1),
            )
        ) {
            return true;
        }
    }

    if (type === "private" && firstName && lastName && postalCode && city) {
        if (
            await hasMatch(
            supabase
                .from("customers")
                .select("id")
                .eq("company_id", companyId)
                .eq("type", "private")
                .ilike("first_name", firstName)
                .ilike("last_name", lastName)
                .eq("postal_code", postalCode)
                .ilike("city", city)
                .limit(1),
            )
        ) {
            return true;
        }
    }

    return false;
}

async function createVehicleFromSaleForm(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
    formData: FormData,
): Promise<{ success: true; vehicleId: string; vehicleName: string } | { success: false; message: string }> {
    const submittedInternalNumber = getStringValue(formData, "new_vehicle_internal_number");
    const manufacturer = getStringValue(formData, "new_vehicle_manufacturer");
    const model = getStringValue(formData, "new_vehicle_model");
    const vehicleType = getStringValue(formData, "new_vehicle_vehicle_type");
    const vin = getStringValue(formData, "new_vehicle_vin");
    const normalizedVin = vin ? normalizeVinForSale(vin) : null;
    const constructionYear = getNumberValue(formData, "new_vehicle_construction_year");
    const mileage = getNumberValue(formData, "new_vehicle_mileage");
    const color = getStringValue(formData, "new_vehicle_color");
    const vehicleCategory = getStringValue(formData, "new_vehicle_vehicle_category");
    const licensePlate = getStringValue(formData, "new_vehicle_license_plate");
    const purchasePriceNet = getNumberValue(formData, "new_vehicle_purchase_price_net");
    const additionalCostsNet =
        getNumberValue(formData, "new_vehicle_additional_costs_net") ?? 0;
    const notes = getStringValue(formData, "new_vehicle_notes");
    const damageNotes = getStringValue(formData, "new_vehicle_damage_notes");
    const showDamageOnInvoice =
        Boolean(damageNotes?.trim()) &&
        getStringValue(formData, "new_vehicle_show_damage_on_invoice") === "yes";

    if (!manufacturer || !model || !vehicleType || !normalizedVin) {
        return {
            success: false,
            message: "Bitte fülle Hersteller, Modell, Fahrzeugtyp und VIN für das neue Fahrzeug aus.",
        };
    }

    if (purchasePriceNet === null) {
        return {
            success: false,
            message: "Bitte gib für das neue Fahrzeug einen gültigen Einkaufspreis netto ein.",
        };
    }

    const internalNumber =
        submittedInternalNumber ?? (await getNextVehicleInternalNumber());

    const { data: duplicateVinVehicle, error: duplicateVinError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("vin", normalizedVin)
        .limit(1);

    if (duplicateVinError) {
        console.error("[sale-create] vehicle VIN duplicate check failed", duplicateVinError);
    }

    if ((duplicateVinVehicle ?? []).length > 0) {
        return { success: false, message: getDuplicateVinMessage() };
    }

    const { data: duplicateInternalNumberVehicle } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("internal_number", internalNumber)
        .limit(1);

    if ((duplicateInternalNumberVehicle ?? []).length > 0) {
        return { success: false, message: getDuplicateInternalNumberMessage() };
    }

    const baseVehicleInsertData = {
        company_id: companyId,
        internal_number: internalNumber,
        manufacturer,
        model,
        vehicle_type: vehicleType,
        construction_year: constructionYear,
        first_registration: null,
        vin: normalizedVin,
        license_plate: licensePlate,
        purchase_price_net: purchasePriceNet,
        sale_price_net: null,
        additional_costs_net: additionalCostsNet,
        status: "in_stock",
        seller_customer_id: null,
        buyer_customer_id: null,
        notes,
        damage_notes: damageNotes,
        show_damage_on_invoice: showDamageOnInvoice,
    };

    let { data: vehicle, error } = await supabase
        .from("vehicles")
        .insert({
            ...baseVehicleInsertData,
            mileage,
            color,
            vehicle_category: vehicleCategory,
        })
        .select("id, internal_number, manufacturer, model")
        .single();

    if (error && isMissingVehicleIntakeColumn(error)) {
        console.warn(
            "[sale-create] vehicle intake columns missing; retrying inline vehicle insert without optional intake fields",
        );
        const fallbackResult = await supabase
            .from("vehicles")
            .insert(baseVehicleInsertData)
            .select("id, internal_number, manufacturer, model")
            .single();
        vehicle = fallbackResult.data;
        error = fallbackResult.error;
    }

    if (error || !vehicle) {
        if (error) console.error("[sale-create] inline vehicle insert failed", error);

        return {
            success: false,
            message: error
                ? translateVehicleDatabaseError(error)
                : "Das neue Fahrzeug konnte nicht gespeichert werden.",
        };
    }

    const vehicleName = getVehicleActivityName(vehicle);

    await logActivity({
        action: `Fahrzeug ${vehicleName} direkt beim Verkauf angelegt`,
        entityType: "vehicle",
        entityId: vehicle.id as string,
    });

    return {
        success: true,
        vehicleId: vehicle.id as string,
        vehicleName,
    };
}

async function validateVehicleFromSaleForm(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
    formData: FormData,
): Promise<{ success: true } | { success: false; message: string }> {
    const submittedInternalNumber = getStringValue(formData, "new_vehicle_internal_number");
    const manufacturer = getStringValue(formData, "new_vehicle_manufacturer");
    const model = getStringValue(formData, "new_vehicle_model");
    const vehicleType = getStringValue(formData, "new_vehicle_vehicle_type");
    const vin = getStringValue(formData, "new_vehicle_vin");
    const normalizedVin = vin ? normalizeVinForSale(vin) : null;
    const purchasePriceNet = getNumberValue(formData, "new_vehicle_purchase_price_net");

    if (!manufacturer || !model || !vehicleType || !normalizedVin) {
        return {
            success: false,
            message: "Bitte fülle Hersteller, Modell, Fahrzeugtyp und VIN für das neue Fahrzeug aus.",
        };
    }

    if (purchasePriceNet === null) {
        return {
            success: false,
            message: "Bitte gib für das neue Fahrzeug einen gültigen Einkaufspreis netto ein.",
        };
    }

    const internalNumber =
        submittedInternalNumber ?? (await getNextVehicleInternalNumber());

    const { data: duplicateVinVehicle, error: duplicateVinError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("vin", normalizedVin)
        .limit(1);

    if (duplicateVinError) {
        console.error("[sale-create] vehicle VIN duplicate preflight failed", duplicateVinError);
    }

    if ((duplicateVinVehicle ?? []).length > 0) {
        return { success: false, message: getDuplicateVinMessage() };
    }

    const { data: duplicateInternalNumberVehicle } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("internal_number", internalNumber)
        .limit(1);

    if ((duplicateInternalNumberVehicle ?? []).length > 0) {
        return { success: false, message: getDuplicateInternalNumberMessage() };
    }

    return { success: true };
}

async function cleanupInlineSaleCreation({
    supabase,
    companyId,
    saleId,
    createdVehicleId,
    createdCustomerId,
}: {
    supabase: ReturnType<typeof createServerSupabaseClient>;
    companyId: string;
    saleId?: string | null;
    createdVehicleId?: string | null;
    createdCustomerId?: string | null;
}) {
    if (saleId) {
        const { error } = await supabase
            .from("sales")
            .delete()
            .eq("id", saleId)
            .eq("company_id", companyId);

        if (error) {
            console.error("[sale-create] cleanup sale failed", error);
        }
    }

    if (createdVehicleId) {
        const { error } = await supabase
            .from("vehicles")
            .delete()
            .eq("id", createdVehicleId)
            .eq("company_id", companyId)
            .eq("status", "in_stock");

        if (error) {
            console.error("[sale-create] cleanup inline vehicle failed", error);
        }
    }

    if (createdCustomerId) {
        const { error } = await supabase
            .from("customers")
            .delete()
            .eq("id", createdCustomerId)
            .eq("company_id", companyId);

        if (error) {
            console.error("[sale-create] cleanup inline customer failed", error);
        }
    }
}

export async function createSaleAction(
    _previousState: CreateSaleState,
    formData: FormData,
): Promise<CreateSaleState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    let vehicleId = getStringValue(formData, "vehicle_id");
    let buyerCustomerId = getStringValue(formData, "buyer_customer_id");
    let createdInlineVehicleId: string | null = null;
    let createdInlineCustomerId: string | null = null;

    const buyerMode = getStringValue(formData, "buyer_mode") ?? "existing";
    const vehicleMode = getSelectionMode(formData, "vehicle_mode");
    const saleDate = getStringValue(formData, "sale_date");
    const saleType = getSaleTypeValue(formData);
    const netAmount = getNumberValue(formData, "net_amount");
    const newCustomerType = getNewCustomerType(formData);
    const notes = getStringValue(formData, "notes");
    const requestedIncludeDamageNotesOnInvoice =
        getStringValue(formData, "include_damage_notes_on_invoice") === "yes";
    const includeSignatureStamp =
        getStringValue(formData, "include_signature_stamp") === "yes";

    const exportDestinationCity = getStringValue(
        formData,
        "export_destination_city",
    );
    const exportDestinationCountry = getStringValue(
        formData,
        "export_destination_country",
    );
    const exportArrivalMonth = getStringValue(formData, "export_arrival_month");
    const exportArrivalYear = getStringValue(formData, "export_arrival_year");
    const exportTransportDate = getStringValue(formData, "export_transport_date");
    const exportTransportType = getStringValue(formData, "export_transport_type");
    const exportReceiverName = getStringValue(formData, "export_receiver_name");

    const shouldCreateInvoice =
        getStringValue(formData, "create_invoice") === "yes";

    if (shouldCreateInvoice && includeSignatureStamp) {
        try {
            await assertCompanySignatureStampConfigured();
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Bitte hinterlege zuerst Unterschrift und Firmenstempel in den Einstellungen.",
            };
        }
    }

    const shouldCreateCashbookEntry =
        getStringValue(formData, "create_cashbook_entry") === "yes";

    const paymentMethod = getStringValue(formData, "payment_method") ?? "bank";

    if (paymentMethod !== "bank" && paymentMethod !== "cash") {
        return {
            success: false,
            message: "Bitte wähle eine gültige Zahlungsart aus.",
        };
    }

    if (!saleDate) {
        return {
            success: false,
            message: "Bitte wähle ein Verkaufsdatum aus.",
        };
    }

    if (netAmount === null || netAmount <= 0) {
        return {
            success: false,
            message: "Bitte gib einen gültigen Verkaufspreis netto ein.",
        };
    }

    if (buyerMode === "new") {
        const customerPreflight = await validateBuyerCustomerFromSaleForm(
            supabase,
            companyId,
            formData,
            saleType,
        );

        if (!customerPreflight.success) {
            return {
                success: false,
                message: customerPreflight.message,
            };
        }
    } else {
        if (!buyerCustomerId) {
            return {
                success: false,
                message: "Bitte wähle einen Käufer aus oder lege einen neuen Käufer an.",
            };
        }

        const { data: buyerCustomerPreflight, error: buyerCustomerPreflightError } =
            await supabase
                .from("customers")
                .select("type, tax_number, vat_id, country")
                .eq("id", buyerCustomerId)
                .eq("company_id", companyId)
                .single();

        if (buyerCustomerPreflightError || !buyerCustomerPreflight) {
            return {
                success: false,
                message: `Käufer konnte nicht geladen werden: ${
                    buyerCustomerPreflightError?.message ?? "Nicht gefunden"
                }`,
            };
        }

        const buyerPreflightType = buyerCustomerPreflight.type as SaleBuyerType;
        const taxPreflightConfiguration = getSaleTaxConfiguration({
            buyerType: buyerPreflightType,
            deliveryType: saleType,
            billingCountry: buyerCustomerPreflight.country,
        });

        if (taxPreflightConfiguration.showTaxNumber && !buyerCustomerPreflight.tax_number) {
            return {
                success: false,
                message:
                    "Für Inland-Verkäufe muss beim Kunden eine Steuernummer hinterlegt sein.",
            };
        }

        if (taxPreflightConfiguration.showVatId && !buyerCustomerPreflight.vat_id) {
            return {
                success: false,
                message:
                    "Für EU-Verkäufe muss beim Kunden eine USt-IdNr. hinterlegt sein.",
            };
        }
    }

    if (vehicleMode === "new") {
        const vehiclePreflight = await validateVehicleFromSaleForm(
            supabase,
            companyId,
            formData,
        );

        if (!vehiclePreflight.success) {
            return {
                success: false,
                message: vehiclePreflight.message,
            };
        }
    }

    if (vehicleMode === "new") {
        const createdVehicle = await createVehicleFromSaleForm(
            supabase,
            companyId,
            formData,
        );

        if (!createdVehicle.success) {
            return {
                success: false,
                message: createdVehicle.message,
            };
        }

        vehicleId = createdVehicle.vehicleId;
        createdInlineVehicleId = createdVehicle.vehicleId;
    }

    if (!vehicleId) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: "Bitte wähle ein Fahrzeug aus oder lege ein neues Fahrzeug an.",
        };
    }

    const { data: vehicleData, error: vehicleLoadError } = await supabase
        .from("vehicles")
        .select("id, internal_number, manufacturer, model, status, damage_notes, show_damage_on_invoice")
        .eq("id", vehicleId)
        .eq("company_id", companyId)
        .single();

    if (vehicleLoadError || !vehicleData) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: `Fahrzeug konnte nicht geladen werden: ${
                vehicleLoadError?.message ?? "Nicht gefunden"
            }`,
        };
    }

    const vehicleEligibility = evaluateVehicleSaleEligibility(vehicleData.status);

    if (!vehicleEligibility.eligible) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                vehicleEligibility.reason ??
                "Dieses Fahrzeug ist im aktuellen Status nicht verkaufsfähig.",
        };
    }

    const { data: existingActiveSale, error: existingActiveSaleError } = await supabase
        .from("sales")
        .select("id")
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .eq("status", "active")
        .limit(1);

    if (existingActiveSaleError) {
        console.error("[sale-create] active sale check failed", existingActiveSaleError);
    }

    if ((existingActiveSale ?? []).length > 0) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                "Das ausgewählte Fahrzeug ist bereits einem aktiven Verkauf zugeordnet.",
        };
    }

    if (buyerMode === "new") {
        const createdCustomer = await createBuyerCustomerFromSaleForm(
            supabase,
            companyId,
            formData,
            saleType,
        );

        if (!createdCustomer.success) {
            await cleanupInlineSaleCreation({
                supabase,
                companyId,
                createdVehicleId: createdInlineVehicleId,
                createdCustomerId: createdInlineCustomerId,
            });
            return {
                success: false,
                message: createdCustomer.message,
            };
        }

        buyerCustomerId = createdCustomer.customerId;
        createdInlineCustomerId = createdCustomer.customerId;

        await logActivity({
            action: `Kunde ${createdCustomer.customerName} direkt beim Verkauf angelegt`,
            entityType: "customer",
            entityId: createdCustomer.customerId,
        });
    }

    if (!buyerCustomerId) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: "Bitte wähle einen Käufer aus oder lege einen neuen Käufer an.",
        };
    }

    const { data: buyerCustomer, error: buyerCustomerLoadError } = await supabase
        .from("customers")
        .select("type, tax_number, vat_id, city, country")
        .eq("id", buyerCustomerId)
        .eq("company_id", companyId)
        .single();

    if (buyerCustomerLoadError || !buyerCustomer) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: `Käufer konnte nicht geladen werden: ${
                buyerCustomerLoadError?.message ?? "Nicht gefunden"
            }`,
        };
    }

    const buyerType =
        buyerMode === "new" ? newCustomerType : (buyerCustomer.type as SaleBuyerType);
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType,
        deliveryType: saleType,
        billingCountry: buyerCustomer.country,
    });
    const vatRate = resolveVatRate({
        formData,
        saleType,
        buyerType,
        billingCountry: buyerCustomer.country,
    });

    if (taxConfiguration.showTaxNumber && !buyerCustomer.tax_number) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                "Für Inland-Verkäufe muss beim Kunden eine Steuernummer hinterlegt sein.",
        };
    }

    if (taxConfiguration.showVatId && !buyerCustomer.vat_id) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                "Für EU-Verkäufe muss beim Kunden eine USt-IdNr. hinterlegt sein.",
        };
    }

    if (!saleDate) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: "Bitte wähle ein Verkaufsdatum aus.",
        };
    }

    const finalExportDestinationCity =
        exportDestinationCity ?? buyerCustomer.city ?? null;
    const finalExportDestinationCountry =
        exportDestinationCountry ?? buyerCustomer.country ?? null;

    if (
        requiresExportDetails(saleType) &&
        (!finalExportDestinationCity ||
            !finalExportDestinationCountry ||
            !exportArrivalMonth ||
            !exportArrivalYear ||
            !exportTransportDate ||
            !exportTransportType ||
            !exportReceiverName)
    ) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                "Bitte fülle alle Export-/EU-Lieferdaten aus. Zielort und Zielland können aus der Rechnungsadresse übernommen werden.",
        };
    }

    if (
        requiresExportDetails(saleType) &&
        !isAllowedArrivalPeriod({
            saleDate,
            month: exportArrivalMonth,
            year: exportArrivalYear,
        })
    ) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                "Der Monat des Gelangens darf nur der Verkaufsmonat oder der unmittelbar folgende Monat sein.",
        };
    }

    if (netAmount === null || netAmount <= 0) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: "Bitte gib einen gültigen Verkaufspreis netto ein.",
        };
    }

    const vatAmount = roundMoney(netAmount * (vatRate / 100));
    const grossAmount = roundMoney(netAmount + vatAmount);
    const includeDamageNotesOnInvoice =
        requestedIncludeDamageNotesOnInvoice &&
        Boolean(vehicleData.show_damage_on_invoice) &&
        Boolean(vehicleData.damage_notes?.trim());

    let saleNumber: string;

    try {
        saleNumber = await getNextSaleNumber(supabase, companyId);
    } catch (error) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Verkaufsnummer konnte nicht erzeugt werden.",
        };
    }

    const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
            company_id: companyId,
            sale_number: saleNumber,
            vehicle_id: vehicleId,
            buyer_customer_id: buyerCustomerId,
            sale_date: saleDate,
            sale_type: saleType,
            net_amount: netAmount,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            gross_amount: grossAmount,
            status: "active",
            payment_status: shouldCreateCashbookEntry ? "paid" : "open",
            document_check_status: "missing",
            datev_status: "not_sent",
            notes,
            invoice_notes: null,
            include_damage_notes_on_invoice: includeDamageNotesOnInvoice,

            export_destination_city: finalExportDestinationCity,
            export_destination_country: finalExportDestinationCountry,
            export_arrival_month: exportArrivalMonth,
            export_arrival_year: exportArrivalYear,
            export_transport_date: exportTransportDate,
            export_transport_type: exportTransportType,
            export_receiver_name: exportReceiverName,
        })
        .select("id")
        .single();

    if (saleError || !sale) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: `Verkauf konnte nicht gespeichert werden: ${
                saleError?.message ?? "Keine Verkaufs-ID erhalten"
            }`,
        };
    }

    const saleId = sale.id as string;
    const vehicleActivityName = getVehicleActivityName(vehicleData);

    await logActivity({
        action: `Verkauf ${saleNumber} für ${vehicleActivityName} angelegt`,
        entityType: "sale",
        entityId: saleId,
    });

    const { data: updatedVehicle, error: vehicleUpdateError } = await supabase
        .from("vehicles")
        .update({
            status: "sold",
            buyer_customer_id: buyerCustomerId,
            sale_price_net: netAmount,
        })
        .eq("id", vehicleId)
        .eq("company_id", companyId)
        .in("status", ["in_stock", "reserved"])
        .select("id")
        .maybeSingle();

    if (vehicleUpdateError || !updatedVehicle) {
        await cleanupInlineSaleCreation({
            supabase,
            companyId,
            saleId,
            createdVehicleId: createdInlineVehicleId,
            createdCustomerId: createdInlineCustomerId,
        });
        return {
            success: false,
            message: vehicleUpdateError
                ? `Verkauf wurde gespeichert, aber Fahrzeugstatus konnte nicht aktualisiert werden: ${vehicleUpdateError.message}`
                : "Das Fahrzeug wurde zwischenzeitlich geändert. Bitte prüfe die Verkaufsakte und den Fahrzeugstatus.",
        };
    }

    let invoiceId: string | null = null;
    let invoiceNumber: string | null = null;
    let invoiceDocumentId: string | null = null;

    if (shouldCreateInvoice) {
        try {
            invoiceNumber = await getNextInvoiceNumber({
                invoiceType: "standard",
                invoiceDate: saleDate,
            });
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Rechnungsnummer konnte nicht erzeugt werden.",
            };
        }

        const { data: invoice, error: invoiceError } = await supabase
            .from("invoices")
            .insert({
                company_id: companyId,
                sale_id: saleId,
                customer_id: buyerCustomerId,
                vehicle_id: vehicleId,
                invoice_type: "standard",
                invoice_number: invoiceNumber,
                invoice_date: saleDate,
                due_date: addDays(saleDate, 7),
                net_amount: netAmount,
                vat_rate: vatRate,
                vat_amount: vatAmount,
                gross_amount: grossAmount,
                status: shouldCreateCashbookEntry ? "paid" : "created",
                payment_status: shouldCreateCashbookEntry ? "paid" : "open",
                datev_status: "not_sent",
                include_signature_stamp: includeSignatureStamp,
                paid_at: shouldCreateCashbookEntry ? new Date().toISOString() : null,
            })
            .select("id")
            .single();

        if (invoiceError || !invoice) {
            return {
                success: false,
                message: `Verkauf wurde gespeichert, aber Rechnung konnte nicht erzeugt werden: ${
                    invoiceError?.message ?? "Keine Rechnungs-ID erhalten"
                }`,
            };
        }

        const createdInvoiceId = invoice.id as string;
        invoiceId = createdInvoiceId;

        await logActivity({
            action: `Rechnung ${invoiceNumber} für Verkauf ${saleNumber} erzeugt`,
            entityType: "invoice",
            entityId: createdInvoiceId,
        });

        const invoiceFileName = `rechnung-${invoiceNumber}.pdf`;
        const invoiceFilePath = `invoices/${invoiceFileName}`;

        const { data: invoiceDocument, error: documentError } = await supabase
            .from("documents")
            .insert({
                company_id: companyId,
                document_type: getInvoiceTypeDocumentType("standard"),
                source: "generated",
                status: "needs_review",
                file_name: invoiceFileName,
                file_path: invoiceFilePath,
                mime_type: "application/pdf",
                file_size: null,
                customer_id: buyerCustomerId,
                vehicle_id: vehicleId,
                sale_id: saleId,
                invoice_id: createdInvoiceId,
                generated_by_system: true,
            })
            .select("id")
            .single();

        if (documentError || !invoiceDocument) {
            return {
                success: false,
                message: `Rechnung wurde erzeugt, aber Dokument konnte nicht angelegt werden: ${
                    documentError?.message ?? "Keine Dokument-ID erhalten"
                }`,
            };
        }

        const createdInvoiceDocumentId = invoiceDocument.id as string;
        invoiceDocumentId = createdInvoiceDocumentId;

        const { error: invoiceDocumentLinkError } = await supabase
            .from("invoices")
            .update({
                pdf_document_id: createdInvoiceDocumentId,
            })
            .eq("id", createdInvoiceId)
            .eq("company_id", companyId);

        if (invoiceDocumentLinkError) {
            return {
                success: false,
                message: `Dokument wurde angelegt, aber nicht mit der Rechnung verknüpft: ${invoiceDocumentLinkError.message}`,
            };
        }

        try {
            const storedPdf = await generateAndStoreInvoicePdf(createdInvoiceId);

            const { error: documentUpdateError } = await supabase
                .from("documents")
                .update({
                    status: "available",
                    file_name: storedPdf.fileName,
                    file_path: storedPdf.filePath,
                    file_size: storedPdf.fileSize,
                })
                .eq("id", createdInvoiceDocumentId)
                .eq("company_id", companyId);

            if (documentUpdateError) {
                return {
                    success: false,
                    message: `PDF wurde gespeichert, aber Dokumentdaten konnten nicht aktualisiert werden: ${documentUpdateError.message}`,
                };
            }
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "PDF konnte nicht im Storage gespeichert werden.",
            };
        }
    }

    if (shouldCreateCashbookEntry) {
        let paymentReference: string;

        try {
            paymentReference = await getNextSalePaymentReference(companyId);
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Zahlungsreferenz konnte nicht erzeugt werden.",
            };
        }

        const { data: salePayment, error: salePaymentError } = await supabase
            .from("sale_payments")
            .insert({
                company_id: companyId,
                sale_id: saleId,
                payment_reference: paymentReference,
                amount: grossAmount,
                payment_method: paymentMethod,
                payment_date: saleDate,
                note: invoiceNumber
                    ? `Erstzahlung zu Rechnung ${invoiceNumber}`
                    : `Erstzahlung zu Verkauf ${saleNumber}`,
                external_reference: "sale-create-flow",
            })
            .select("id")
            .single();

        if (salePaymentError || !salePayment) {
            return {
                success: false,
                message: `Verkauf wurde gespeichert, aber Zahlung konnte nicht erzeugt werden: ${
                    salePaymentError?.message ?? "Keine Zahlungs-ID erhalten"
                }`,
            };
        }

        const { error: paymentAuditError } = await supabase
            .from("sale_payment_audit_log")
            .insert({
                company_id: companyId,
                payment_id: salePayment.id,
                sale_id: saleId,
                action: "CREATED",
                previous_values: null,
                new_values: {
                    payment_reference: paymentReference,
                    amount: grossAmount,
                    payment_method: paymentMethod,
                    payment_date: saleDate,
                    external_reference: "sale-create-flow",
                },
                reason: "sale-create-flow",
            });

        if (paymentAuditError) {
            return {
                success: false,
                message: `Verkauf wurde gespeichert, aber Zahlungs-Audit konnte nicht erzeugt werden: ${paymentAuditError.message}`,
            };
        }

        const calculatedPaymentStatus = calculatePaymentStatus(grossAmount, [
            { amount: grossAmount },
        ]);

        await supabase
            .from("sales")
            .update({ payment_status: calculatedPaymentStatus })
            .eq("id", saleId)
            .eq("company_id", companyId);

        const description = invoiceNumber
            ? `Zahlung Rechnung ${invoiceNumber}`
            : `Zahlung Verkauf ${saleNumber}`;

        const { data: cashbookEntry, error: cashbookError } = await supabase
            .from("cashbook_entries")
            .insert({
                company_id: companyId,
                entry_type: "income",
                category: "vehicle_sale",
                payment_method: paymentMethod,
                amount: grossAmount,
                booking_date: saleDate,
                description,
                customer_id: buyerCustomerId,
                vehicle_id: vehicleId,
                sale_id: saleId,
                invoice_id: invoiceId,
                document_id: invoiceDocumentId,
            })
            .select("id")
            .single();

        if (cashbookError || !cashbookEntry) {
            return {
                success: false,
                message: `Verkauf wurde gespeichert, aber Kassenbuch konnte nicht erzeugt werden: ${
                    cashbookError?.message ?? "Keine Kassenbuch-ID erhalten"
                }`,
            };
        }

        await logActivity({
            action: `Kassenbuch-Eintrag für Verkauf ${saleNumber} erstellt`,
            entityType: "cashbook",
            entityId: cashbookEntry.id as string,
        });
    }

    if (invoiceNumber && invoiceId) {
        redirect(
            `/dashboard/sales/${saleId}?invoiceCreated=${encodeURIComponent(
                invoiceNumber,
            )}&highlightInvoiceId=${invoiceId}`,
        );
    }

    redirect(`/dashboard/sales/${saleId}`);
}
