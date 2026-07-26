"use server";

import { redirect } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidPhoneNumber } from "@/lib/validation/phone";
import {
    normalizeEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";
import {
    uploadCustomerBzstEvidenceDocuments,
    validateCustomerBzstEvidenceFiles,
} from "@/lib/customers/customer-bzst-evidence-upload";

type CreateCustomerState = {
    success: boolean;
    message: string;
};

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getCustomerName({
                             type,
                             companyName,
                             firstName,
                             lastName,
                         }: {
    type: "company" | "private";
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
}): string {
    if (type === "company") {
        return companyName ?? "Unbekannte Firma";
    }

    return [firstName, lastName].filter(Boolean).join(" ") || "Unbekannte Privatperson";
}

function getEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(getStringValue(formData, "preferred_language"));
}

export async function createCustomerAction(
    _previousState: CreateCustomerState,
    formData: FormData,
): Promise<CreateCustomerState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const type = getStringValue(formData, "type");

    if (type !== "company" && type !== "private") {
        return {
            success: false,
            message: "Bitte wähle einen gültigen Kundentyp aus.",
        };
    }

    const companyName = type === "company" ? getStringValue(formData, "company_name") : null;
    const ownerName = type === "company" ? getStringValue(formData, "owner_name") : null;
    const firstName = type === "private" ? getStringValue(formData, "first_name") : null;
    const lastName = type === "private" ? getStringValue(formData, "last_name") : null;

    const street = getStringValue(formData, "street");
    const postalCode = getStringValue(formData, "postal_code");
    const city = getStringValue(formData, "city");
    const country = getStringValue(formData, "country") ?? "Deutschland";

    const email = getStringValue(formData, "email");
    const preferredLanguage = getEmailLanguage(formData);
    const phone = getStringValue(formData, "phone");
    const taxNumber = getStringValue(formData, "tax_number");
    const vatId = type === "company" ? getStringValue(formData, "vat_id") : null;
    const commercialRegisterNumber = getStringValue(
        formData,
        "commercial_register_number",
    );
    const notes = getStringValue(formData, "notes");

    if (!street || !postalCode || !city) {
        return {
            success: false,
            message: "Adresse, PLZ und Ort sind Pflichtfelder.",
        };
    }

    if (type === "company" && !companyName) {
        return {
            success: false,
            message: "Bitte gib einen Firmennamen ein.",
        };
    }

    if (type === "private" && (!firstName || !lastName)) {
        return {
            success: false,
            message: "Bitte gib Vorname und Nachname ein.",
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

    const { data: customer, error } = await supabase
        .from("customers")
        .insert({
            company_id: companyId,
            type,
            company_name: companyName,
            owner_name: ownerName,
            first_name: firstName,
            last_name: lastName,
            street,
            postal_code: postalCode,
            city,
            country,
            email,
            preferred_language: preferredLanguage,
            phone,
            tax_number: taxNumber,
            vat_id: vatId,
            commercial_register_number:
                type === "company" ? commercialRegisterNumber : null,
            notes,
        })
        .select("id")
        .single();

    if (error || !customer) {
        return {
            success: false,
            message: `Kunde konnte nicht gespeichert werden: ${
                error?.message ?? "Keine Kunden-ID erhalten"
            }`,
        };
    }

    const customerName = getCustomerName({
        type,
        companyName,
        firstName,
        lastName,
    });

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
                message: `Kunde wurde angelegt, aber ${evidenceUpload.message}`,
            };
        }
    }

    await logActivity({
        action: `Kunde ${customerName} angelegt`,
        entityType: "customer",
        entityId: customer.id as string,
    });

    redirect(
        `/dashboard/customers?customerCreated=1&createdCustomerId=${customer.id}`,
    );
}
