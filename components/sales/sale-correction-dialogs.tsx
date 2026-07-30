"use client";

import { Ban, CreditCard, RotateCcw } from "lucide-react";

import {
    createCancellationInvoiceAction,
    registerSaleRefundAction,
} from "@/app/dashboard/sales/[saleId]/correction-actions";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format/currency";
import { paymentMethods } from "@/lib/payments/payment-methods";
import type { SaleDetailInvoice } from "@/lib/sales/sale-detail-queries";
import { correctionReasonDefinitions } from "@/src/modules/invoice-corrections/domain/constants/correction-types";

type SaleCorrectionDialogsProps = {
    saleId: string;
    originalInvoice: SaleDetailInvoice | null;
    cancellationInvoice: SaleDetailInvoice | null;
    canCancel: boolean;
    outstandingRefundAmount: number;
};

export function SaleCorrectionDialogs({
    saleId,
    originalInvoice,
    cancellationInvoice,
    canCancel,
    outstandingRefundAmount,
}: SaleCorrectionDialogsProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <CancellationDialog
                saleId={saleId}
                invoice={originalInvoice}
                disabled={!canCancel}
            />
            <RefundDialog
                saleId={saleId}
                originalInvoice={originalInvoice}
                correctionInvoice={cancellationInvoice}
                outstandingRefundAmount={outstandingRefundAmount}
            />
        </div>
    );
}

function CancellationDialog({
    saleId,
    invoice,
    disabled,
}: {
    saleId: string;
    invoice: SaleDetailInvoice | null;
    disabled: boolean;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button disabled={disabled} variant="outline" className="rounded-2xl bg-white font-bold">
                    <Ban className="mr-2 size-4" />
                    Stornorechnung erstellen
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl rounded-3xl bg-white">
                <form action={createCancellationInvoiceAction} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            Stornorechnung erstellen
                        </DialogTitle>
                        <DialogDescription>
                            Die Originalrechnung bleibt unverändert. Es wird ein neuer Korrekturbeleg mit eigener Rechnungsnummer erzeugt.
                        </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_id" value={invoice?.id ?? ""} />
                    <FormField label="Korrekturgrund" name="reason_code" required>
                        <select
                            name="reason_code"
                            required
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                            defaultValue="contract_cancelled"
                        >
                            {correctionReasonDefinitions.map((reason) => (
                                <option key={reason.code} value={reason.code}>
                                    {reason.label}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Interne Begründung" name="reason_text">
                        <Textarea name="reason_text" rows={3} placeholder="Optionaler interner Hinweis" />
                    </FormField>
                    <FormField label="Kundenhinweis auf dem Beleg" name="customer_visible_reason">
                        <Textarea name="customer_visible_reason" rows={3} placeholder="Optionaler sichtbarer Hinweis" />
                    </FormField>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <Button type="submit" className="bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                            Stornorechnung finalisieren
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RefundDialog({
    saleId,
    originalInvoice,
    correctionInvoice,
    outstandingRefundAmount,
}: {
    saleId: string;
    originalInvoice: SaleDetailInvoice | null;
    correctionInvoice: SaleDetailInvoice | null;
    outstandingRefundAmount: number;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    disabled={!originalInvoice || outstandingRefundAmount <= 0}
                    className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                >
                    <RotateCcw className="mr-2 size-4" />
                    Rückzahlung erfassen
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl rounded-3xl bg-white">
                <form action={registerSaleRefundAction} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            Rückzahlung erfassen
                        </DialogTitle>
                        <DialogDescription>
                            Offen rückzahlbar: {formatCurrency(outstandingRefundAmount)}. Eine Rückzahlung ist eine tatsächliche Geldbewegung.
                        </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_id" value={originalInvoice?.id ?? ""} />
                    <input type="hidden" name="correction_invoice_id" value={correctionInvoice?.id ?? ""} />
                    <FormField label="Betrag" name="amount" required>
                        <Input
                            name="amount"
                            required
                            inputMode="decimal"
                            defaultValue={outstandingRefundAmount.toLocaleString("de-DE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        />
                    </FormField>
                    <FormField label="Datum" name="refund_date" required>
                        <Input name="refund_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                    </FormField>
                    <FormField label="Rückzahlungsart" name="refund_method" required>
                        <select
                            name="refund_method"
                            required
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                            defaultValue="bank"
                        >
                            {paymentMethods.map((method) => (
                                <option key={method.value} value={method.value}>
                                    {method.label}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label="Grund" name="reason" required>
                        <Input name="reason" required placeholder="z. B. Rückzahlung nach Storno" />
                    </FormField>
                    <FormField label="Externe Referenz" name="external_reference">
                        <Input name="external_reference" placeholder="z. B. Bankreferenz" />
                    </FormField>
                    <FormField label="Notiz" name="note">
                        <Textarea name="note" rows={3} />
                    </FormField>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <Button type="submit" className="bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                            <CreditCard className="mr-2 size-4" />
                            Rückzahlung speichern
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
