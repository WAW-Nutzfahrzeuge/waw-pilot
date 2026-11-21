"use client";

import { useState } from "react";
import { Edit3 } from "lucide-react";

import { updateSaleTypeAction } from "@/app/dashboard/sales/[saleId]/record-actions";
import type { SaleDetail } from "@/lib/sales/sale-detail-queries";
import { formatCurrency } from "@/lib/format/currency";
import { getSaleTypeLabel } from "@/lib/sales/sale-helpers";
import { getSaleTaxConfiguration } from "@/utils/sale-tax-rules";
import { FormDialog } from "@/components/dialogs/form-dialog";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";

type SaleTypeEditDialogProps = {
    sale: Pick<
        SaleDetail,
        "id" | "sale_type" | "net_amount" | "vat_rate" | "vat_amount" | "gross_amount" | "customer"
    >;
};

function roundMoney(value: number) {
    return Math.round(value * 100) / 100;
}

export function SaleTypeEditDialog({ sale }: SaleTypeEditDialogProps) {
    const [saleType, setSaleType] = useState(sale.sale_type);
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: sale.customer.type,
        deliveryType: saleType,
        billingCountry: sale.customer.country,
    });
    const vatRate = saleType === sale.sale_type
        ? sale.vat_rate
        : taxConfiguration.defaultVatRate;
    const vatAmount = roundMoney(sale.net_amount * (vatRate / 100));
    const grossAmount = roundMoney(sale.net_amount + vatAmount);
    const hasVatId = Boolean(sale.customer.vat_id?.trim());
    const euCompanyNeedsVatId = saleType !== sale.sale_type && saleType === "eu" && sale.customer.type === "company" && !hasVatId;

    return (
        <FormDialog
            trigger={
                <Button variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-3 font-bold">
                    <Edit3 className="mr-2 size-4" />
                    Verkaufstyp ändern
                </Button>
            }
            title="Verkaufstyp ändern"
            description="Der Verkaufstyp beeinflusst Steuerbeträge, Rechnungs-PDFs und Pflichtdokumente. Vorhandene Dokumente werden nicht gelöscht."
            action={updateSaleTypeAction}
            submitLabel="Verkaufstyp speichern"
        >
            <input type="hidden" name="sale_id" value={sale.id} />

            <FormField label="Verkaufstyp" name="sale_type" required>
                <select
                    id="sale_type"
                    name="sale_type"
                    value={saleType}
                    onChange={(event) => setSaleType(event.target.value as SaleDetail["sale_type"])}
                    required
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                >
                    <option value="inland">Inland</option>
                    <option value="eu">EU-Verkauf</option>
                    <option value="export_third_country">Drittlandexport</option>
                </select>
            </FormField>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-extrabold text-slate-900">Vorschau der Steuerbeträge</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bisher</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                            {getSaleTypeLabel(sale.sale_type)} · {formatCurrency(sale.net_amount)} netto + {formatCurrency(sale.vat_amount)} USt ({sale.vat_rate}%) = {formatCurrency(sale.gross_amount)} brutto
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nach Änderung</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                            {getSaleTypeLabel(saleType)} · {formatCurrency(sale.net_amount)} netto + {formatCurrency(vatAmount)} USt ({vatRate}%) = {formatCurrency(grossAmount)} brutto
                        </p>
                    </div>
                </div>
                {saleType !== sale.sale_type ? (
                    <p className="mt-3 text-xs font-medium leading-5 text-slate-600">
                        Die Vorschau nutzt die im System hinterlegte Standard-Steuerbehandlung für den neuen Verkaufstyp.
                    </p>
                ) : null}
            </div>

            {euCompanyNeedsVatId ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    Für einen EU-Verkauf an eine Firma muss zuerst eine USt-ID beim Kunden hinterlegt werden.
                </p>
            ) : null}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-950">
                Bereits versendete oder an DATEV übermittelte Rechnungen sowie Verkäufe mit Zahlungen oder Rückzahlungen können nicht direkt umgestellt werden. Dafür muss der bestehende Korrektur- oder Stornoprozess verwendet werden. Bei einem EU-Verkauf werden die erforderlichen Export-/Verbringungsdaten anschließend in der Akte ergänzt.
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold leading-6 text-slate-800">
                <input
                    type="checkbox"
                    name="confirm_sale_type_change"
                    value="yes"
                    required
                    className="mt-1 size-4 shrink-0 accent-cyan-700"
                />
                <span>
                    Ich bestätige, dass die Steuerbeträge neu berechnet werden. Falls noch nicht versendete Rechnungen vorhanden sind, werden deren Beträge und PDFs aktualisiert; eine vorhandene ZUGFeRD-Rechnung wird ungültig und muss neu erstellt werden.
                </span>
            </label>
        </FormDialog>
    );
}
