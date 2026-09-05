"use client";

import { useState, type ChangeEventHandler } from "react";
import { Globe2, Save, Truck } from "lucide-react";

import { updateSaleExportDetailsAction } from "@/app/dashboard/sales/[saleId]/export-details-actions";
import type { SaleExportDetails } from "@/lib/sales/sale-export-details-queries";
import {
    getAllowedArrivalPeriods,
    getArrivalYearOptions,
} from "@/lib/sales/export-date-rules";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type SaleExportDetailsFormProps = {
    details: SaleExportDetails;
};

export function SaleExportDetailsForm({ details }: SaleExportDetailsFormProps) {
    const requiresExportDetails =
        details.sale_type === "eu" || details.sale_type === "export_third_country";
    const [destinationCity, setDestinationCity] = useState(
        details.export_destination_city ?? details.buyer_city ?? "",
    );
    const [destinationCountry, setDestinationCountry] = useState(
        details.export_destination_country ?? details.buyer_country ?? "",
    );
    const allowedArrivalPeriods = getAllowedArrivalPeriods(details.sale_date);
    const allowedArrivalYears = getArrivalYearOptions();

    return (
        <Card
            id="export-details"
            className="scroll-mt-24 rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm"
        >
            <CardContent className="p-5">
                <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                        <Globe2 className="size-5" />
                    </div>

                    <div>
                        <h2 className="text-xl font-extrabold text-slate-950">
                            Export- / Verbringungsdaten
                        </h2>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                            Diese Angaben werden für Gelangensbestätigung und
                            Verbringungsnachweis geprüft und später in die PDFs übernommen.
                        </p>
                    </div>
                </div>

                <form action={updateSaleExportDetailsAction} className="mt-5 space-y-5">
                    <input type="hidden" name="sale_id" value={details.sale_id} />

                    <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                            label={getRequiredLabel(
                                "Zielort / Empfangsort",
                                requiresExportDetails,
                            )}
                            name="export_destination_city"
                            value={destinationCity}
                            onChange={(event) => setDestinationCity(event.target.value)}
                            placeholder="z. B. Wien"
                            required={requiresExportDetails}
                        />

                        <FormField
                            label={getRequiredLabel(
                                "Zielland / Empfangsland",
                                requiresExportDetails,
                            )}
                            name="export_destination_country"
                            value={destinationCountry}
                            onChange={(event) => setDestinationCountry(event.target.value)}
                            placeholder="z. B. Österreich"
                            required={requiresExportDetails}
                        />

                        {details.buyer_city || details.buyer_country ? (
                            <div className="md:col-span-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-10 rounded-2xl border-cyan-200 bg-white font-bold text-cyan-800 hover:bg-cyan-50"
                                    onClick={() => {
                                        setDestinationCity(details.buyer_city ?? "");
                                        setDestinationCountry(details.buyer_country ?? "");
                                    }}
                                >
                                    Aus Rechnungsadresse übernehmen
                                </Button>
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <Label
                                htmlFor="export_arrival_month"
                                className="font-bold text-slate-700"
                            >
                                {getRequiredLabel(
                                    "Monat des Gelangens",
                                    requiresExportDetails,
                                )}
                            </Label>
                            <select
                                id="export_arrival_month"
                                name="export_arrival_month"
                                required={requiresExportDetails}
                                defaultValue={details.export_arrival_month ?? ""}
                                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                            >
                                <option value="">Bitte wählen</option>
                                {allowedArrivalPeriods.map((period) => (
                                    <option key={`${period.month}-${period.year}`} value={period.month}>
                                        {period.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label
                                htmlFor="export_arrival_year"
                                className="font-bold text-slate-700"
                            >
                                {getRequiredLabel(
                                    "Jahr des Gelangens",
                                    requiresExportDetails,
                                )}
                            </Label>
                            <select
                                id="export_arrival_year"
                                name="export_arrival_year"
                                required={requiresExportDetails}
                                defaultValue={details.export_arrival_year ?? ""}
                                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                            >
                                <option value="">Bitte wählen</option>
                                {allowedArrivalYears.map((year) => (
                                    <option key={year || "empty"} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <FormField
                            label={getRequiredLabel(
                                "Verbringungs- / Übergabedatum",
                                requiresExportDetails,
                            )}
                            name="export_transport_date"
                            type="date"
                            defaultValue={details.export_transport_date ?? ""}
                            required={requiresExportDetails}
                        />

                        <div className="space-y-2">
                            <Label
                                htmlFor="export_transport_type"
                                className="font-bold text-slate-700"
                            >
                                {getRequiredLabel(
                                    "Art der Verbringung",
                                    requiresExportDetails,
                                )}
                            </Label>
                            <select
                                id="export_transport_type"
                                name="export_transport_type"
                                required={requiresExportDetails}
                                defaultValue={details.export_transport_type ?? ""}
                                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                            >
                                <option value="">Bitte wählen</option>
                                <option value="self_pickup">
                                    Abnehmer befördert selbst
                                </option>
                                <option value="customer_forwarder">
                                    Spedition / Beauftragter des Abnehmers
                                </option>
                                <option value="seller_transport">
                                    Lieferung durch WAW
                                </option>
                                <option value="other">Sonstiges</option>
                            </select>
                        </div>

                    </div>

                    <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
                        <div className="flex items-start gap-3">
                            <Truck className="mt-0.5 size-5 shrink-0 text-amber-700" />
                            <p className="text-sm font-semibold leading-6 text-amber-900">
                                Wichtig: Für Gelangensbestätigung und Verbringungsnachweis
                                müssen Zielort und Zielland korrekt sein. Bei falschen oder
                                fehlenden Angaben sollte das PDF nicht erzeugt werden.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            className="h-11 rounded-2xl bg-cyan-700 px-5 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            Exportdaten speichern
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

function getRequiredLabel(label: string, required: boolean): string {
    return required ? `${label} *` : label;
}

function FormField({
                       label,
                       name,
                       type = "text",
                       defaultValue,
                       placeholder,
                       required = false,
                       value,
                       onChange,
                   }: {
    label: string;
    name: string;
    type?: string;
    defaultValue?: string;
    placeholder?: string;
    required?: boolean;
    value?: string;
    onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
            </Label>
            <Input
                id={name}
                name={name}
                type={type}
                defaultValue={defaultValue}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                required={required}
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
            />
        </div>
    );
}
