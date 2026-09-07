"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RefreshCcw } from "lucide-react";

import { regenerateSaleInvoicePdfAction } from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { Button } from "@/components/ui/button";

type RegenerateInvoicePdfFormProps = {
    saleId: string;
    invoiceId: string;
};

export function RegenerateInvoicePdfForm({
                                             saleId,
                                             invoiceId,
                                         }: RegenerateInvoicePdfFormProps) {
    const includeSignatureStampInputRef = useRef<HTMLInputElement>(null);
    const includeDamageNotesInputRef = useRef<HTMLInputElement>(null);
    const includeTermsPdfInputRef = useRef<HTMLInputElement>(null);

    function handleSubmit() {
        const signatureCheckbox = document.getElementById(
            `sale-${saleId}-include-signature-stamp`,
        );
        const damageNotesCheckbox = document.getElementById(
            `sale-${saleId}-include-damage-notes`,
        );
        const termsPdfCheckbox = document.getElementById(
            `sale-${saleId}-include-terms-pdf`,
        );
        const includeSignatureStamp =
            signatureCheckbox instanceof HTMLInputElement &&
            signatureCheckbox.checked;
        const includeDamageNotes =
            damageNotesCheckbox instanceof HTMLInputElement &&
            damageNotesCheckbox.checked;
        const includeTermsPdf =
            !(termsPdfCheckbox instanceof HTMLInputElement) ||
            termsPdfCheckbox.checked;

        if (includeSignatureStampInputRef.current) {
            includeSignatureStampInputRef.current.value = includeSignatureStamp
                ? "yes"
                : "no";
        }

        if (includeDamageNotesInputRef.current) {
            includeDamageNotesInputRef.current.value = includeDamageNotes
                ? "yes"
                : "no";
        }

        if (includeTermsPdfInputRef.current) {
            includeTermsPdfInputRef.current.value = includeTermsPdf ? "yes" : "no";
        }
    }

    return (
        <form action={regenerateSaleInvoicePdfAction} onSubmit={handleSubmit}>
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <input
                ref={includeSignatureStampInputRef}
                type="hidden"
                name="include_signature_stamp"
                value="no"
            />
            <input
                ref={includeDamageNotesInputRef}
                type="hidden"
                name="include_damage_notes_on_invoice"
                value="no"
            />
            <input
                ref={includeTermsPdfInputRef}
                type="hidden"
                name="include_terms_pdf"
                value="yes"
            />
            <RegenerateInvoicePdfButton />
        </form>
    );
}

function RegenerateInvoicePdfButton() {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            variant="outline"
            disabled={pending}
            aria-busy={pending}
            className="min-w-44 rounded-2xl bg-white font-bold"
        >
            {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
                <RefreshCcw className="mr-2 size-4" />
            )}
            {pending ? "PDF wird erstellt..." : "PDF neu generieren"}
        </Button>
    );
}
