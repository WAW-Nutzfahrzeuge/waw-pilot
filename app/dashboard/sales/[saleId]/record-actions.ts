"use server";

import { redirect } from "next/navigation";

import { getDecimalFormValue, getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
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

function getEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(getStringFormValue(formData, "preferred_language"));
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

    const saleId = getStringFormValue(formData, "sale_id");
    const customerId = getStringFormValue(formData, "customer_id");
    const type = getStringFormValue(formData, "type");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!customerId) throw new Error("Kunde fehlt.");
    if (type !== "company" && type !== "private") {
        redirectWithSaleMessage(saleId, { recordError: "invalidCustomerType" });
    }

    const companyName = getStringFormValue(formData, "company_name");
    const ownerName = getStringFormValue(formData, "owner_name");
    const firstName = getStringFormValue(formData, "first_name");
    const lastName = getStringFormValue(formData, "last_name");
    const street = getStringFormValue(formData, "street");
    const postalCode = getStringFormValue(formData, "postal_code");
    const city = getStringFormValue(formData, "city");
    const country = getStringFormValue(formData, "country") ?? "Deutschland";
    const email = getStringFormValue(formData, "email");
    const preferredLanguage = getEmailLanguage(formData);
    const phone = getStringFormValue(formData, "phone");
    const taxNumber = getStringFormValue(formData, "tax_number");
    const vatId = getStringFormValue(formData, "vat_id");
    const commercialRegisterNumber = getStringFormValue(
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

    const [{ data: sale }, { data: existingCustomer }] = await Promise.all([
        supabase
            .from("sales")
            .select("id")
            .eq("id", saleId)
            .eq("company_id", companyId)
            .eq("buyer_customer_id", customerId)
            .maybeSingle(),
        supabase
            .from("customers")
            .select("vat_id")
            .eq("id", customerId)
            .eq("company_id", companyId)
            .maybeSingle(),
    ]);

    if (!sale) {
        redirectWithSaleMessage(saleId, { recordError: "saleCustomerMismatch" });
    }

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

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/customers",
        "/dashboard/activities",
    ]);

    redirectWithSaleMessage(saleId, { recordSaved: "customer" });
}

export async function updateSaleVehicleAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringFormValue(formData, "sale_id");
    const vehicleId = getStringFormValue(formData, "vehicle_id");
    const manufacturer = getStringFormValue(formData, "manufacturer");
    const model = getStringFormValue(formData, "model");
    const vehicleType = getStringFormValue(formData, "vehicle_type");
    const constructionYear = getDecimalFormValue(formData, "construction_year");
    const vin = getStringFormValue(formData, "vin");
    const licensePlate = getStringFormValue(formData, "license_plate");
    const purchasePriceNet = getDecimalFormValue(formData, "purchase_price_net");
    const additionalCostsNet = getDecimalFormValue(formData, "additional_costs_net") ?? 0;
    const damageNotes = getStringFormValue(formData, "damage_notes");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!vehicleId) throw new Error("Fahrzeug fehlt.");

    if (!manufacturer || !model || !vehicleType || !vin) {
        redirectWithSaleMessage(saleId, { recordError: "vehicleRequiredMissing" });
    }

    if (purchasePriceNet === null || purchasePriceNet < 0 || additionalCostsNet < 0) {
        redirectWithSaleMessage(saleId, { recordError: "vehiclePriceInvalid" });
    }

    const [{ data: sale }, { data: duplicateVinVehicle, error: duplicateVinError }] =
        await Promise.all([
            supabase
                .from("sales")
                .select("id")
                .eq("id", saleId)
                .eq("company_id", companyId)
                .eq("vehicle_id", vehicleId)
                .maybeSingle(),
            supabase
                .from("vehicles")
                .select("id")
                .eq("company_id", companyId)
                .eq("vin", vin)
                .neq("id", vehicleId)
                .limit(1),
        ]);

    if (!sale) {
        redirectWithSaleMessage(saleId, { recordError: "saleVehicleMismatch" });
    }

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

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/vehicles",
        "/dashboard/activities",
    ]);

    redirectWithSaleMessage(saleId, { recordSaved: "vehicle" });
}
