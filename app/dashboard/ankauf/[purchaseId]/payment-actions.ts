"use server";

import { redirect } from "next/navigation";

import { syncPurchasePaymentFinancialEntry } from "@/lib/accounting/financial-sync";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getPaymentMethodLabel(paymentMethod: string): string {
    if (paymentMethod === "cash") return "Bar";
    if (paymentMethod === "bank") return "Bank";

    return paymentMethod;
}

async function getCurrentAuthUserId(): Promise<string | null> {
    const authSupabase = await createAuthServerSupabaseClient();
    const {
        data: { user },
    } = await authSupabase.auth.getUser();

    return user?.id ?? null;
}

async function createPurchasePaymentReference(companyId: string): Promise<string> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("next_purchase_payment_reference", {
        target_company_id: companyId,
    });

    if (error || typeof data !== "string") {
        throw new Error("Ankauf-Zahlungsreferenz konnte nicht erzeugt werden.");
    }

    return data;
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
    const authUserId = await getCurrentAuthUserId();

    const purchaseId = getStringValue(formData, "purchase_id");
    const paymentMethod = getStringValue(formData, "payment_method") ?? "bank";

    if (!purchaseId) {
        throw new Error("Ankaufsakte fehlt.");
    }

    if (paymentMethod !== "bank" && paymentMethod !== "cash") {
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
    const paymentMethodLabel = getPaymentMethodLabel(paymentMethod);
    const { data: existingPurchasePayment, error: existingPaymentError } =
        await supabase
            .from("purchase_payments")
            .select("id")
            .eq("company_id", companyId)
            .eq("purchase_id", purchaseId)
            .eq("is_voided", false)
            .limit(1)
            .maybeSingle();

    if (existingPaymentError) {
        throw new Error("Ankaufzahlungen konnten nicht geprüft werden.");
    }

    if (existingPurchasePayment) {
        redirect(`/dashboard/ankauf/${purchaseId}`);
    }

    let paymentReference = await createPurchasePaymentReference(companyId);
    let paymentId: string | null = null;
    let insertError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: payment, error: paymentInsertError } = await supabase
            .from("purchase_payments")
            .insert({
                company_id: companyId,
                purchase_id: purchaseId,
                payment_reference: paymentReference,
                amount: Number(purchaseData.gross_amount),
                payment_method: paymentMethod,
                payment_date: new Date().toISOString().slice(0, 10),
                note: `Zahlung Ankauf ${purchaseNumber}`,
                created_by: authUserId,
                last_modified_by: authUserId,
            })
            .select("id")
            .single();

        if (!paymentInsertError && payment) {
            paymentId = payment.id as string;
            insertError = null;
            break;
        }

        insertError = paymentInsertError;

        if (paymentInsertError?.code !== "23505") break;

        paymentReference = await createPurchasePaymentReference(companyId);
    }

    if (!paymentId) {
        console.error("[purchase-payment] insert failed", insertError);
        throw new Error("Ankaufzahlung konnte nicht gespeichert werden.");
    }

    await supabase.from("purchase_payment_audit_log").insert({
        company_id: companyId,
        payment_id: paymentId,
        purchase_id: purchaseId,
        action: "CREATED",
        previous_values: null,
        new_values: {
            payment_reference: paymentReference,
            amount: Number(purchaseData.gross_amount),
            payment_method: paymentMethod,
            payment_date: new Date().toISOString().slice(0, 10),
        },
        changed_by: authUserId,
    });

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

    await logActivity({
        action: `Ankaufzahlung ${paymentReference} über ${paymentMethodLabel} erfasst`,
        entityType: "purchase",
        entityId: purchaseId,
    });

    await syncPurchasePaymentFinancialEntry({
        companyId,
        paymentId,
    });

    revalidatePurchasePaymentPaths(purchaseId);

    redirect(`/dashboard/ankauf/${purchaseId}`);
}
