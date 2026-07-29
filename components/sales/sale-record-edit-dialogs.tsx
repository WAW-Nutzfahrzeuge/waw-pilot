"use client";

import { Edit3 } from "lucide-react";

import {
    updateSaleCustomerAction,
    updateSaleVehicleAction,
} from "@/app/dashboard/sales/[saleId]/record-actions";
import type { SaleDetail } from "@/lib/sales/sale-detail-queries";
import { EMAIL_LANGUAGE_OPTIONS } from "@/lib/customers/email-languages";
import { phoneInputPattern, sanitizePhoneInput } from "@/lib/validation/phone";
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
import { FormField } from "@/components/forms/form-field";

type SaleCustomerEditDialogProps = {
    saleId: string;
    customer: SaleDetail["customer"];
};

type SaleVehicleEditDialogProps = {
    saleId: string;
    vehicle: SaleDetail["vehicle"];
};

export function SaleCustomerEditDialog({
    saleId,
    customer,
}: SaleCustomerEditDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="rounded-2xl bg-white font-bold">
                    <Edit3 className="mr-2 size-4" />
                    Kunde bearbeiten
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl bg-white">
                <form action={updateSaleCustomerAction} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            Kunde bearbeiten
                        </DialogTitle>
                        <DialogDescription>
                            Änderungen gelten für zukünftige Vorgänge. Bereits erzeugte Rechnungs-PDFs bleiben unverändert.
                        </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="customer_id" value={customer.id} />
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormField label="Käuferart" name="type" required>
                            <select
                                id="type"
                                name="type"
                                defaultValue={customer.type}
                                required
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                            >
                                <option value="company">Unternehmen</option>
                                <option value="private">Privatperson</option>
                            </select>
                        </FormField>
                        <FormField
                            label="Firma"
                            name="company_name"
                            defaultValue={customer.company_name ?? ""}
                        />
                        <FormField
                            label="Inhaber / Ansprechpartner"
                            name="owner_name"
                            defaultValue={customer.owner_name ?? ""}
                        />
                        <FormField
                            label="Vorname"
                            name="first_name"
                            defaultValue={customer.first_name ?? ""}
                        />
                        <FormField
                            label="Nachname"
                            name="last_name"
                            defaultValue={customer.last_name ?? ""}
                        />
                        <FormField
                            label="E-Mail"
                            name="email"
                            type="email"
                            defaultValue={customer.email ?? ""}
                        />
                        <FormField label="Sprache" name="preferred_language">
                            <select
                                id="preferred_language"
                                name="preferred_language"
                                defaultValue={customer.preferred_language}
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                            >
                                {EMAIL_LANGUAGE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <FormField label="Telefon" name="phone">
                            <Input
                                id="phone"
                                name="phone"
                                type="tel"
                                pattern={phoneInputPattern}
                                defaultValue={customer.phone ?? ""}
                                onInput={(event) => {
                                    event.currentTarget.value = sanitizePhoneInput(
                                        event.currentTarget.value,
                                    );
                                }}
                                className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                            />
                        </FormField>
                        <FormField
                            label="Straße und Hausnummer"
                            name="street"
                            required
                            defaultValue={customer.street ?? ""}
                        />
                        <FormField
                            label="PLZ"
                            name="postal_code"
                            required
                            defaultValue={customer.postal_code ?? ""}
                        />
                        <FormField
                            label="Ort"
                            name="city"
                            required
                            defaultValue={customer.city ?? ""}
                        />
                        <FormField
                            label="Land"
                            name="country"
                            defaultValue={customer.country ?? ""}
                        />
                        <FormField
                            label="USt-ID | VAT | NIP"
                            name="vat_id"
                            defaultValue={customer.vat_id ?? ""}
                        />
                        <FormField
                            label="Steuernummer"
                            name="tax_number"
                            defaultValue={customer.tax_number ?? ""}
                        />
                        <FormField
                            label="Handelsregister"
                            name="commercial_register_number"
                            defaultValue={customer.commercial_register_number ?? ""}
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <Button type="submit" className="bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                            Kunde speichern
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function SaleVehicleEditDialog({
    saleId,
    vehicle,
}: SaleVehicleEditDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="rounded-2xl bg-white font-bold">
                    <Edit3 className="mr-2 size-4" />
                    Fahrzeug bearbeiten
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl bg-white">
                <form action={updateSaleVehicleAction} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            Fahrzeug bearbeiten
                        </DialogTitle>
                        <DialogDescription>
                            Änderungen gelten für die Verkaufsakte und zukünftige Rechnungen. Bereits erzeugte PDFs bleiben unverändert.
                        </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="sale_id" value={saleId} />
                    <input type="hidden" name="vehicle_id" value={vehicle.id} />
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                            label="Hersteller"
                            name="manufacturer"
                            required
                            defaultValue={vehicle.manufacturer}
                        />
                        <FormField
                            label="Modell"
                            name="model"
                            required
                            defaultValue={vehicle.model}
                        />
                        <FormField
                            label="Typ"
                            name="vehicle_type"
                            required
                            defaultValue={vehicle.vehicle_type}
                        />
                        <FormField
                            label="Fahrgestellnummer / VIN"
                            name="vin"
                            required
                            defaultValue={vehicle.vin}
                        />
                        <FormField
                            label="Baujahr"
                            name="construction_year"
                            type="number"
                            defaultValue={vehicle.construction_year ?? ""}
                        />
                        <FormField
                            label="Kennzeichen bisher / optional"
                            name="license_plate"
                            defaultValue={vehicle.license_plate ?? ""}
                        />
                        <FormField
                            label="Einkauf netto"
                            name="purchase_price_net"
                            type="number"
                            required
                            defaultValue={vehicle.purchase_price_net}
                        />
                        <FormField
                            label="Nebenkosten netto"
                            name="additional_costs_net"
                            type="number"
                            defaultValue={vehicle.additional_costs_net}
                        />
                    </div>
                    <FormField label="Schäden" name="damage_notes">
                        <Textarea
                            id="damage_notes"
                            name="damage_notes"
                            defaultValue={vehicle.damage_notes ?? ""}
                            className="min-h-28 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                        />
                    </FormField>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <Button type="submit" className="bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                            Fahrzeug speichern
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
