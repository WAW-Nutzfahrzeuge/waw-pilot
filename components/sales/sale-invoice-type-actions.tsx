"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
    ArrowRightLeft,
    CheckCircle2,
    FileSignature,
    FileText,
    Loader2,
    Receipt,
    ScrollText,
    Trash2,
} from "lucide-react";

import {
    createSaleInvoiceAction,
    deleteProformaInvoiceAction,
} from "@/app/dashboard/sales/[saleId]/invoice-actions";
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

type InvoiceRef = {
    id: string;
    invoiceNumber: string;
};

type SaleInvoiceTypeActionsProps = {
    saleId: string;
    /** Nicht umgewandelte Proforma-Rechnung für diesen Verkauf, falls vorhanden. */
    proformaInvoice?: InvoiceRef | null;
    /** Finale ("standard") Rechnung für diesen Verkauf, falls vorhanden. */
    standardInvoice?: InvoiceRef | null;
    damageNotes?: string | null;
    allowDamageNotesOnInvoice?: boolean;
    includeDamageNotesOnInvoice?: boolean;
    hasSignatureStampAssets?: boolean;
    initialIncludeSignatureStamp?: boolean;
    initialIncludeTermsPdf?: boolean;
};

export function SaleInvoiceTypeActions({
                                           saleId,
                                           proformaInvoice = null,
                                           standardInvoice = null,
                                           damageNotes = null,
                                           allowDamageNotesOnInvoice = false,
                                           includeDamageNotesOnInvoice = false,
                                           hasSignatureStampAssets = false,
                                           initialIncludeSignatureStamp = false,
                                           initialIncludeTermsPdf = false,
                                       }: SaleInvoiceTypeActionsProps) {
    const hasDamageNotes = Boolean(damageNotes?.trim());
    const canIncludeDamageNotes = hasDamageNotes && allowDamageNotesOnInvoice;
    const [includeDamageNotes, setIncludeDamageNotes] = useState(
        includeDamageNotesOnInvoice && canIncludeDamageNotes,
    );
    const [includeSignatureStamp, setIncludeSignatureStamp] = useState(
        hasSignatureStampAssets && initialIncludeSignatureStamp,
    );
    const [includeTermsPdf, setIncludeTermsPdf] = useState(initialIncludeTermsPdf);

    const hiddenOptionInputs = (
        <>
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
            <input
                type="hidden"
                name="include_terms_pdf"
                value={includeTermsPdf ? "yes" : "no"}
            />
        </>
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
                        Erfasse zuerst Schadensangaben am Fahrzeug, um sie auf Rechnungen auszugeben.
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

            <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-slate-200 bg-white p-4">
                <input
                    id={`sale-${saleId}-include-terms-pdf`}
                    type="checkbox"
                    checked={includeTermsPdf}
                    onChange={(event) =>
                        setIncludeTermsPdf(event.currentTarget.checked)
                    }
                    className="mt-1 size-4 rounded border-slate-300 text-cyan-700"
                />
                <span>
                    <span className="flex items-center gap-2 font-extrabold text-slate-950">
                        <ScrollText className="size-4 text-cyan-700" />
                        AGB in Rechnung einfügen
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-6 text-slate-600">
                        Hängt die in den Einstellungen hinterlegte AGB-PDF an die
                        erzeugte Rechnung an.
                    </span>
                </span>
            </label>

            {standardInvoice ? (
                <InvoiceStateCard
                    icon="receipt"
                    label="Rechnung vorhanden"
                    description="Bereits in der Rechnungsliste unten sichtbar"
                />
            ) : proformaInvoice ? (
                <div className="grid gap-3 lg:grid-cols-2">
                    <ProformaExistsCard
                        saleId={saleId}
                        proformaInvoice={proformaInvoice}
                    />
                    <ConvertProformaCard
                        saleId={saleId}
                        proformaInvoice={proformaInvoice}
                        hiddenOptionInputs={hiddenOptionInputs}
                    />
                </div>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    <form action={createSaleInvoiceAction}>
                        <input type="hidden" name="sale_id" value={saleId} />
                        <input type="hidden" name="invoice_type" value="standard" />
                        {hiddenOptionInputs}

                        <InvoiceSubmitButton
                            icon="receipt"
                            label="Rechnung erstellen"
                            description="Erstellt direkt die endgültige Rechnung mit der nächsten regulären Rechnungsnummer."
                        />
                    </form>

                    <form action={createSaleInvoiceAction}>
                        <input type="hidden" name="sale_id" value={saleId} />
                        <input type="hidden" name="invoice_type" value="proforma" />
                        {hiddenOptionInputs}

                        <InvoiceSubmitButton
                            icon="file"
                            label="Proforma-Rechnung erstellen"
                            description="Erstellt zunächst eine Proforma-Rechnung. Es wird keine reguläre Rechnungsnummer vergeben."
                        />
                    </form>
                </div>
            )}
        </div>
    );
}

function ProformaExistsCard({
                                saleId,
                                proformaInvoice,
                             }: {
    saleId: string;
    proformaInvoice: InvoiceRef;
}) {
    return (
        <div className="flex h-full flex-col justify-between rounded-3xl border border-slate-900/20 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                    <FileText className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words text-lg font-black leading-snug text-slate-950">
                        Proforma-Rechnung vorhanden
                    </span>
                    <span className="mt-1 block whitespace-normal break-words text-xs font-semibold leading-relaxed text-slate-500">
                        {proformaInvoice.invoiceNumber} · unten in der Rechnungsliste
                        einsehbar und herunterladbar
                    </span>
                </span>
            </div>

            <DeleteProformaDialog saleId={saleId} proformaInvoice={proformaInvoice} />
        </div>
    );
}

function DeleteProformaDialog({
                                  saleId,
                                  proformaInvoice,
                              }: {
    saleId: string;
    proformaInvoice: InvoiceRef;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full rounded-2xl border-red-200 bg-white font-bold text-red-700 hover:bg-red-50"
                >
                    <Trash2 className="mr-2 size-4" />
                    Proforma löschen
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-xl font-extrabold text-slate-950">
                        Proforma-Rechnung löschen?
                    </DialogTitle>
                    <DialogDescription className="text-sm font-medium leading-6 text-slate-600">
                        Proforma-Rechnung {proformaInvoice.invoiceNumber} und das
                        zugehörige PDF werden endgültig gelöscht. Dies kann nicht
                        rückgängig gemacht werden. Die Proforma-Nummer wird nicht erneut
                        vergeben.
                    </DialogDescription>
                </DialogHeader>

                <form action={deleteProformaInvoiceAction}>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input
                        type="hidden"
                        name="invoice_id"
                        value={proformaInvoice.id}
                    />

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-2xl font-bold"
                            >
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <DeleteProformaSubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteProformaSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            disabled={pending}
            className="rounded-2xl bg-red-700 font-bold text-white hover:bg-red-800"
        >
            {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
                <Trash2 className="mr-2 size-4" />
            )}
            {pending ? "Wird gelöscht..." : "Proforma löschen"}
        </Button>
    );
}

function ConvertProformaCard({
                                 saleId,
                                 proformaInvoice,
                                 hiddenOptionInputs,
                             }: {
    saleId: string;
    proformaInvoice: InvoiceRef;
    hiddenOptionInputs: React.ReactNode;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-28 w-full items-start justify-start rounded-3xl border-cyan-700 bg-cyan-700 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-800"
                >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white">
                        <ArrowRightLeft className="size-5" />
                    </span>
                    <span className="ml-3 min-w-0 flex-1 overflow-hidden">
                        <span className="block whitespace-normal break-words text-lg font-black leading-snug text-white">
                            In Rechnung umwandeln
                        </span>
                        <span className="mt-1 block whitespace-normal break-words text-xs font-semibold leading-relaxed text-cyan-50">
                            Vergibt die nächste reguläre Rechnungsnummer
                        </span>
                    </span>
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-3xl bg-white">
                <DialogHeader>
                    <DialogTitle className="text-xl font-extrabold text-slate-950">
                        Proforma in Rechnung umwandeln?
                    </DialogTitle>
                    <DialogDescription className="text-sm font-medium leading-6 text-slate-600">
                        Die Proforma-Rechnung {proformaInvoice.invoiceNumber} wird als
                        endgültige Rechnung übernommen. Dabei wird die nächste freie
                        Rechnungsnummer aus dem regulären Rechnungsnummernkreis vergeben.
                    </DialogDescription>
                </DialogHeader>

                <form action={createSaleInvoiceAction}>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="invoice_type" value="standard" />
                    {hiddenOptionInputs}

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-2xl font-bold"
                            >
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <ConvertProformaSubmitButton />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ConvertProformaSubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            disabled={pending}
            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
        >
            {pending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
                <ArrowRightLeft className="mr-2 size-4" />
            )}
            {pending ? "Wird umgewandelt..." : "In Rechnung umwandeln"}
        </Button>
    );
}

function InvoiceStateCard({
                              icon,
                              label,
                              description,
                          }: {
    icon: "file" | "receipt";
    label: string;
    description: string;
}) {
    const Icon = icon === "file" ? FileText : Receipt;

    return (
        <div className="flex h-auto min-h-28 w-full items-start justify-start rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="size-5" />
            </span>
            <span className="ml-3 min-w-0 flex-1 overflow-hidden">
                <span className="block whitespace-normal break-words text-lg font-black leading-snug text-slate-950">
                    {label}
                </span>
                <span className="mt-1 block whitespace-normal break-words text-xs font-semibold leading-relaxed text-slate-500">
                    {description}
                </span>
            </span>
            <Icon className="size-5 shrink-0 text-emerald-700" />
        </div>
    );
}

function InvoiceSubmitButton({
                                 icon,
                                 label,
                                 description,
                             }: {
    icon: "file" | "receipt";
    label: string;
    description: string;
}) {
    const { pending } = useFormStatus();
    const Icon = icon === "file" ? FileText : Receipt;

    return (
        <Button
            type="submit"
            disabled={pending}
            variant="outline"
            className="h-auto min-h-28 w-full items-start justify-start rounded-3xl border-slate-900/20 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
        >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
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
