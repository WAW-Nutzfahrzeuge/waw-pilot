import type { CreateCancellationInvoiceCommand } from "@/src/modules/invoice-corrections/application/commands/create-cancellation-invoice.command";
import type { CorrectionActivityPort } from "@/src/modules/invoice-corrections/application/ports/correction-activity.port";
import type { CorrectionFinancialJournalPort } from "@/src/modules/invoice-corrections/application/ports/correction-financial-journal.port";
import type { InvoiceCorrectionRepository } from "@/src/modules/invoice-corrections/application/ports/invoice-correction-repository.port";
import { InvoiceNotFoundError } from "@/src/modules/invoice-corrections/domain/errors/invoice-correction-errors";
import { CorrectionPolicy } from "@/src/modules/invoice-corrections/domain/policies/correction-policy";

export class CreateCancellationInvoiceUseCase {
    private readonly policy = new CorrectionPolicy();

    constructor(
        private readonly corrections: InvoiceCorrectionRepository,
        private readonly financialJournal: CorrectionFinancialJournalPort,
        private readonly activity: CorrectionActivityPort,
    ) {}

    async execute(command: CreateCancellationInvoiceCommand) {
        this.policy.assertReasonValid(command.reasonCode, command.reasonText);

        const summary = await this.corrections.getCorrectionSummary({
            companyId: command.companyId,
            invoiceId: command.originalInvoiceId,
        });

        if (!summary) throw new InvoiceNotFoundError();

        this.policy.assertCancellationAllowed({
            invoiceType: summary.originalInvoice.invoiceType,
            invoiceStatus: summary.originalInvoice.status,
            remainingCorrectableAmount: summary.remainingCorrectableAmount,
        });

        const result = await this.corrections.createCancellationInvoice(command, summary);

        await this.financialJournal.syncCorrectionInvoice({
            companyId: command.companyId,
            invoiceId: result.invoiceId,
        });
        await this.activity.record({
            action: `Stornorechnung ${result.invoiceNumber} zu Rechnung ${summary.originalInvoice.invoiceNumber} wurde erstellt.`,
            entityType: "invoice",
            entityId: result.invoiceId,
        });
        await this.activity.record({
            action: `Verkauf storniert, Fahrzeug wurde automatisch wieder in den Bestand gesetzt (Stornorechnung ${result.invoiceNumber}).`,
            entityType: "vehicle",
            entityId: result.vehicleId,
        });

        return result;
    }
}
