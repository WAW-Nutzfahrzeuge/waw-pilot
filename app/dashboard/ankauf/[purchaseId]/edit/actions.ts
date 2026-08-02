"use server";

import { redirect } from "next/navigation";

import { getDecimalFormValue, getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { translateVehicleDatabaseError } from "@/lib/vehicles/vehicle-save-errors";

type UpdatePurchaseCaseState = {
    success: boolean;
    message: string;
};

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function getVehicleActivityName(vehicle: {
    internal_number: string | null;
    manufacturer: string | null;
    model: string | null;
} | null): string {
    if (!vehicle) return "unbekanntes Fahrzeug";

    const name = [vehicle.manufacturer, vehicle.model]
        .filter(Boolean)
        .join(" ")
        .trim();

    return name || "unbekanntes Fahrzeug";
}

export async function updatePurchaseCaseAction(
    _previousState: UpdatePurchaseCaseState,
    formData: FormData,
): Promise<UpdatePurchaseCaseState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const purchaseId = getStringFormValue(formData, "purchase_id");
    const vehicleId = getStringFormValue(formData, "vehicle_id");
    const sellerCustomerId = getStringFormValue(formData, "seller_customer_id");
    const purchaseDate = getStringFormValue(formData, "purchase_date");
    const netAmount = getDecimalFormValue(formData, "net_amount");
    const vatRate = getDecimalFormValue(formData, "vat_rate") ?? 19;
    const paymentStatus = getStringFormValue(formData, "payment_status") ?? "open";
    const notes = getStringFormValue(formData, "notes");

    if (!purchaseId) {
        return {
            success: false,
            message: "Ankaufsakte fehlt.",
        };
    }

    if (!vehicleId) {
        return {
            success: false,
            message: "Bitte wähle ein Fahrzeug aus.",
        };
    }

    if (!sellerCustomerId) {
        return {
            success: false,
            message: "Bitte wähle einen Verkäufer aus.",
        };
    }

    if (!purchaseDate) {
        return {
            success: false,
            message: "Bitte wähle ein Ankaufsdatum aus.",
        };
    }

    if (netAmount === null || netAmount <= 0) {
        return {
            success: false,
            message: "Bitte gib einen gültigen Einkaufspreis netto ein.",
        };
    }

    if (
        paymentStatus !== "open" &&
        paymentStatus !== "partial" &&
        paymentStatus !== "paid"
    ) {
        return {
            success: false,
            message: "Bitte wähle einen gültigen Zahlungsstatus aus.",
        };
    }

    const [
        { data: existingPurchase },
        { data: vehicleData },
        { data: existingVehiclePurchase },
    ] = await Promise.all([
        supabase
            .from("purchase_cases")
            .select("purchase_number, payment_status")
            .eq("id", purchaseId)
            .eq("company_id", companyId)
            .maybeSingle(),
        supabase
            .from("vehicles")
            .select("internal_number, manufacturer, model, status")
            .eq("id", vehicleId)
            .eq("company_id", companyId)
            .maybeSingle(),
        supabase
            .from("purchase_cases")
            .select("id")
            .eq("company_id", companyId)
            .eq("vehicle_id", vehicleId)
            .neq("id", purchaseId)
            .limit(1)
            .maybeSingle(),
    ]);

    if (!vehicleData) {
        return {
            success: false,
            message: "Das Fahrzeug wurde nicht gefunden.",
        };
    }

    if (vehicleData.status === "sold" || existingVehiclePurchase) {
        return {
            success: false,
            message: "Dieses Fahrzeug ist bereits verkauft oder mit einem anderen Ankauf verknüpft.",
        };
    }

    const purchaseNumber = existingPurchase?.purchase_number ?? purchaseId;
    const vehicleActivityName = getVehicleActivityName(vehicleData);

    const vatAmount = roundMoney(netAmount * (vatRate / 100));
    const grossAmount = roundMoney(netAmount + vatAmount);

    const { error: purchaseUpdateError } = await supabase
        .from("purchase_cases")
        .update({
            vehicle_id: vehicleId,
            seller_customer_id: sellerCustomerId,
            purchase_date: purchaseDate,
            net_amount: netAmount,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            gross_amount: grossAmount,
            payment_status: paymentStatus,
            status: paymentStatus === "paid" ? "completed" : "active",
            notes,
            updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseId)
        .eq("company_id", companyId);

    if (purchaseUpdateError) {
        return {
            success: false,
            message: `Ankaufsakte konnte nicht aktualisiert werden: ${purchaseUpdateError.message}`,
        };
    }

    const { error: vehicleUpdateError } = await supabase
        .from("vehicles")
        .update({
            seller_customer_id: sellerCustomerId,
            purchase_price_net: netAmount,
            status: "in_stock",
        })
        .eq("id", vehicleId)
        .eq("company_id", companyId);

    if (vehicleUpdateError) {
        console.error("Vehicle update after purchase edit failed", vehicleUpdateError);

        return {
            success: false,
            message: `Ankaufsakte wurde aktualisiert, aber ${translateVehicleDatabaseError(
                vehicleUpdateError,
            )}`,
        };
    }

    await logActivity({
        action: `Ankaufsakte ${purchaseNumber} für ${vehicleActivityName} aktualisiert`,
        entityType: "purchase",
        entityId: purchaseId,
    });

    if (
        existingPurchase?.payment_status !== "paid" &&
        paymentStatus === "paid"
    ) {
        await logActivity({
            action: `Ankauf ${purchaseNumber} als bezahlt markiert`,
            entityType: "purchase",
            entityId: purchaseId,
        });
    }

    revalidatePaths([
        `/dashboard/ankauf/${purchaseId}`,
        "/dashboard/ankauf",
        "/dashboard",
        "/dashboard/checks",
        "/dashboard/activities",
    ]);

    redirect(`/dashboard/ankauf/${purchaseId}`);
}
