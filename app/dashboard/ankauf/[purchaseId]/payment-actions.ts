"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getOptionalCurrentAuthUserId } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    createPurchasePaymentAndSync,
    isValidPurchasePaymentMethod,
} from "@/lib/purchases/purchase-payment-sync";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function revalidatePurchasePaymentPaths(purchaseId: string) {
    revalidatePaths([
        `/dashboard/ankauf/${purchaseId}`,
        "/dashboard/ankauf",
        "/dashboard/cashbook",
        "/dashboard/checks",
        "/dashboard",
        "/dashboard/activities",
    ]);
}

export async function markPurchasePaidAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const authUserId = await getOptionalCurrentAuthUserId();

    const purchaseId = getStringValue(formData, "purchase_id");
    const paymentMethod = getStringValue(formData, "payment_method") ?? "bank";

    if (!purchaseId) {
        throw new Error("Ankaufsakte fehlt.");
    }

    if (!isValidPurchasePaymentMethod(paymentMethod)) {
        throw new Error("Ungültige Zahlungsart.");
    }

    const { data: purchaseData, error: purchaseError } = await supabase
        .from("purchase_cases")
        .select(
            `
            id,
            vehicle_id,
            seller_customer_id,
            purchase_number,
            gross_amount,
            payment_status
        `,
        )
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .single();

    if (purchaseError || !purchaseData) {
        throw new Error(
            `Ankaufsakte konnte nicht geladen werden: ${
                purchaseError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    if (purchaseData.payment_status === "paid") {
        redirect(`/dashboard/ankauf/${purchaseId}`);
    }

    const purchaseNumber = purchaseData.purchase_number ?? purchaseId;

    const paymentResult = await createPurchasePaymentAndSync({
        companyId,
        purchaseId,
        purchaseNumber,
        grossAmount: Number(purchaseData.gross_amount),
        paymentMethod,
        authUserId,
    });

    if (!paymentResult.success) {
        throw new Error(paymentResult.message);
    }

    const { error: purchaseUpdateError } = await supabase
        .from("purchase_cases")
        .update({
            payment_status: "paid",
            status: "completed",
            updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseId)
        .eq("company_id", companyId);

    if (purchaseUpdateError) {
        throw new Error(
            `Ankaufsakte konnte nicht als bezahlt markiert werden: ${purchaseUpdateError.message}`,
        );
    }

    revalidatePurchasePaymentPaths(purchaseId);

    redirect(`/dashboard/ankauf/${purchaseId}`);
}
