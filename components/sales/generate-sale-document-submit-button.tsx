import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type GenerateSaleDocumentSubmitButtonProps = {
    disabled: boolean;
    isGenerated?: boolean;
};

export function GenerateSaleDocumentSubmitButton({
    disabled,
    isGenerated = false,
}: GenerateSaleDocumentSubmitButtonProps) {
    return (
        <PendingSubmitButton
            disabled={disabled}
            iconName="file-text"
            label={isGenerated ? "Neu erzeugen" : "PDF erzeugen"}
            pendingLabel="PDF wird erstellt..."
            className={
                isGenerated
                    ? "h-11 w-full rounded-2xl bg-emerald-700 font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                    : "h-11 w-full rounded-2xl bg-cyan-700 font-extrabold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
            }
        />
    );
}
