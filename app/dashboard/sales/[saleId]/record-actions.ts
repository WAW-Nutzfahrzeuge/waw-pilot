"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity/activity-log";
import { getCurrentCompanyId } from "@/lib/company";
import {
    normalizeEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidPhoneNumber } from "@/lib/validation/phone";
import {
    getDuplicateVinMessage,
    translateVehicleDatabaseError,
} from "@/lib/vehicles/vehicle-save-errors";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getNumberValue(formData: FormData, key: string): number | null {
    const value = getStringValue(formData, key);

    if (!value) return null;

    const normalizedValue = value.replace(",", ".");
    const numberValue = Number(normalizedValue);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function getEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(getStringValue(formData, "preferred_language"));
}

function redirectWithSaleMessage(saleId: string, params: Record<string, string>) {
    const searchParams = new URLSearchParams(params);

    redirect(`/dashboard/sales/${saleId}?${searchParams.toString()}`);
}

function getMetadataRecord(metadata: unknown): Record<string, unknown> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {};
    }

    return metadata as Record<string, unknown>;
}

export async function updateSaleCustomerAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const customerId = getStringValue(formData, "customer_id");
    const type = getStringValue(formData, "type");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!customerId) throw new Error("Kunde fehlt.");
    if (type !== "company" && type !== "private") {
        redirectWithSaleMessage(saleId, { recordError: "invalidCustomerType" });
    }

    const companyName = getStringValue(formData, "company_name");
    const ownerName = getStringValue(formData, "owner_name");
    const firstName = getStringValue(formData, "first_name");
    const lastName = getStringValue(formData, "last_name");
    const street = getStringValue(formData, "street");
    const postalCode = getStringValue(formData, "postal_code");
    const city = getStringValue(formData, "city");
    const country = getStringValue(formData, "country") ?? "Deutschland";
    const email = getStringValue(formData, "email");
    const preferredLanguage = getEmailLanguage(formData);
    const phone = getStringValue(formData, "phone");
    const taxNumber = getStringValue(formData, "tax_number");
    const vatId = getStringValue(formData, "vat_id");
    const commercialRegisterNumber = getStringValue(
        formData,
        "commercial_register_number",
    );

    if (!street || !postalCode || !city) {
        redirectWithSaleMessage(saleId, { recordError: "customerAddressMissing" });
    }

    if (type === "company" && !companyName) {
        redirectWithSaleMessage(saleId, { recordError: "companyNameMissing" });
    }

    if (type === "private" && (!firstName || !lastName)) {
        redirectWithSaleMessage(saleId, { recordError: "privateNameMissing" });
    }

    if (!isValidPhoneNumber(phone)) {
        redirectWithSaleMessage(saleId, { recordError: "invalidPhone" });
    }

    const { data: sale } = await supabase
        .from("sales")
        .select("id")
        .eq("id", saleId)
        .eq("company_id", companyId)
        .eq("buyer_customer_id", customerId)
        .maybeSingle();

    if (!sale) {
        redirectWithSaleMessage(saleId, { recordError: "saleCustomerMismatch" });
    }

    const { data: existingCustomer } = await supabase
        .from("customers")
        .select("vat_id")
        .eq("id", customerId)
        .eq("company_id", companyId)
        .maybeSingle();

    const { error } = await supabase
        .from("customers")
        .update({
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
            commercial_register_number: commercialRegisterNumber,
        })
        .eq("id", customerId)
        .eq("company_id", companyId);

    if (error) {
        console.error("[sale-record] customer update failed", error);
        redirectWithSaleMessage(saleId, { recordError: "customerUpdateFailed" });
    }

    const previousVatId =
        typeof existingCustomer?.vat_id === "string"
            ? existingCustomer.vat_id.trim()
            : null;
    const nextVatId = vatId?.trim() ?? null;

    if (previousVatId !== nextVatId) {
        const { data: bzstDocuments, error: bzstDocumentsError } = await supabase
            .from("documents")
            .select("id, metadata")
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .in("document_type", [
                "bzst_vat_verification_primary",
                "bzst_vat_verification_secondary",
            ]);

        if (bzstDocumentsError) {
            console.error("[sale-record] BZSt documents lookup failed", bzstDocumentsError);
        }

        const vatNumberChangedAt = new Date().toISOString();

        const bzstResetResults = await Promise.all(
            (bzstDocuments ?? []).map((document) =>
                supabase
                    .from("documents")
                    .update({
                        status: "needs_review",
                        metadata: {
                            ...getMetadataRecord(document.metadata),
                            reviewStatus: "REVIEW_REQUIRED",
                            vatNumberChangedAt,
                            previousVatId,
                            currentVatId: nextVatId,
                        },
                    })
                    .eq("company_id", companyId)
                    .eq("id", document.id),
            ),
        );

        const bzstResetError = bzstResetResults.find((result) => result.error)?.error;

        if (bzstResetError) {
            console.error("[sale-record] BZSt review reset failed", bzstResetError);
        }

        if (bzstResetError) {
            console.error("[sale-record] BZSt review reset incomplete");
        } else {
            await logActivity({
                action:
                    "Die USt-ID wurde geändert. Die BZSt-Prüfung muss erneut geprüft werden.",
                entityType: "sale",
                entityId: saleId,
            });
        }
    }

    await logActivity({
        action: "Kunde in Verkaufsakte bearbeitet",
        entityType: "customer",
        entityId: customerId,
    });

    revalidatePath(`/dashboard/sales/${saleId}`);
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/activities");

    redirectWithSaleMessage(saleId, { recordSaved: "customer" });
}

export async function updateSaleVehicleAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const vehicleId = getStringValue(formData, "vehicle_id");
    const manufacturer = getStringValue(formData, "manufacturer");
    const model = getStringValue(formData, "model");
    const vehicleType = getStringValue(formData, "vehicle_type");
    const constructionYear = getNumberValue(formData, "construction_year");
    const vin = getStringValue(formData, "vin");
    const licensePlate = getStringValue(formData, "license_plate");
    const purchasePriceNet = getNumberValue(formData, "purchase_price_net");
    const additionalCostsNet = getNumberValue(formData, "additional_costs_net") ?? 0;
    const damageNotes = getStringValue(formData, "damage_notes");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!vehicleId) throw new Error("Fahrzeug fehlt.");

    if (!manufacturer || !model || !vehicleType || !vin) {
        redirectWithSaleMessage(saleId, { recordError: "vehicleRequiredMissing" });
    }

    if (purchasePriceNet === null || purchasePriceNet < 0 || additionalCostsNet < 0) {
        redirectWithSaleMessage(saleId, { recordError: "vehiclePriceInvalid" });
    }

    const { data: sale } = await supabase
        .from("sales")
        .select("id")
        .eq("id", saleId)
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .maybeSingle();

    if (!sale) {
        redirectWithSaleMessage(saleId, { recordError: "saleVehicleMismatch" });
    }

    const { data: duplicateVinVehicle, error: duplicateVinError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("vin", vin)
        .neq("id", vehicleId)
        .limit(1);

    if (duplicateVinError) {
        console.error("[sale-record] vin duplicate check failed", duplicateVinError);
    }

    if (duplicateVinVehicle && duplicateVinVehicle.length > 0) {
        redirectWithSaleMessage(saleId, {
            recordError: encodeURIComponent(getDuplicateVinMessage()),
        });
    }

    const { error } = await supabase
        .from("vehicles")
        .update({
            manufacturer,
            model,
            vehicle_type: vehicleType,
            construction_year: constructionYear,
            vin,
            license_plate: licensePlate,
            purchase_price_net: purchasePriceNet,
            additional_costs_net: additionalCostsNet,
            damage_notes: damageNotes,
            show_damage_on_invoice: false,
        })
        .eq("id", vehicleId)
        .eq("company_id", companyId);

    if (error) {
        console.error("[sale-record] vehicle update failed", error);
        redirectWithSaleMessage(saleId, {
            recordError: encodeURIComponent(translateVehicleDatabaseError(error)),
        });
    }

    await logActivity({
        action: "Fahrzeug in Verkaufsakte bearbeitet",
        entityType: "vehicle",
        entityId: vehicleId,
    });

    revalidatePath(`/dashboard/sales/${saleId}`);
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/vehicles");
    revalidatePath("/dashboard/activities");

    redirectWithSaleMessage(saleId, { recordSaved: "vehicle" });
}
