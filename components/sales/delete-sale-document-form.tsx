import { deleteSaleDocumentAction } from "@/app/dashboard/sales/[saleId]/actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type DeleteSaleDocumentFormProps = {
    saleId: string;
    documentId: string;
};

export function DeleteSaleDocumentForm({
    saleId,
    documentId,
}: DeleteSaleDocumentFormProps) {
    return (
        <form action={deleteSaleDocumentAction}>
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="document_id" value={documentId} />
            <DeleteButton />
        </form>
    );
}

function DeleteButton() {
    return (
        <PendingSubmitButton
            iconName="trash"
            iconClassName="mr-1 size-3.5"
            label="Löschen"
            pendingLabel="Wird gelöscht..."
            className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
        />
    );
}
