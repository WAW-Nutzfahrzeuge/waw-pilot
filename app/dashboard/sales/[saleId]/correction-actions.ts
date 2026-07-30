"use server";

import { redirect } from "next/navigation";

import { getMoneyFormValue, getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { getOptionalCurrentAuthUserId } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { isPaymentMethod } from "@/lib/payments/payment-methods";
import { createInvoiceCorrectionUseCases } from "@/src/modules/invoice-corrections/infrastructure/factories/invoice-correction-use-case.factory";

function getCorrectionRedirect(saleId: string, params: Record<string, string>) {
    const searchParams = new URLSearchParams(params);

    return `/dashboard/sales/${saleId}?${searchParams.toString()}#invoice-corrections`;
}

function revalidateSaleCorrectionPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/cashbook",
        "/dashboard/activities",
    ]);
}

export async function createCancellationInvoiceAction(formData: FormData) {
    const companyId = getCurrentCompanyId();
    const authUserId = await getOptionalCurrentAuthUserId();
    const saleId = getStringFormValue(formData, "sale_id");
    const invoiceId = getStringFormValue(formData, "invoice_id");
    const reasonCode = getStringFormValue(formData, "reason_code");
    const reasonText = getStringFormValue(formData, "reason_text");
    const customerVisibleReason = getStringFormValue(formData, "customer_visible_reason");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!invoiceId || !reasonCode) {
        redirect(getCorrectionRedirect(saleId, { correctionError: "missingData" }));
    }

    const { createCancellationInvoice } = createInvoiceCorrectionUseCases();

    try {
        const result = await createCancellationInvoice.execute({
            companyId,
            originalInvoiceId: invoiceId,
            reasonCode,
            reasonText,
            customerVisibleReason,
            createdBy: authUserId,
        });

        revalidateSaleCorrectionPaths(saleId);
        redirect(
            getCorrectionRedirect(saleId, {
                cancellationCreated: result.invoiceNumber,
                highlightInvoiceId: result.invoiceId,
            }),
        );
    } catch (error) {
        console.error("[invoice-correction] cancellation failed", error);
        redirect(getCorrectionRedirect(saleId, { correctionError: "cancellationFailed" }));
    }
}

export async function registerSaleRefundAction(formData: FormData) {
    const companyId = getCurrentCompanyId();
    const authUserId = await getOptionalCurrentAuthUserId();
    const saleId = getStringFormValue(formData, "sale_id");
    const invoiceId = getStringFormValue(formData, "invoice_id");
    const correctionInvoiceId = getStringFormValue(formData, "correction_invoice_id");
    const amount = getMoneyFormValue(formData, "amount");
    const refundMethod = getStringFormValue(formData, "refund_method");
    const refundDate =
        getStringFormValue(formData, "refund_date") ?? new Date().toISOString().slice(0, 10);
    const reason = getStringFormValue(formData, "reason");
    const externalReference = getStringFormValue(formData, "external_reference");
    const note = getStringFormValue(formData, "note");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!invoiceId || amount === null || amount <= 0 || !reason || !isPaymentMethod(refundMethod)) {
        redirect(getCorrectionRedirect(saleId, { correctionError: "invalidRefund" }));
    }

    const { registerRefund } = createInvoiceCorrectionUseCases();

    try {
        const result = await registerRefund.execute({
            companyId,
            saleId,
            invoiceId,
            correctionInvoiceId,
            amount,
            refundMethod,
            refundDate,
            reason,
            externalReference,
            note,
            createdBy: authUserId,
        });

        revalidateSaleCorrectionPaths(saleId);
        redirect(
            getCorrectionRedirect(saleId, {
                refundCreated: result.refundReference,
            }),
        );
    } catch (error) {
        console.error("[invoice-correction] refund failed", error);
        redirect(getCorrectionRedirect(saleId, { correctionError: "refundFailed" }));
    }
}
