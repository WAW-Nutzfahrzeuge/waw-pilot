"use client";

import { useRef } from "react";

import { updateSaleInvoiceNotesAction } from "@/app/dashboard/sales/[saleId]/invoice-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type InvoiceAgreementFormProps = {
    saleId: string;
    invoiceNotes: string | null;
};

export function InvoiceAgreementForm({
    saleId,
    invoiceNotes,
}: InvoiceAgreementFormProps) {
    const includeSignatureStampInputRef = useRef<HTMLInputElement>(null);
    const includeTermsPdfInputRef = useRef<HTMLInputElement>(null);

    function handleSubmit() {
        const signatureCheckbox = document.getElementById(
            `sale-${saleId}-include-signature-stamp`,
        );
        const termsPdfCheckbox = document.getElementById(
            `sale-${saleId}-include-terms-pdf`,
        );
        const includeSignatureStamp =
            signatureCheckbox instanceof HTMLInputElement &&
            signatureCheckbox.checked;
        const includeTermsPdf =
            !(termsPdfCheckbox instanceof HTMLInputElement) ||
            termsPdfCheckbox.checked;

        if (includeSignatureStampInputRef.current) {
            includeSignatureStampInputRef.current.value = includeSignatureStamp
                ? "yes"
                : "no";
        }

        if (includeTermsPdfInputRef.current) {
            includeTermsPdfInputRef.current.value = includeTermsPdf ? "yes" : "no";
        }
    }

    return (
        <form
            id="invoice-agreement"
            action={updateSaleInvoiceNotesAction}
            onSubmit={handleSubmit}
            className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4"
        >
            <input type="hidden" name="sale_id" value={saleId} />
            <input
                ref={includeSignatureStampInputRef}
                type="hidden"
                name="include_signature_stamp"
                value="no"
            />
            <input
                ref={includeTermsPdfInputRef}
                type="hidden"
                name="include_terms_pdf"
                value="yes"
            />

            <div className="space-y-2">
                <Label
                    htmlFor="sale-invoice-notes"
                    className="font-bold text-slate-700"
                >
                    Zusätzliche Vereinbarung auf der Rechnung
                </Label>
                <Textarea
                    id="sale-invoice-notes"
                    name="invoice_notes"
                    defaultValue={invoiceNotes ?? ""}
                    placeholder="z. B. Sondervereinbarung, Abholbedingung oder ergänzender Rechnungstext..."
                    className="min-h-24 rounded-2xl border-slate-200 bg-white font-medium"
                />
            </div>

            <div className="mt-4 flex justify-end">
                <Button
                    type="submit"
                    className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                >
                    Vereinbarung speichern & PDF neu erstellen
                </Button>
            </div>
        </form>
    );
}
