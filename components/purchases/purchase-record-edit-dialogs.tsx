"use client";

import { Edit3 } from "lucide-react";

import { updateCustomerMasterDataAction } from "@/app/dashboard/customers/[customerId]/actions";
import { updatePurchaseVehicleAction } from "@/app/dashboard/ankauf/[purchaseId]/record-actions";
import { EMAIL_LANGUAGE_OPTIONS } from "@/lib/customers/email-languages";
import type { PurchaseCaseDetail } from "@/lib/purchases/purchase-detail-queries";
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

type PurchaseSellerEditDialogProps = {
    purchaseId: string;
    seller: NonNullable<PurchaseCaseDetail["seller"]>;
};

type PurchaseVehicleEditDialogProps = {
    purchaseId: string;
    vehicle: NonNullable<PurchaseCaseDetail["vehicle"]>;
};

export function PurchaseSellerEditDialog({
    purchaseId,
    seller,
}: PurchaseSellerEditDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="rounded-2xl bg-white font-bold">
                    <Edit3 className="mr-2 size-4" />
                    Bearbeiten
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl bg-white">
                <form action={updateCustomerMasterDataAction} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            Verkäufer bearbeiten
                        </DialogTitle>
                        <DialogDescription>
                            Änderungen werden am verknüpften Kundendatensatz gespeichert und in dieser Ankaufsakte angezeigt.
                        </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="customer_id" value={seller.id} />
                    <input
                        type="hidden"
                        name="redirect_to"
                        value={`/dashboard/ankauf/${purchaseId}?sellerSaved=1`}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                        {seller.type === "company" ? (
                            <>
                                <FormField
                                    label="Firma"
                                    name="company_name"
                                    defaultValue={seller.company_name ?? ""}
                                />
                                <FormField
                                    label="Inhaber / Ansprechpartner"
                                    name="owner_name"
                                    defaultValue={seller.owner_name ?? ""}
                                />
                            </>
                        ) : (
                            <>
                                <FormField
                                    label="Vorname"
                                    name="first_name"
                                    defaultValue={seller.first_name ?? ""}
                                />
                                <FormField
                                    label="Nachname"
                                    name="last_name"
                                    defaultValue={seller.last_name ?? ""}
                                />
                            </>
                        )}
                        <FormField
                            label="E-Mail"
                            name="email"
                            type="email"
                            defaultValue={seller.email ?? ""}
                        />
                        <FormField label="Sprache" name="preferred_language">
                            <select
                                id="preferred_language"
                                name="preferred_language"
                                defaultValue={seller.preferred_language ?? "de"}
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
                                defaultValue={seller.phone ?? ""}
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
                            defaultValue={seller.street ?? ""}
                        />
                        <FormField
                            label="PLZ"
                            name="postal_code"
                            defaultValue={seller.postal_code ?? ""}
                        />
                        <FormField
                            label="Ort"
                            name="city"
                            defaultValue={seller.city ?? ""}
                        />
                        <FormField
                            label="Land"
                            name="country"
                            defaultValue={seller.country ?? ""}
                        />
                        <FormField
                            label="USt-ID | VAT | NIP"
                            name="vat_id"
                            defaultValue={seller.vat_id ?? ""}
                        />
                        <FormField
                            label="Steuernummer"
                            name="tax_number"
                            defaultValue={seller.tax_number ?? ""}
                        />
                    </div>

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <Button type="submit" className="bg-cyan-700 font-bold text-white hover:bg-cyan-800">
                            Verkäufer speichern
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function PurchaseVehicleEditDialog({
    purchaseId,
    vehicle,
}: PurchaseVehicleEditDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" className="rounded-2xl bg-white font-bold">
                    <Edit3 className="mr-2 size-4" />
                    Bearbeiten
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl bg-white">
                <form action={updatePurchaseVehicleAction} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            Fahrzeug bearbeiten
                        </DialogTitle>
                        <DialogDescription>
                            Änderungen werden am Fahrzeug im Bestand gespeichert und in dieser Ankaufsakte angezeigt.
                        </DialogDescription>
                    </DialogHeader>
                    <input type="hidden" name="vehicle_id" value={vehicle.id} />
                    <input
                        type="hidden"
                        name="redirect_to"
                        value={`/dashboard/ankauf/${purchaseId}?vehicleSaved=1`}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                            label="Interne Fahrzeugnummer"
                            name="internal_number"
                            required
                            defaultValue={vehicle.internal_number}
                        />
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
                        <FormField label="Status" name="status">
                            <select
                                id="status"
                                name="status"
                                defaultValue={vehicle.status}
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                            >
                                <option value="in_stock">Im Bestand</option>
                                <option value="reserved">Reserviert</option>
                                <option value="sold">Verkauft</option>
                            </select>
                        </FormField>
                    </div>
                    <FormField label="Schäden" name="damage_notes">
                        <Textarea
                            id="damage_notes"
                            name="damage_notes"
                            defaultValue={vehicle.damage_notes ?? ""}
                            className="min-h-28 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                        />
                    </FormField>
                    <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                        <input
                            type="checkbox"
                            name="show_damage_on_invoice"
                            value="yes"
                            defaultChecked={
                                vehicle.show_damage_on_invoice &&
                                Boolean(vehicle.damage_notes?.trim())
                            }
                            className="mt-1 size-4 rounded border-amber-300"
                        />
                        Schäden auf Rechnung ausweisen
                    </label>
                    <FormField label="Notizen" name="notes">
                        <Textarea
                            id="notes"
                            name="notes"
                            defaultValue={vehicle.notes ?? ""}
                            className="min-h-24 rounded-2xl border-slate-200 bg-slate-50 font-medium"
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
