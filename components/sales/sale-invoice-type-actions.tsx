"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, FileSignature, FileText, Loader2, Receipt } from "lucide-react";

import { createSaleInvoiceAction } from "@/app/dashboard/sales/[saleId]/invoice-actions";
import type { InvoiceType } from "@/lib/invoices/invoice-numbering";
import { Button } from "@/components/ui/button";

type SaleInvoiceTypeActionsProps = {
    saleId: string;
    existingInvoiceTypes?: InvoiceType[];
    damageNotes?: string | null;
    allowDamageNotesOnInvoice?: boolean;
    includeDamageNotesOnInvoice?: boolean;
    hasSignatureStampAssets?: boolean;
    initialIncludeSignatureStamp?: boolean;
};

export function SaleInvoiceTypeActions({
                                           saleId,
                                           existingInvoiceTypes = [],
                                           damageNotes = null,
                                           allowDamageNotesOnInvoice = false,
                                           includeDamageNotesOnInvoice = false,
                                           hasSignatureStampAssets = false,
                                           initialIncludeSignatureStamp = false,
                                       }: SaleInvoiceTypeActionsProps) {
    const hasStandard = existingInvoiceTypes.includes("standard");
    const hasProforma = existingInvoiceTypes.includes("proforma");
    const hasDamageNotes = Boolean(damageNotes?.trim());
    const canIncludeDamageNotes = hasDamageNotes && allowDamageNotesOnInvoice;
    const [includeDamageNotes, setIncludeDamageNotes] = useState(
        includeDamageNotesOnInvoice && canIncludeDamageNotes,
    );
    const [includeSignatureStamp, setIncludeSignatureStamp] = useState(
        hasSignatureStampAssets && initialIncludeSignatureStamp,
    );

    return (
        <div className="mt-5 space-y-3">
            {canIncludeDamageNotes ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                    <input
                        id={`sale-${saleId}-include-damage-notes`}
                        type="checkbox"
                        checked={includeDamageNotes}
                        onChange={(event) =>
                            setIncludeDamageNotes(event.currentTarget.checked)
                        }
                        className="mt-1 size-4 rounded border-amber-300 text-amber-700"
                    />
                    <span>
                        <span className="block font-extrabold text-amber-950">
                            Schäden auf Rechnung aufführen
                        </span>
                        <span className="mt-1 block text-sm font-medium leading-6 text-amber-900">
                            Die beim Fahrzeug hinterlegten Schäden werden als Hinweis auf
                            der Rechnung ausgegeben.
                        </span>
                    </span>
                </label>
            ) : null}

            {hasDamageNotes && !allowDamageNotesOnInvoice ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-extrabold text-slate-950">
                        Schadensangaben bleiben intern
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                        Aktiviere in der Fahrzeugakte „Schadensangaben auf Rechnungen anzeigen“, um eine Rechnungsvariante mit Schäden zu erzeugen.
                    </p>
                </div>
            ) : null}

            <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-slate-200 bg-white p-4">
                <input
                    id={`sale-${saleId}-include-signature-stamp`}
                    type="checkbox"
                    checked={includeSignatureStamp}
                    disabled={!hasSignatureStampAssets}
                    onChange={(event) =>
                        setIncludeSignatureStamp(event.currentTarget.checked)
                    }
                    className="mt-1 size-4 rounded border-slate-300 text-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                    <span className="flex items-center gap-2 font-extrabold text-slate-950">
                        <FileSignature className="size-4 text-cyan-700" />
                        Unterschrift & Stempel einfügen
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-6 text-slate-600">
                        Fügt die hinterlegte digitale Unterschrift und den Firmenstempel
                        in die Rechnung ein.
                    </span>
                    {!hasSignatureStampAssets ? (
                        <span className="mt-1 block text-xs font-bold leading-5 text-amber-700">
                            Bitte hinterlege zuerst Unterschrift und Firmenstempel in den Einstellungen.
                        </span>
                    ) : null}
                </span>
            </label>

            <div className="grid gap-3 lg:grid-cols-2">
                <form action={createSaleInvoiceAction}>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_type" value="standard" />
                    <input
                        type="hidden"
                        name="include_damage_notes_on_invoice"
                        value={includeDamageNotes ? "yes" : "no"}
                    />
                    <input
                        type="hidden"
                        name="include_signature_stamp"
                        value={includeSignatureStamp ? "yes" : "no"}
                    />

                    <InvoiceSubmitButton
                        icon="receipt"
                        label={hasStandard ? "Rechnung vorhanden" : "Rechnung erstellen"}
                        description={
                            hasStandard
                                ? "Bereits in der Rechnungsliste unten sichtbar"
                                : "Erstellt die normale Verkaufsrechnung"
                        }
                        disabled={hasStandard}
                        done={hasStandard}
                    />
                </form>

                <form action={createSaleInvoiceAction}>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_type" value="proforma" />
                    <input
                        type="hidden"
                        name="include_damage_notes_on_invoice"
                        value={includeDamageNotes ? "yes" : "no"}
                    />
                    <input
                        type="hidden"
                        name="include_signature_stamp"
                        value={includeSignatureStamp ? "yes" : "no"}
                    />

                    <InvoiceSubmitButton
                        icon="file"
                        label={
                            hasProforma
                                ? "Proforma-Rechnung vorhanden"
                                : "Proforma-Rechnung erstellen"
                        }
                        description={
                            hasProforma
                                ? "Bereits in der Rechnungsliste unten sichtbar"
                                : "Eigener Nummernkreis PRO-026"
                        }
                        disabled={hasProforma}
                        done={hasProforma}
                    />
                </form>
            </div>
        </div>
    );
}

function InvoiceSubmitButton({
                                 icon,
                                 label,
                                 description,
                                 disabled = false,
                                 done = false,
                             }: {
    icon: "file" | "receipt";
    label: string;
    description: string;
    disabled?: boolean;
    done?: boolean;
}) {
    const { pending } = useFormStatus();
    const Icon = done ? CheckCircle2 : icon === "file" ? FileText : Receipt;

    return (
        <Button
            type="submit"
            disabled={disabled || pending}
            variant="outline"
            className={
                done
                    ? "h-auto min-h-28 w-full items-start justify-start rounded-3xl border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm disabled:cursor-default disabled:opacity-100"
                    : "h-auto min-h-28 w-full items-start justify-start rounded-3xl border-slate-900/20 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
            }
        >
            <span
                className={
                    done
                        ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"
                        : "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"
                }
            >
                {pending ? (
                    <Loader2 className="size-5 animate-spin" />
                ) : (
                    <Icon className="size-5" />
                )}
            </span>

            <span className="ml-3 min-w-0 flex-1 overflow-hidden">
                <span className="block whitespace-normal break-words text-lg font-black leading-snug text-slate-950">
                    {pending ? "Wird erstellt..." : label}
                </span>
                <span className="mt-1 block whitespace-normal break-words text-xs font-semibold leading-relaxed text-slate-500">
                    {description}
                </span>
            </span>
        </Button>
    );
}
