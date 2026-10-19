import { reclassifySaleCustomDocumentAction } from "@/app/dashboard/sales/[saleId]/actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type ReclassifySaleCustomDocumentFormProps = {
    saleId: string;
    documentId: string;
};

export function ReclassifySaleCustomDocumentForm({
    saleId,
    documentId,
}: ReclassifySaleCustomDocumentFormProps) {
    return (
        <form action={reclassifySaleCustomDocumentAction} className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="document_id" value={documentId} />
            <label className="flex items-start gap-2 text-xs font-semibold leading-5 text-cyan-950">
                <input
                    type="checkbox"
                    name="classification_confirmation"
                    value="confirmed"
                    required
                    className="mt-1 size-4 shrink-0 rounded border-cyan-300"
                />
                <span>Ich bestätige, dass dieses Dokument ein Handelsregisterauszug ist.</span>
            </label>
            <PendingSubmitButton
                label="Als Handelsregisterauszug zuordnen"
                pendingLabel="Wird zugeordnet..."
                className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-xl border border-cyan-300 bg-white px-3 py-2 text-xs font-extrabold text-cyan-900 hover:bg-cyan-100 disabled:opacity-60"
            />
        </form>
    );
}
