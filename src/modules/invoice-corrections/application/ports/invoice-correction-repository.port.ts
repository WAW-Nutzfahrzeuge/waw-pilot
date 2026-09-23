import type { CreateCancellationInvoiceCommand } from "@/src/modules/invoice-corrections/application/commands/create-cancellation-invoice.command";
import type { RegisterRefundCommand } from "@/src/modules/invoice-corrections/application/commands/register-refund.command";
import type {
    CorrectionHistoryItemDto,
    CorrectionInvoiceSnapshotDto,
    CorrectionSummaryDto,
} from "@/src/modules/invoice-corrections/application/dto/correction.dto";

export type CreatedCorrectionInvoiceResult = {
    invoiceId: string;
    saleId: string;
    vehicleId: string;
    invoiceNumber: string;
    documentId: string | null;
};

export type RegisteredRefundResult = {
    refundId: string;
    saleId: string;
    refundReference: string;
};

export interface InvoiceCorrectionRepository {
    getCorrectionSummary(params: {
        companyId: string;
        invoiceId: string;
    }): Promise<CorrectionSummaryDto | null>;
    getOriginalInvoice(params: {
        companyId: string;
        invoiceId: string;
    }): Promise<CorrectionInvoiceSnapshotDto | null>;
    createCancellationInvoice(
        command: CreateCancellationInvoiceCommand,
        summary: CorrectionSummaryDto,
    ): Promise<CreatedCorrectionInvoiceResult>;
    registerRefund(
        command: RegisterRefundCommand,
        summary: CorrectionSummaryDto,
    ): Promise<RegisteredRefundResult>;
    getHistory(params: {
        companyId: string;
        saleId: string;
    }): Promise<CorrectionHistoryItemDto[]>;
}
