import { sendSaleInvoiceEmailAction } from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type SendInvoiceEmailFormProps = {
    saleId: string;
    invoiceId: string;
};

export function SendInvoiceEmailForm({
    saleId,
    invoiceId,
}: SendInvoiceEmailFormProps) {
    return (
        <form action={sendSaleInvoiceEmailAction}>
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <SubmitButton />
        </form>
    );
}

function SubmitButton() {
    return (
        <PendingSubmitButton
            iconName="mail"
            label="Per E-Mail senden"
            pendingLabel="Wird gesendet..."
            variant="outline"
            className="rounded-2xl bg-white font-bold"
        />
    );
}
