import { syncPurchasePaymentFinancialEntry } from "@/lib/accounting/financial-sync";
import { logActivity } from "@/lib/activity/activity-log";
import { getTodayDateOnly } from "@/lib/format/date";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getPurchasePaymentMethodLabel,
    isValidPurchasePaymentMethod,
    type PurchasePaymentMethod,
} from "@/lib/purchases/purchase-payment-method";

export type { PurchasePaymentMethod };
export { getPurchasePaymentMethodLabel, isValidPurchasePaymentMethod };

async function createPurchasePaymentReference(
    supabase: ReturnType<typeof createServerSupabaseClient>,
    companyId: string,
): Promise<string> {
    const { data, error } = await supabase.rpc("next_purchase_payment_reference", {
        target_company_id: companyId,
    });

    if (error || typeof data !== "string") {
        throw new Error("Ankauf-Zahlungsreferenz konnte nicht erzeugt werden.");
    }

    return data;
}

/**
 * Creates the actual `purchase_payments` record (+ audit log + Kassenbuch-/
 * Finanzvorgang-Sync) for a purchase whose payment_status is "paid".
 *
 * This is the SINGLE shared implementation used by purchase creation, purchase
 * editing, and the dedicated "Als bezahlt markieren" action, so that a purchase
 * marked "bezahlt" from ANY of these entry points always has the identical
 * financial/Kassenbuch effect. Do not duplicate this logic elsewhere.
 *
 * Idempotent: if a non-voided payment already exists for this purchase, it does
 * nothing and returns the existing payment id instead of creating a duplicate.
 */
export async function createPurchasePaymentAndSync({
    companyId,
    purchaseId,
    purchaseNumber,
    grossAmount,
    paymentMethod,
    authUserId,
}: {
    companyId: string;
    purchaseId: string;
    purchaseNumber: string;
    grossAmount: number;
    paymentMethod: PurchasePaymentMethod;
    authUserId: string | null;
}): Promise<
    { success: true; paymentId: string } | { success: false; message: string }
> {
    const supabase = createServerSupabaseClient();

    const { data: existingPayment, error: existingPaymentError } = await supabase
        .from("purchase_payments")
        .select("id")
        .eq("company_id", companyId)
        .eq("purchase_id", purchaseId)
        .eq("is_voided", false)
        .limit(1)
        .maybeSingle();

    if (existingPaymentError) {
        console.error(
            "[purchase-payment] existing payment check failed",
            existingPaymentError,
        );
        return {
            success: false,
            message: "Ankaufzahlungen konnten nicht geprüft werden.",
        };
    }

    if (existingPayment) {
        return { success: true, paymentId: existingPayment.id as string };
    }

    let paymentReference = await createPurchasePaymentReference(supabase, companyId);
    let paymentId: string | null = null;
    let insertError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: payment, error: paymentInsertError } = await supabase
            .from("purchase_payments")
            .insert({
                company_id: companyId,
                purchase_id: purchaseId,
                payment_reference: paymentReference,
                amount: grossAmount,
                payment_method: paymentMethod,
                payment_date: getTodayDateOnly(),
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

        paymentReference = await createPurchasePaymentReference(supabase, companyId);
    }

    if (!paymentId) {
        console.error("[purchase-payment] insert failed", insertError);
        return {
            success: false,
            message: "Ankaufzahlung konnte nicht gespeichert werden.",
        };
    }

    const { error: auditLogError } = await supabase
        .from("purchase_payment_audit_log")
        .insert({
            company_id: companyId,
            payment_id: paymentId,
            purchase_id: purchaseId,
            action: "CREATED",
            previous_values: null,
            new_values: {
                payment_reference: paymentReference,
                amount: grossAmount,
                payment_method: paymentMethod,
                payment_date: getTodayDateOnly(),
            },
            changed_by: authUserId,
        });

    if (auditLogError) {
        console.error("[purchase-payment] audit log insert failed", auditLogError);
    }

    await Promise.all([
        logActivity({
            action: `Ankaufzahlung ${paymentReference} über ${getPurchasePaymentMethodLabel(
                paymentMethod,
            )} erfasst`,
            entityType: "purchase",
            entityId: purchaseId,
        }),
        syncPurchasePaymentFinancialEntry({ companyId, paymentId }),
    ]);

    return { success: true, paymentId };
}
