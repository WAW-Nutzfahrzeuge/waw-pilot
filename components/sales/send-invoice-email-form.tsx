import { sendSaleInvoiceEmailAction } from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SendInvoiceEmailFormProps = {
    saleId: string;
    invoiceId: string;
};

export function SendInvoiceEmailForm({
    saleId,
    invoiceId,
}: SendInvoiceEmailFormProps) {
    return (
        <form action={sendSaleInvoiceEmailAction} className="w-full sm:max-w-sm">
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <div className="space-y-2">
                <Label
                    htmlFor={`invoice-additional-recipient-${invoiceId}`}
                    className="text-xs font-bold text-slate-600"
                >
                    Zusätzliche Empfänger-E-Mail <span className="font-medium text-slate-400">(optional)</span>
                </Label>
                <Input
                    id={`invoice-additional-recipient-${invoiceId}`}
                    name="additional_recipient_email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="buchhaltung@kunde.de"
                    className="h-10 min-w-0 rounded-xl border-slate-200 bg-white text-sm font-medium"
                />
                <p className="text-xs font-medium leading-5 text-slate-500">
                    Die Rechnung wird zusätzlich zur E-Mail-Adresse des Kunden versendet.
                </p>
                <SubmitButton />
            </div>
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
