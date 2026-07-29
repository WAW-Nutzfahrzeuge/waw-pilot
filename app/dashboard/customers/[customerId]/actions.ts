"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidPhoneNumber } from "@/lib/validation/phone";
import {
    normalizeEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function hasFormField(formData: FormData, key: string): boolean {
    return formData.has(key);
}

function getCustomerDisplayName(customer: {
    type: "company" | "private";
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
}) {
    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    return [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Unbekannte Privatperson";
}

function getEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(getStringValue(formData, "preferred_language"));
}

function getSafeDashboardRedirectPath(value: string | null, fallback: string): string {
    if (!value) return fallback;
    if (!value.startsWith("/dashboard/") || value.startsWith("//") || value.includes("://")) {
        return fallback;
    }

    return value;
}

export async function updateCustomerMasterDataAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const customerId = getStringValue(formData, "customer_id");

    if (!customerId) {
        throw new Error("Kunde fehlt.");
    }

    const { data: existingCustomer } = await supabase
        .from("customers")
        .select("type, company_name, first_name, last_name")
        .eq("id", customerId)
        .eq("company_id", companyId)
        .maybeSingle();

    const street = getStringValue(formData, "street");
    const companyName = getStringValue(formData, "company_name");
    const ownerName = getStringValue(formData, "owner_name");
    const firstName = getStringValue(formData, "first_name");
    const lastName = getStringValue(formData, "last_name");
    const postalCode = getStringValue(formData, "postal_code");
    const city = getStringValue(formData, "city");
    const country = getStringValue(formData, "country");
    const email = getStringValue(formData, "email");
    const preferredLanguage = getEmailLanguage(formData);
    const phone = getStringValue(formData, "phone");
    const taxNumber = getStringValue(formData, "tax_number");
    const vatId = getStringValue(formData, "vat_id");
    const defaultRedirectPath = `/dashboard/customers/${customerId}?customerSaved=1&highlight=1`;
    const redirectTo = getSafeDashboardRedirectPath(
        getStringValue(formData, "redirect_to"),
        defaultRedirectPath,
    );

    if (!isValidPhoneNumber(phone)) {
        throw new Error("Bitte gib eine gültige Telefonnummer ein.");
    }

    const nameUpdate =
        existingCustomer?.type === "company" &&
        (hasFormField(formData, "company_name") || hasFormField(formData, "owner_name"))
            ? {
                  company_name: companyName,
                  owner_name: ownerName,
                  first_name: null,
                  last_name: null,
              }
            : existingCustomer?.type === "private" &&
                (hasFormField(formData, "first_name") || hasFormField(formData, "last_name"))
              ? {
                    company_name: null,
                    owner_name: null,
                    first_name: firstName,
                    last_name: lastName,
                }
              : {};

    const { data, error } = await supabase
        .from("customers")
        .update({
            ...nameUpdate,
            street,
            postal_code: postalCode,
            city,
            country,
            email,
            preferred_language: preferredLanguage,
            phone,
            tax_number: taxNumber,
            vat_id: vatId,
        })
        .eq("id", customerId)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

    if (error || !data) {
        throw new Error(
            `Kundendaten konnten nicht gespeichert werden: ${
                error?.message ??
                "Es wurde kein passender Kundendatensatz gefunden oder die RLS-Policy blockiert das Update."
            }`,
        );
    }

    const customerName = existingCustomer
        ? getCustomerDisplayName(existingCustomer)
        : "Unbekannter Kunde";

    await logActivity({
        action: `Kundendaten von ${customerName} aktualisiert`,
        entityType: "customer",
        entityId: customerId,
    });

    revalidatePath(`/dashboard/customers/${customerId}`);
    revalidatePath("/dashboard/ankauf");
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/documents");
    revalidatePath("/dashboard/checks");
    revalidatePath("/dashboard/activities");

    redirect(redirectTo);
}
