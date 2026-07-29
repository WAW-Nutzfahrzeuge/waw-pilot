import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

type GenerateLicensePlateDocumentSubmitButtonProps = {
    disabled?: boolean;
};

export function GenerateLicensePlateDocumentSubmitButton({
    disabled = false,
}: GenerateLicensePlateDocumentSubmitButtonProps) {
    return (
        <PendingSubmitButton
            disabled={disabled}
            iconName="file-text"
            label="Einverständniserklärung erzeugen"
            pendingLabel="Wird erzeugt..."
            className="h-11 w-full rounded-2xl bg-cyan-700 font-extrabold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
        />
    );
}
