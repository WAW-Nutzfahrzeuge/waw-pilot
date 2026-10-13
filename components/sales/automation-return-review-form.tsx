import { reviewAutomationReturnAction } from "@/app/dashboard/sales/[saleId]/automation-return-review-actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type AutomationReturnReviewFormProps = {
    saleId: string;
    documentId: string;
    documentVersionId: string;
};

export function AutomationReturnReviewForm({
    saleId,
    documentId,
    documentVersionId,
}: AutomationReturnReviewFormProps) {
    const hiddenFields = (
        <>
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="document_id" value={documentId} />
            <input type="hidden" name="document_version_id" value={documentVersionId} />
        </>
    );

    return (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form action={reviewAutomationReturnAction} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                {hiddenFields}
                <input type="hidden" name="decision" value="accepted" />
                <label className="flex items-start gap-3 text-xs font-semibold leading-5 text-emerald-950">
                    <input
                        type="checkbox"
                        name="review_confirmation"
                        value="confirmed"
                        required
                        className="mt-1 size-4 shrink-0 rounded border-emerald-300"
                    />
                    <span>
                        Ich habe das Dokument geprüft. Es gehört zu diesem Verkauf und die erforderliche Unterschrift ist sichtbar vorhanden.
                    </span>
                </label>
                <p className="mt-2 text-xs leading-5 text-emerald-800">
                    Die Freigabe bestätigt weder Echtheit noch rechtliche Gültigkeit.
                </p>
                <PendingSubmitButton
                    iconName="check-circle"
                    label="Rücklauf freigeben"
                    pendingLabel="Wird freigegeben..."
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:opacity-60"
                />
            </form>

            <form action={reviewAutomationReturnAction} className="rounded-2xl border border-red-200 bg-red-50 p-4">
                {hiddenFields}
                <input type="hidden" name="decision" value="rejected" />
                <label className="text-xs font-extrabold text-red-950" htmlFor={`review-reason-${documentVersionId}`}>
                    Kurzer Prüfgrund
                </label>
                <textarea
                    id={`review-reason-${documentVersionId}`}
                    name="reason"
                    required
                    maxLength={500}
                    rows={3}
                    className="mt-2 w-full resize-y rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-red-400"
                    placeholder="Warum wird dieser Rücklauf abgelehnt?"
                />
                <PendingSubmitButton
                    label="Rücklauf ablehnen"
                    pendingLabel="Wird abgelehnt..."
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-extrabold text-red-700 hover:bg-red-100 disabled:opacity-60"
                />
            </form>
        </div>
    );
}
