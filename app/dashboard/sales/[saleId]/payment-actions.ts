"use server";

import { redirect } from "next/navigation";

import { getMoneyFormValue, getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { logActivity } from "@/lib/activity/activity-log";
import { syncSalePaymentFinancialEntry } from "@/lib/accounting/financial-sync";
import { getOptionalCurrentAuthUserId } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { getTodayDateOnly } from "@/lib/format/date";
import {
    createSalePaymentFingerprint,
    isValidPaymentIdempotencyKey,
} from "@/lib/payments/sale-payment-idempotency";
import { isPaymentMethod } from "@/lib/payments/payment-methods";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    calculatePaymentStatus,
    calculateRemainingAmount,
} from "@/utils/payment-utils";

type ExistingPaymentRow = {
    id: string;
    payment_reference: string;
    amount: number | string;
    payment_method: string;
    payment_date: string;
    note: string | null;
    external_reference: string | null;
    is_voided: boolean | null;
};

function getToday(): string {
    return getTodayDateOnly();
}

function getPaymentRedirect(
    saleId: string,
    params: Record<string, string>,
    requestKey?: string | null,
) {
    if (requestKey) params.paymentRequestKey = requestKey;
    const searchParams = new URLSearchParams(params);

    return `/dashboard/sales/${saleId}?${searchParams.toString()}#payments`;
}

function revalidateSalePaymentPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/cashbook",
        "/dashboard",
        "/dashboard/activities",
    ]);
}

async function getSaleAndPayments(saleId: string) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [saleResult, paymentsResult] = await Promise.all([
        supabase
            .from("sales")
            .select("id, gross_amount")
            .eq("id", saleId)
            .eq("company_id", companyId)
            .single(),
        supabase
            .from("sale_payments")
            .select("id, amount, is_voided")
            .eq("company_id", companyId)
            .eq("sale_id", saleId),
    ]);

    const { data: sale, error: saleError } = saleResult;
    const { data: payments, error: paymentsError } = paymentsResult;

    if (saleError || !sale) {
        throw new Error("Verkauf konnte nicht geladen werden.");
    }

    if (paymentsError) {
        throw new Error("Zahlungen konnten nicht geladen werden.");
    }

    return {
        sale: {
            id: sale.id as string,
            gross_amount: Number(sale.gross_amount),
        },
        payments: (payments ?? []).map((payment) => ({
            id: payment.id as string,
            amount: Number(payment.amount),
            is_voided: Boolean(payment.is_voided),
        })),
    };
}

async function syncLegacyPaymentStatus(saleId: string) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const { sale, payments } = await getSaleAndPayments(saleId);
    const paymentStatus = calculatePaymentStatus(sale.gross_amount, payments);
    const legacyPaymentStatus = paymentStatus === "overpaid" ? "paid" : paymentStatus;

    await Promise.all([
        supabase
            .from("sales")
            .update({ payment_status: legacyPaymentStatus })
            .eq("id", saleId)
            .eq("company_id", companyId),
        supabase
            .from("invoices")
            .update({ payment_status: legacyPaymentStatus })
            .eq("sale_id", saleId)
            .eq("company_id", companyId)
            .neq("invoice_type", "proforma"),
    ]);
}

async function createPaymentReference(companyId: string): Promise<string> {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.rpc("next_sale_payment_reference", {
        target_company_id: companyId,
    });

    if (error || typeof data !== "string") {
        throw new Error("Zahlungsreferenz konnte nicht erzeugt werden.");
    }

    return data;
}

async function writeAuditLog({
    companyId,
    saleId,
    paymentId,
    action,
    previousValues,
    newValues,
    reason,
    changedBy,
}: {
    companyId: string;
    saleId: string;
    paymentId: string;
    action: "CREATED" | "UPDATED" | "VOIDED";
    previousValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    reason?: string | null;
    changedBy: string | null;
}) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("sale_payment_audit_log").insert({
        company_id: companyId,
        payment_id: paymentId,
        sale_id: saleId,
        action,
        previous_values: previousValues,
        new_values: newValues,
        changed_by: changedBy,
        reason: reason ?? null,
    });

    if (error) {
        throw new Error("Audit-Log konnte nicht geschrieben werden.");
    }
}

async function claimPaymentFinalization({
    supabase,
    companyId,
    paymentId,
}: {
    supabase: ReturnType<typeof createServerSupabaseClient>;
    companyId: string;
    paymentId: string;
}): Promise<"claimed" | "completed" | "processing"> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from("sale_payments")
        .update({
            finalization_status: "processing",
            finalization_started_at: now.toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", paymentId)
        .or(
            `finalization_status.in.(pending,failed),and(finalization_status.eq.processing,finalization_started_at.lt.${staleBefore})`,
        )
        .select("id")
        .maybeSingle();

    if (error) throw new Error("Zahlungsabschluss konnte nicht reserviert werden.");
    if (data) return "claimed";

    const { data: payment, error: statusError } = await supabase
        .from("sale_payments")
        .select("finalization_status")
        .eq("company_id", companyId)
        .eq("id", paymentId)
        .single();

    if (statusError || !payment) {
        throw new Error("Zahlungsabschlussstatus konnte nicht geladen werden.");
    }

    return payment.finalization_status === "completed" ? "completed" : "processing";
}

async function finalizeSalePayment({
    companyId,
    saleId,
    paymentId,
    paymentReference,
    auditValues,
    changedBy,
}: {
    companyId: string;
    saleId: string;
    paymentId: string;
    paymentReference: string;
    auditValues: Record<string, unknown>;
    changedBy: string | null;
}): Promise<"completed" | "processing"> {
    const supabase = createServerSupabaseClient();
    const claim = await claimPaymentFinalization({ supabase, companyId, paymentId });

    if (claim === "completed") return "completed";
    if (claim === "processing") return "processing";

    try {
        const { data: existingAudit, error: auditLookupError } = await supabase
            .from("sale_payment_audit_log")
            .select("id")
            .eq("company_id", companyId)
            .eq("payment_id", paymentId)
            .eq("action", "CREATED")
            .maybeSingle();

        if (auditLookupError) throw new Error("Audit-Log konnte nicht geprüft werden.");

        if (!existingAudit) {
            await writeAuditLog({
                companyId,
                saleId,
                paymentId,
                action: "CREATED",
                previousValues: null,
                newValues: auditValues,
                changedBy,
            });
        }

        await syncLegacyPaymentStatus(saleId);
        await syncSalePaymentFinancialEntry({ companyId, paymentId });

        const { error: completeError } = await supabase
            .from("sale_payments")
            .update({ finalization_status: "completed" })
            .eq("company_id", companyId)
            .eq("id", paymentId)
            .eq("finalization_status", "processing");

        if (completeError) throw new Error("Zahlungsabschluss konnte nicht bestätigt werden.");

        await logActivity({
            action: `Zahlung ${paymentReference} angelegt`,
            entityType: "sale",
            entityId: saleId,
        });

        return "completed";
    } catch (error) {
        await supabase
            .from("sale_payments")
            .update({ finalization_status: "failed" })
            .eq("company_id", companyId)
            .eq("id", paymentId)
            .eq("finalization_status", "processing");
        throw error;
    }
}

export async function createSalePaymentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const authUserId = await getOptionalCurrentAuthUserId();

    const saleId = getStringFormValue(formData, "sale_id");
    const amount = getMoneyFormValue(formData, "amount");
    const paymentDate = getStringFormValue(formData, "payment_date") ?? getToday();
    const paymentMethod = getStringFormValue(formData, "payment_method");
    const note = getStringFormValue(formData, "note");
    const externalReference = getStringFormValue(formData, "external_reference");
    const idempotencyKey = getStringFormValue(formData, "idempotency_key");
    const overpaymentConfirmed =
        getStringFormValue(formData, "overpayment_confirmed") === "yes";

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!isValidPaymentIdempotencyKey(idempotencyKey)) {
        redirect(getPaymentRedirect(saleId, { paymentError: "invalidRequestKey" }));
    }

    const requestFingerprint = createSalePaymentFingerprint({
        saleId,
        amount: amount ?? 0,
        paymentDate,
        paymentMethod: paymentMethod ?? "",
        note,
        externalReference,
        overpaymentConfirmed,
    });

    if (amount === null || amount <= 0) {
        redirect(getPaymentRedirect(saleId, { paymentError: "invalidAmount" }, idempotencyKey));
    }
    if (!isPaymentMethod(paymentMethod)) {
        redirect(getPaymentRedirect(saleId, { paymentError: "invalidMethod" }, idempotencyKey));
    }

    const { data: priorPayment, error: priorPaymentError } = await supabase
        .from("sale_payments")
        .select("id, payment_reference, request_fingerprint")
        .eq("company_id", companyId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

    if (priorPaymentError) {
        console.error("[sale-payment] idempotency lookup failed", priorPaymentError);
        redirect(getPaymentRedirect(saleId, { paymentError: "createFailed" }, idempotencyKey));
    }

    if (priorPayment) {
        if (priorPayment.request_fingerprint !== requestFingerprint) {
            redirect(
                getPaymentRedirect(saleId, { paymentError: "requestKeyConflict" }),
            );
        }

        let finalization: "completed" | "processing";
        try {
            finalization = await finalizeSalePayment({
                companyId,
                saleId,
                paymentId: priorPayment.id as string,
                paymentReference: priorPayment.payment_reference as string,
                auditValues: {
                    payment_reference: priorPayment.payment_reference,
                    amount,
                    payment_method: paymentMethod,
                    payment_date: paymentDate,
                    note,
                    external_reference: externalReference,
                },
                changedBy: authUserId,
            });
        } catch (error) {
            console.error("[sale-payment] idempotent finalization failed", error);
            redirect(
                getPaymentRedirect(saleId, { paymentError: "finalizationFailed" }),
            );
        }

        revalidateSalePaymentPaths(saleId);
        redirect(
            getPaymentRedirect(
                saleId,
                { paymentSaved: finalization === "completed" ? "created" : "processing" },
                null,
            ),
        );
    }

    const { sale, payments } = await getSaleAndPayments(saleId);
    const remainingAmount = calculateRemainingAmount(sale.gross_amount, payments);

    if (amount > remainingAmount && !overpaymentConfirmed) {
        redirect(
            getPaymentRedirect(saleId, {
                paymentError: "overpaymentNeedsConfirmation",
            }, idempotencyKey),
        );
    }

    let paymentReference = await createPaymentReference(companyId);
    let paymentId: string | null = null;
    let insertError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data, error } = await supabase
            .from("sale_payments")
            .insert({
                company_id: companyId,
                sale_id: saleId,
                payment_reference: paymentReference,
                idempotency_key: idempotencyKey,
                request_fingerprint: requestFingerprint,
                finalization_status: "pending",
                amount,
                payment_method: paymentMethod,
                payment_date: paymentDate,
                note,
                external_reference: externalReference,
                created_by: authUserId,
                last_modified_by: authUserId,
            })
            .select("id")
            .single();

        if (!error && data) {
            paymentId = data.id as string;
            insertError = null;
            break;
        }

        insertError = error;

        if (error?.code !== "23505") break;

        const { data: concurrentPayment, error: idempotencyLookupError } = await supabase
            .from("sale_payments")
            .select("id, request_fingerprint")
            .eq("company_id", companyId)
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();

        if (idempotencyLookupError) {
            console.error("[sale-payment] concurrent idempotency lookup failed", idempotencyLookupError);
            break;
        }

        if (concurrentPayment) {
            if (concurrentPayment.request_fingerprint !== requestFingerprint) {
                redirect(
                    getPaymentRedirect(saleId, { paymentError: "requestKeyConflict" }),
                );
            }

            revalidateSalePaymentPaths(saleId);
            redirect(getPaymentRedirect(saleId, { paymentSaved: "processing" }));
        }

        paymentReference = await createPaymentReference(companyId);
    }

    if (!paymentId) {
        console.error("[sale-payment] insert failed", insertError);
        redirect(getPaymentRedirect(saleId, { paymentError: "createFailed" }, idempotencyKey));
    }

    let finalization: "completed" | "processing";
    try {
        finalization = await finalizeSalePayment({
            companyId,
            saleId,
            paymentId,
            paymentReference,
            auditValues: {
                payment_reference: paymentReference,
                amount,
                payment_method: paymentMethod,
                payment_date: paymentDate,
                note,
                external_reference: externalReference,
            },
            changedBy: authUserId,
        });
    } catch (error) {
        console.error("[sale-payment] finalization failed", error);
        redirect(getPaymentRedirect(saleId, { paymentError: "finalizationFailed" }));
    }

    revalidateSalePaymentPaths(saleId);
    redirect(
        getPaymentRedirect(
            saleId,
            { paymentSaved: finalization === "completed" ? "created" : "processing" },
            null,
        ),
    );
}

export async function retrySalePaymentFinalizationAction(formData: FormData) {
    const saleId = getStringFormValue(formData, "sale_id");
    const paymentId = getStringFormValue(formData, "payment_id");
    const companyId = getCurrentCompanyId();

    if (!saleId || !paymentId) {
        redirect(getPaymentRedirect(saleId ?? "", { paymentError: "notFound" }));
    }

    const supabase = createServerSupabaseClient();
    const { data: payment, error } = await supabase
        .from("sale_payments")
        .select("id, sale_id, payment_reference, amount, payment_method, payment_date, note, external_reference, created_by, finalization_status")
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .eq("id", paymentId)
        .single();

    if (error || !payment) {
        redirect(getPaymentRedirect(saleId, { paymentError: "notFound" }));
    }

    let finalization: "completed" | "processing";
    try {
        finalization = await finalizeSalePayment({
            companyId,
            saleId,
            paymentId,
            paymentReference: payment.payment_reference as string,
            auditValues: {
                payment_reference: payment.payment_reference,
                amount: Number(payment.amount),
                payment_method: payment.payment_method,
                payment_date: payment.payment_date,
                note: payment.note,
                external_reference: payment.external_reference,
            },
            changedBy: (payment.created_by as string | null) ?? null,
        });
    } catch (finalizationError) {
        console.error("[sale-payment] finalization retry failed", finalizationError);
        redirect(getPaymentRedirect(saleId, { paymentError: "finalizationFailed" }));
    }

    revalidateSalePaymentPaths(saleId);
    redirect(
        getPaymentRedirect(saleId, {
            paymentSaved: finalization === "completed" ? "created" : "processing",
        }),
    );
}

export async function updateSalePaymentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const authUserId = await getOptionalCurrentAuthUserId();

    const saleId = getStringFormValue(formData, "sale_id");
    const paymentId = getStringFormValue(formData, "payment_id");
    const amount = getMoneyFormValue(formData, "amount");
    const paymentDate = getStringFormValue(formData, "payment_date") ?? getToday();
    const paymentMethod = getStringFormValue(formData, "payment_method");
    const note = getStringFormValue(formData, "note");
    const externalReference = getStringFormValue(formData, "external_reference");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!paymentId) throw new Error("Zahlung fehlt.");
    if (amount === null || amount <= 0) {
        redirect(getPaymentRedirect(saleId, { paymentError: "invalidAmount" }));
    }
    if (!isPaymentMethod(paymentMethod)) {
        redirect(getPaymentRedirect(saleId, { paymentError: "invalidMethod" }));
    }

    const { data: existingPayment, error: loadError } = await supabase
        .from("sale_payments")
        .select(
            "id, payment_reference, amount, payment_method, payment_date, note, external_reference, is_voided",
        )
        .eq("id", paymentId)
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .single();

    if (loadError || !existingPayment || existingPayment.is_voided) {
        redirect(getPaymentRedirect(saleId, { paymentError: "notFound" }));
    }

    const previousValues = existingPayment as ExistingPaymentRow;
    const newValues = {
        amount,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        note,
        external_reference: externalReference,
    };

    const { error: updateError } = await supabase
        .from("sale_payments")
        .update({
            ...newValues,
            updated_at: new Date().toISOString(),
            last_modified_by: authUserId,
        })
        .eq("id", paymentId)
        .eq("company_id", companyId)
        .eq("sale_id", saleId);

    if (updateError) {
        console.error("[sale-payment] update failed", updateError);
        redirect(getPaymentRedirect(saleId, { paymentError: "updateFailed" }));
    }

    await writeAuditLog({
        companyId,
        saleId,
        paymentId,
        action: "UPDATED",
        previousValues,
        newValues,
        changedBy: authUserId,
    });

    await syncLegacyPaymentStatus(saleId);
    await syncSalePaymentFinancialEntry({
        companyId,
        paymentId,
    });

    await logActivity({
        action: `Zahlung ${previousValues.payment_reference} geändert`,
        entityType: "sale",
        entityId: saleId,
    });

    revalidateSalePaymentPaths(saleId);

    redirect(getPaymentRedirect(saleId, { paymentSaved: "updated" }));
}

export async function voidSalePaymentAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const authUserId = await getOptionalCurrentAuthUserId();

    const saleId = getStringFormValue(formData, "sale_id");
    const paymentId = getStringFormValue(formData, "payment_id");
    const voidReason = getStringFormValue(formData, "void_reason");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!paymentId) throw new Error("Zahlung fehlt.");
    if (!voidReason) {
        redirect(getPaymentRedirect(saleId, { paymentError: "missingVoidReason" }));
    }

    const { data: existingPayment, error: loadError } = await supabase
        .from("sale_payments")
        .select(
            "id, payment_reference, amount, payment_method, payment_date, note, external_reference, is_voided",
        )
        .eq("id", paymentId)
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .single();

    if (loadError || !existingPayment || existingPayment.is_voided) {
        redirect(getPaymentRedirect(saleId, { paymentError: "notFound" }));
    }

    const voidedAt = new Date().toISOString();
    const { error: updateError } = await supabase
        .from("sale_payments")
        .update({
            is_voided: true,
            voided_at: voidedAt,
            voided_by: authUserId,
            void_reason: voidReason,
            updated_at: voidedAt,
            last_modified_by: authUserId,
        })
        .eq("id", paymentId)
        .eq("company_id", companyId)
        .eq("sale_id", saleId);

    if (updateError) {
        console.error("[sale-payment] void failed", updateError);
        redirect(getPaymentRedirect(saleId, { paymentError: "voidFailed" }));
    }

    await writeAuditLog({
        companyId,
        saleId,
        paymentId,
        action: "VOIDED",
        previousValues: existingPayment as ExistingPaymentRow,
        newValues: {
            is_voided: true,
            voided_at: voidedAt,
            void_reason: voidReason,
        },
        reason: voidReason,
        changedBy: authUserId,
    });

    await syncLegacyPaymentStatus(saleId);
    await syncSalePaymentFinancialEntry({
        companyId,
        paymentId,
    });

    await logActivity({
        action: `Zahlung ${existingPayment.payment_reference} storniert`,
        entityType: "sale",
        entityId: saleId,
    });

    revalidateSalePaymentPaths(saleId);

    redirect(getPaymentRedirect(saleId, { paymentSaved: "voided" }));
}
