import { sendInvoiceToDatevAction } from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type SendInvoiceDatevEmailFormProps = {
    saleId: string;
    invoiceId: string;
};

export function SendInvoiceDatevEmailForm({
    saleId,
    invoiceId,
}: SendInvoiceDatevEmailFormProps) {
    return (
        <form action={sendInvoiceToDatevAction}>
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <PendingSubmitButton
                iconName="mail"
                label="An DATEV senden"
                pendingLabel="Wird an DATEV gesendet..."
                variant="outline"
                className="rounded-2xl border-amber-200 bg-amber-50 font-bold text-amber-900 hover:bg-amber-100"
            />
        </form>
    );
}
