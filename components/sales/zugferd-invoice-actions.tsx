import {
    createZugferdInvoiceAction,
    sendZugferdInvoiceEmailAction,
} from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type ZugferdInvoiceActionsProps = {
    saleId: string;
    invoiceId: string;
    isValidated: boolean;
    isServiceConfigured: boolean;
};

export function ZugferdInvoiceActions({
    saleId,
    invoiceId,
    isValidated,
    isServiceConfigured,
}: ZugferdInvoiceActionsProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <form action={createZugferdInvoiceAction}>
                <input type="hidden" name="sale_id" value={saleId} />
                <input type="hidden" name="invoice_id" value={invoiceId} />
                <CreateButton
                    isValidated={isValidated}
                    isServiceConfigured={isServiceConfigured}
                />
            </form>

            {isValidated ? (
                <form action={sendZugferdInvoiceEmailAction}>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_id" value={invoiceId} />
                    <SendButton />
                </form>
            ) : null}
        </div>
    );
}

function CreateButton({
    isValidated,
    isServiceConfigured,
}: {
    isValidated: boolean;
    isServiceConfigured: boolean;
}) {
    return (
        <PendingSubmitButton
            disabled={!isServiceConfigured}
            iconName="file-plus"
            label={isValidated ? "Neu erstellen und prüfen" : "ZUGFeRD erstellen und prüfen"}
            pendingLabel="ZUGFeRD wird erstellt und validiert..."
            variant="outline"
            className="rounded-2xl bg-white font-bold"
            title={
                isServiceConfigured
                    ? undefined
                    : "ZUGFeRD-Service ist noch nicht eingerichtet."
            }
        />
    );
}

function SendButton() {
    return (
        <PendingSubmitButton
            iconName="mail"
            label="ZUGFeRD per E-Mail senden"
            pendingLabel="Wird gesendet..."
            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
        />
    );
}
