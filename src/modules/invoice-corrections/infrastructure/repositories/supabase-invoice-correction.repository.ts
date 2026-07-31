import type { SupabaseClient } from "@supabase/supabase-js";

import { getNextInvoiceNumber } from "@/lib/invoices/invoice-numbering";
import { generateAndStoreInvoicePdf } from "@/lib/pdf/invoice-storage";
import type { CreateCancellationInvoiceCommand } from "@/src/modules/invoice-corrections/application/commands/create-cancellation-invoice.command";
import type { RegisterRefundCommand } from "@/src/modules/invoice-corrections/application/commands/register-refund.command";
import type {
    CorrectionHistoryItemDto,
    CorrectionSummaryDto,
} from "@/src/modules/invoice-corrections/application/dto/correction.dto";
import type {
    CreatedCorrectionInvoiceResult,
    InvoiceCorrectionRepository,
    RegisteredRefundResult,
} from "@/src/modules/invoice-corrections/application/ports/invoice-correction-repository.port";
import { getCorrectionReasonLabel } from "@/src/modules/invoice-corrections/domain/constants/correction-types";
import { CorrectionCalculationService } from "@/src/modules/invoice-corrections/domain/services/correction-calculation.service";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

type InvoiceRow = {
    id: string;
    company_id: string;
    sale_id: string;
    customer_id: string;
    vehicle_id: string;
    invoice_type: string;
    invoice_number: string;
    invoice_date: string;
    status: string;
    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    correction_status: string | null;
    correction_of_invoice_id: string | null;
    root_invoice_id: string | null;
};

type PaymentRow = {
    amount: number | string;
    is_voided: boolean | null;
    payment_reference?: string;
    payment_date?: string;
};

type RefundRow = {
    id?: string;
    amount: number | string;
    is_voided: boolean | null;
    refund_reference?: string;
    refund_date?: string;
    status?: string;
};

type SupabaseErrorLike = {
    code?: string;
    message?: string;
    details?: string | null;
    hint?: string | null;
};

function isInvoiceCorrectionSchemaError(error: SupabaseErrorLike | null): boolean {
    if (!error) return false;

    const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

    return (
        error.code === "PGRST204" ||
        error.code === "42703" ||
        error.code === "23514" ||
        message.includes("schema cache") ||
        message.includes("invoice_type") ||
        message.includes("correction_") ||
        message.includes("original_invoice_")
    );
}

export class SupabaseInvoiceCorrectionRepository implements InvoiceCorrectionRepository {
    private readonly calculation = new CorrectionCalculationService();

    constructor(private readonly supabase: SupabaseClient) {}

    async getCorrectionSummary(params: {
        companyId: string;
        invoiceId: string;
    }): Promise<CorrectionSummaryDto | null> {
        const originalInvoice = await this.resolveRootInvoice(params);
        if (!originalInvoice) return null;

        const [corrections, payments, refunds] = await Promise.all([
            this.getEffectiveCorrections(params.companyId, originalInvoice.id),
            this.getSalePayments(params.companyId, originalInvoice.sale_id),
            this.getSaleRefunds(params.companyId, originalInvoice.sale_id),
        ]);

        const existingCorrectionGrossAmount = corrections.reduce(
            (sum, correction) => sum + Math.abs(Number(correction.gross_amount)),
            0,
        );
        const remainingCorrectableAmount =
            this.calculation.calculateRemainingCorrectableAmount({
                originalGrossAmount: Number(originalInvoice.gross_amount),
                corrections: corrections.map((correction) => ({
                    grossAmount: Number(correction.gross_amount),
                    status: correction.correction_status,
                })),
            });
        const paidAmount = payments
            .filter((payment) => !payment.is_voided)
            .reduce((sum, payment) => sum + Number(payment.amount), 0);
        const refundedAmount = refunds
            .filter((refund) => !refund.is_voided)
            .reduce((sum, refund) => sum + Number(refund.amount), 0);
        const effectiveInvoiceAmount = Math.max(
            Number(originalInvoice.gross_amount) - existingCorrectionGrossAmount,
            0,
        );
        const outstandingRefundAmount =
            this.calculation.calculateOutstandingRefundAmount({
                paidAmount,
                effectiveInvoiceAmount,
                refunds: refunds.map((refund) => ({
                    amount: Number(refund.amount),
                    isVoided: Boolean(refund.is_voided),
                })),
            });

        return {
            originalInvoice: {
                id: originalInvoice.id,
                companyId: originalInvoice.company_id,
                saleId: originalInvoice.sale_id,
                customerId: originalInvoice.customer_id,
                vehicleId: originalInvoice.vehicle_id,
                invoiceType: originalInvoice.invoice_type,
                invoiceNumber: originalInvoice.invoice_number,
                invoiceDate: originalInvoice.invoice_date,
                status: originalInvoice.status,
                netAmount: Number(originalInvoice.net_amount),
                vatRate: Number(originalInvoice.vat_rate),
                vatAmount: Number(originalInvoice.vat_amount),
                grossAmount: Number(originalInvoice.gross_amount),
            },
            existingCorrectionGrossAmount,
            remainingCorrectableAmount,
            effectiveInvoiceAmount,
            paidAmount,
            refundedAmount,
            outstandingRefundAmount,
            refundStatus: this.calculation.calculateRefundStatus({
                paidAmount,
                effectiveInvoiceAmount,
                refunds: refunds.map((refund) => ({
                    amount: Number(refund.amount),
                    isVoided: Boolean(refund.is_voided),
                })),
            }),
            canCancel:
                originalInvoice.invoice_type !== "proforma" &&
                originalInvoice.status !== "draft" &&
                remainingCorrectableAmount > 0,
        };
    }

    async getOriginalInvoice(params: { companyId: string; invoiceId: string }) {
        const originalInvoice = await this.resolveRootInvoice(params);
        if (!originalInvoice) return null;

        return {
            id: originalInvoice.id,
            companyId: originalInvoice.company_id,
            saleId: originalInvoice.sale_id,
            customerId: originalInvoice.customer_id,
            vehicleId: originalInvoice.vehicle_id,
            invoiceType: originalInvoice.invoice_type,
            invoiceNumber: originalInvoice.invoice_number,
            invoiceDate: originalInvoice.invoice_date,
            status: originalInvoice.status,
            netAmount: Number(originalInvoice.net_amount),
            vatRate: Number(originalInvoice.vat_rate),
            vatAmount: Number(originalInvoice.vat_amount),
            grossAmount: Number(originalInvoice.gross_amount),
        };
    }

    async createCancellationInvoice(
        command: CreateCancellationInvoiceCommand,
        summary: CorrectionSummaryDto,
    ): Promise<CreatedCorrectionInvoiceResult> {
        const existingCancellation = await this.findExistingFinalCancellation(
            command.companyId,
            summary.originalInvoice.id,
        );

        if (existingCancellation) {
            return {
                invoiceId: existingCancellation.id,
                saleId: existingCancellation.sale_id,
                invoiceNumber: existingCancellation.invoice_number,
                documentId: null,
            };
        }

        const invoiceNumber = await getNextInvoiceNumber({
            invoiceType: "cancellation_invoice",
            invoiceDate: new Date().toISOString().slice(0, 10),
        });
        const now = new Date().toISOString();
        const original = summary.originalInvoice;

        const { data: correctionInvoice, error } = await this.supabase
            .from("invoices")
            .insert({
                company_id: command.companyId,
                sale_id: original.saleId,
                customer_id: original.customerId,
                vehicle_id: original.vehicleId,
                invoice_type: "cancellation_invoice",
                invoice_number: invoiceNumber,
                invoice_date: now.slice(0, 10),
                due_date: null,
                net_amount: -Math.abs(original.netAmount),
                vat_rate: original.vatRate,
                vat_amount: -Math.abs(original.vatAmount),
                gross_amount: -Math.abs(original.grossAmount),
                status: "created",
                payment_status: "open",
                datev_status: "not_sent",
                correction_of_invoice_id: original.id,
                root_invoice_id: original.id,
                correction_reason_code: command.reasonCode,
                correction_reason_text: command.reasonText,
                customer_visible_reason: command.customerVisibleReason,
                correction_scope: "full",
                correction_status: "FINALIZED",
                correction_sequence: 1,
                corrected_net_amount: Math.abs(original.netAmount),
                corrected_tax_amount: Math.abs(original.vatAmount),
                corrected_gross_amount: Math.abs(original.grossAmount),
                original_invoice_number: original.invoiceNumber,
                original_invoice_date: original.invoiceDate,
                finalized_at: now,
                finalized_by: command.createdBy,
                invoice_snapshot: {
                    originalInvoice: original,
                    correctionReason: getCorrectionReasonLabel(command.reasonCode),
                    correctionReasonText: command.reasonText,
                    createdAt: now,
                },
            })
            .select("id, sale_id, invoice_number")
            .single();

        if (error || !correctionInvoice) {
            console.error("[invoice-correction] cancellation invoice insert failed", error);

            if (isInvoiceCorrectionSchemaError(error)) {
                throw new Error(
                    "Stornorechnung konnte nicht angelegt werden, weil die Datenbankmigration für Rechnungskorrekturen fehlt oder unvollständig ist.",
                );
            }

            throw new Error("Stornorechnung konnte nicht angelegt werden.");
        }

        const invoiceId = correctionInvoice.id as string;
        const { data: saleReferenceRow } = await this.supabase
            .from("sales")
            .select("sale_number")
            .eq("company_id", command.companyId)
            .eq("id", original.saleId)
            .maybeSingle();
        const invoiceFileName = new ExportFileNamePolicy().createDocumentFileName({
            saleReference: saleReferenceRow?.sale_number ?? invoiceNumber,
            documentType: "cancellation_invoice",
            mimeType: "application/pdf",
        });
        const invoiceFilePath = `invoices/${invoiceFileName}`;

        const { data: documentData, error: documentError } = await this.supabase
            .from("documents")
            .insert({
                company_id: command.companyId,
                document_type: "cancellation_invoice",
                source: "generated",
                status: "needs_review",
                file_name: invoiceFileName,
                file_path: invoiceFilePath,
                mime_type: "application/pdf",
                file_size: null,
                customer_id: original.customerId,
                vehicle_id: original.vehicleId,
                sale_id: original.saleId,
                invoice_id: invoiceId,
                generated_by_system: true,
            })
            .select("id")
            .single();

        if (documentError || !documentData) {
            throw new Error("Dokument zur Stornorechnung konnte nicht angelegt werden.");
        }

        const documentId = documentData.id as string;

        await this.supabase
            .from("invoices")
            .update({ pdf_document_id: documentId })
            .eq("company_id", command.companyId)
            .eq("id", invoiceId);

        const storedPdf = await generateAndStoreInvoicePdf(invoiceId);

        const { error: documentUpdateError } = await this.supabase
            .from("documents")
            .update({
                status: "available",
                file_name: storedPdf.fileName,
                file_path: storedPdf.filePath,
                file_size: storedPdf.fileSize,
            })
            .eq("company_id", command.companyId)
            .eq("id", documentId);

        if (documentUpdateError) {
            throw new Error("Storno-PDF wurde erzeugt, aber Dokumentdaten konnten nicht aktualisiert werden.");
        }

        await this.supabase
            .from("invoices")
            .update({
                correction_status: "CANCELLED",
                corrected_gross_amount: Math.abs(original.grossAmount),
            })
            .eq("company_id", command.companyId)
            .eq("id", original.id);

        return {
            invoiceId,
            saleId: original.saleId,
            invoiceNumber,
            documentId,
        };
    }

    async registerRefund(
        command: RegisterRefundCommand,
        summary: CorrectionSummaryDto,
    ): Promise<RegisteredRefundResult> {
        const { data: refundReference, error: referenceError } = await this.supabase.rpc(
            "next_sale_refund_reference",
            { target_company_id: command.companyId },
        );

        if (referenceError || typeof refundReference !== "string") {
            throw new Error("Rückzahlungsreferenz konnte nicht erzeugt werden.");
        }

        const { data, error } = await this.supabase
            .from("sale_refunds")
            .insert({
                company_id: command.companyId,
                sale_id: command.saleId,
                invoice_id: summary.originalInvoice.id,
                correction_invoice_id: command.correctionInvoiceId,
                customer_id: summary.originalInvoice.customerId,
                refund_reference: refundReference,
                amount: command.amount,
                refund_method: command.refundMethod,
                refund_date: command.refundDate,
                reason: command.reason,
                external_reference: command.externalReference,
                note: command.note,
                status: "active",
                created_by: command.createdBy,
                updated_by: command.createdBy,
            })
            .select("id, sale_id, refund_reference")
            .single();

        if (error || !data) {
            throw new Error("Rückzahlung konnte nicht erfasst werden.");
        }

        return {
            refundId: data.id as string,
            saleId: data.sale_id as string,
            refundReference: data.refund_reference as string,
        };
    }

    async getHistory(params: {
        companyId: string;
        saleId: string;
    }): Promise<CorrectionHistoryItemDto[]> {
        const [invoices, payments, refunds] = await Promise.all([
            this.supabase
                .from("invoices")
                .select("id, invoice_type, invoice_number, invoice_date, gross_amount, status, correction_status")
                .eq("company_id", params.companyId)
                .eq("sale_id", params.saleId),
            this.supabase
                .from("sale_payments")
                .select("id, payment_reference, payment_date, amount, is_voided")
                .eq("company_id", params.companyId)
                .eq("sale_id", params.saleId),
            this.supabase
                .from("sale_refunds")
                .select("id, refund_reference, refund_date, amount, is_voided")
                .eq("company_id", params.companyId)
                .eq("sale_id", params.saleId),
        ]);

        return [
            ...((invoices.data ?? []) as {
                id: string;
                invoice_type: string;
                invoice_number: string;
                invoice_date: string;
                gross_amount: number | string;
                status: string;
                correction_status: string | null;
            }[]).map((invoice) => ({
                id: invoice.id,
                type: "invoice" as const,
                label: `${invoice.invoice_type === "cancellation_invoice" ? "Stornorechnung" : "Rechnung"} ${invoice.invoice_number}`,
                date: invoice.invoice_date,
                amount: Number(invoice.gross_amount),
                status: invoice.correction_status ?? invoice.status,
            })),
            ...((payments.data ?? []) as PaymentRow[]).map((payment) => ({
                id: payment.payment_reference ?? "",
                type: "payment" as const,
                label: `Zahlung ${payment.payment_reference}`,
                date: payment.payment_date ?? "",
                amount: Number(payment.amount),
                status: payment.is_voided ? "voided" : "active",
            })),
            ...((refunds.data ?? []) as RefundRow[]).map((refund) => ({
                id: refund.id ?? refund.refund_reference ?? "",
                type: "refund" as const,
                label: `Rückzahlung ${refund.refund_reference}`,
                date: refund.refund_date ?? "",
                amount: Number(refund.amount),
                status: refund.is_voided ? "voided" : "active",
            })),
        ].sort((a, b) => a.date.localeCompare(b.date));
    }

    private async resolveRootInvoice(params: { companyId: string; invoiceId: string }) {
        const { data, error } = await this.supabase
            .from("invoices")
            .select(
                "id, company_id, sale_id, customer_id, vehicle_id, invoice_type, invoice_number, invoice_date, status, net_amount, vat_rate, vat_amount, gross_amount, correction_status, correction_of_invoice_id, root_invoice_id",
            )
            .eq("company_id", params.companyId)
            .eq("id", params.invoiceId)
            .single();

        if (error || !data) return null;

        const invoice = data as unknown as InvoiceRow;
        const rootInvoiceId = invoice.root_invoice_id ?? invoice.correction_of_invoice_id;

        if (!rootInvoiceId) return invoice;

        const { data: rootData, error: rootError } = await this.supabase
            .from("invoices")
            .select(
                "id, company_id, sale_id, customer_id, vehicle_id, invoice_type, invoice_number, invoice_date, status, net_amount, vat_rate, vat_amount, gross_amount, correction_status, correction_of_invoice_id, root_invoice_id",
            )
            .eq("company_id", params.companyId)
            .eq("id", rootInvoiceId)
            .single();

        return rootError || !rootData ? null : (rootData as unknown as InvoiceRow);
    }

    private async getEffectiveCorrections(companyId: string, rootInvoiceId: string) {
        const { data } = await this.supabase
            .from("invoices")
            .select("gross_amount, correction_status")
            .eq("company_id", companyId)
            .eq("root_invoice_id", rootInvoiceId)
            .in("invoice_type", ["cancellation_invoice", "credit_note"])
            .neq("correction_status", "VOIDED");

        return (data ?? []) as { gross_amount: number | string; correction_status: string | null }[];
    }

    private async getSalePayments(companyId: string, saleId: string) {
        const { data } = await this.supabase
            .from("sale_payments")
            .select("amount, is_voided")
            .eq("company_id", companyId)
            .eq("sale_id", saleId);

        return (data ?? []) as PaymentRow[];
    }

    private async getSaleRefunds(companyId: string, saleId: string) {
        const { data } = await this.supabase
            .from("sale_refunds")
            .select("amount, is_voided")
            .eq("company_id", companyId)
            .eq("sale_id", saleId);

        return (data ?? []) as RefundRow[];
    }

    private async findExistingFinalCancellation(companyId: string, originalInvoiceId: string) {
        const { data } = await this.supabase
            .from("invoices")
            .select("id, sale_id, invoice_number")
            .eq("company_id", companyId)
            .eq("correction_of_invoice_id", originalInvoiceId)
            .eq("invoice_type", "cancellation_invoice")
            .neq("correction_status", "VOIDED")
            .maybeSingle();

        return data as { id: string; sale_id: string; invoice_number: string } | null;
    }
}
