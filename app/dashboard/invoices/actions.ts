"use server";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { getDatevInvoiceUploadEmail } from "@/lib/email/datev-recipient";
import {
    sendDatevInvoice,
    type DatevInvoiceCandidate,
} from "@/lib/invoices/datev-invoice-delivery";
import { isDatevInvoiceSendable } from "@/lib/invoices/datev-invoice-rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_DATEV_BATCH_SIZE = 25;

export type DatevBatchSendResult = {
    sentInvoiceIds: string[];
    failures: Array<{ invoiceId: string; message: string }>;
};

export async function sendInvoicesToDatevAction(
    rawInvoiceIds: string[],
): Promise<DatevBatchSendResult> {
    const invoiceIds = [...new Set(rawInvoiceIds.map((id) => id.trim()).filter(Boolean))]
        .slice(0, MAX_DATEV_BATCH_SIZE);

    if (invoiceIds.length === 0) {
        return {
            sentInvoiceIds: [],
            failures: [{ invoiceId: "", message: "Bitte wähle mindestens eine Rechnung aus." }],
        };
    }

    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const datevRecipientEmail = await getDatevInvoiceUploadEmail(companyId);
    const { data, error } = await supabase
        .from("invoices")
        .select("id, sale_id, invoice_number, invoice_type, status, datev_status")
        .eq("company_id", companyId)
        .in("id", invoiceIds);

    if (error) {
        console.error("[email] DATEV batch invoice lookup failed", error);
        return {
            sentInvoiceIds: [],
            failures: invoiceIds.map((invoiceId) => ({
                invoiceId,
                message: "Die Rechnung konnte nicht geladen werden.",
            })),
        };
    }

    const invoicesById = new Map(
        ((data ?? []) as unknown as DatevInvoiceCandidate[]).map((invoice) => [
            invoice.id,
            invoice,
        ]),
    );
    const result: DatevBatchSendResult = { sentInvoiceIds: [], failures: [] };

    for (const invoiceId of invoiceIds) {
        const invoice = invoicesById.get(invoiceId);

        if (!invoice) {
            result.failures.push({
                invoiceId,
                message: "Die Rechnung gehört nicht zum aktuellen Unternehmen oder existiert nicht mehr.",
            });
            continue;
        }

        if (!isDatevInvoiceSendable(invoice)) {
            result.failures.push({
                invoiceId,
                message: "Nur offene Standardrechnungen können an DATEV gesendet werden.",
            });
            continue;
        }

        const delivery = await sendDatevInvoice(companyId, invoice, {
            recipientEmail: datevRecipientEmail,
        });

        if (delivery.success) {
            result.sentInvoiceIds.push(invoice.id);
        } else {
            result.failures.push({ invoiceId, message: delivery.message });
        }
    }

    if (result.sentInvoiceIds.length > 0) {
        revalidatePaths([
            "/dashboard/invoices",
            "/dashboard/activities",
            "/dashboard/emails",
            "/dashboard/sales",
        ]);
    }

    return result;
}
