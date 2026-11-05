"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeVehicleListingDetails, vehicleListingDetailLabels, type VehicleListingDetails } from "@/lib/vehicles/listing-details";

type Props = {
    namePrefix: string;
    vehicleType: string;
    value?: unknown;
};

export function VehicleListingDetailsFields({ namePrefix, vehicleType, value }: Props) {
    const details = normalizeVehicleListingDetails(value);
    const type = vehicleType.toLocaleLowerCase("de-DE");
    const isMixer = type.includes("mischer") || type.includes("betonmixer") || type.includes("betonmischer");
    const isTractor = type.includes("sattelzugmaschine");

    return (
        <section className="space-y-5 rounded-3xl border border-cyan-100 bg-cyan-50/40 p-4 md:p-5">
            <div>
                <h3 className="text-lg font-extrabold text-slate-900">Inseratsdaten (optional)</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">Nur bestätigte Angaben eintragen. Einheiten sind ausdrücklich angegeben; es erfolgt keine automatische Umrechnung. Diese Felder sind keine Voraussetzung, um den Ankauf zu speichern.</p>
            </div>

            <FieldGroup title="Fahrzeugtechnik">
                <NumberField namePrefix={namePrefix} name="enginePowerKw" label={vehicleListingDetailLabels.enginePowerKw} value={details.enginePowerKw} step="1" />
                <TextField namePrefix={namePrefix} name="transmission" label={vehicleListingDetailLabels.transmission} value={details.transmission} />
                <TextField namePrefix={namePrefix} name="emissionClass" label={vehicleListingDetailLabels.emissionClass} value={details.emissionClass} />
                <TextField namePrefix={namePrefix} name="axleFormula" label={vehicleListingDetailLabels.axleFormula} value={details.axleFormula} />
                <TextField namePrefix={namePrefix} name="frontSuspension" label={vehicleListingDetailLabels.frontSuspension} value={details.frontSuspension} />
                <TextField namePrefix={namePrefix} name="rearSuspension" label={vehicleListingDetailLabels.rearSuspension} value={details.rearSuspension} />
                <NumberField namePrefix={namePrefix} name="grossVehicleWeightKg" label={vehicleListingDetailLabels.grossVehicleWeightKg} value={details.grossVehicleWeightKg} step="1" />
                <NumberField namePrefix={namePrefix} name="curbWeightKg" label={vehicleListingDetailLabels.curbWeightKg} value={details.curbWeightKg} step="1" />
                <NumberField namePrefix={namePrefix} name="payloadKg" label={vehicleListingDetailLabels.payloadKg} value={details.payloadKg} step="1" />
                <NumberField namePrefix={namePrefix} name="wheelbaseMm" label={vehicleListingDetailLabels.wheelbaseMm} value={details.wheelbaseMm} step="1" />
                <TextField namePrefix={namePrefix} name="huUntil" label={vehicleListingDetailLabels.huUntil} value={details.huUntil} placeholder="2027-05" />
                <TextField namePrefix={namePrefix} name="spUntil" label={vehicleListingDetailLabels.spUntil} value={details.spUntil} placeholder="2027-05" />
                {isTractor ? <>
                    <TextField namePrefix={namePrefix} name="cab" label={vehicleListingDetailLabels.cab} value={details.cab} />
                    <TextField namePrefix={namePrefix} name="retarder" label={vehicleListingDetailLabels.retarder} value={details.retarder} />
                    <TextField namePrefix={namePrefix} name="hydraulics" label={vehicleListingDetailLabels.hydraulics} value={details.hydraulics} />
                </> : null}
            </FieldGroup>

            <FieldGroup title={isMixer ? "Betonmischeraufbau" : isTractor ? "Weiterer Aufbau" : "Aufbau und Fahrzeugart"}>
                <TextField namePrefix={namePrefix} name="bodyManufacturer" label={vehicleListingDetailLabels.bodyManufacturer} value={details.bodyManufacturer} />
                <TextField namePrefix={namePrefix} name="bodyType" label={vehicleListingDetailLabels.bodyType} value={details.bodyType} />
                <NumberField namePrefix={namePrefix} name="bodyYear" label={vehicleListingDetailLabels.bodyYear} value={details.bodyYear} step="1" min="1900" max="2100" />
                {isMixer ? <>
                    <NumberField namePrefix={namePrefix} name="mixerNominalVolumeM3" label={vehicleListingDetailLabels.mixerNominalVolumeM3} value={details.mixerNominalVolumeM3} step="0.1" />
                    <TextField namePrefix={namePrefix} name="mixerDrive" label={vehicleListingDetailLabels.mixerDrive} value={details.mixerDrive} />
                    <NumberField namePrefix={namePrefix} name="waterTankLiters" label={vehicleListingDetailLabels.waterTankLiters} value={details.waterTankLiters} step="1" />
                    <TextField namePrefix={namePrefix} name="bodyControls" label={vehicleListingDetailLabels.bodyControls} value={details.bodyControls} />
                </> : null}
                <TextAreaField namePrefix={namePrefix} name="includedAccessories" label={vehicleListingDetailLabels.includedAccessories} value={details.includedAccessories} />
            </FieldGroup>

            <FieldGroup title="Ausstattung, Zustand und Historie">
                <TextAreaField namePrefix={namePrefix} name="equipment" label={vehicleListingDetailLabels.equipment} value={details.equipment} />
                <TextAreaField namePrefix={namePrefix} name="vehicleCondition" label={vehicleListingDetailLabels.vehicleCondition} value={details.vehicleCondition} />
                <TextAreaField namePrefix={namePrefix} name="bodyCondition" label={vehicleListingDetailLabels.bodyCondition} value={details.bodyCondition} />
                <TextAreaField namePrefix={namePrefix} name="knownDamages" label={vehicleListingDetailLabels.knownDamages} value={details.knownDamages} />
                <TextAreaField namePrefix={namePrefix} name="maintenanceHistory" label={vehicleListingDetailLabels.maintenanceHistory} value={details.maintenanceHistory} />
                <TextAreaField namePrefix={namePrefix} name="repairHistory" label={vehicleListingDetailLabels.repairHistory} value={details.repairHistory} />
            </FieldGroup>

            <FieldGroup title="Besichtigung und Verfügbarkeit">
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700 md:col-span-2">
                    <input type="checkbox" name={`${namePrefix}availabilityConfirmed`} defaultChecked={details.availabilityConfirmed} className="mt-1 size-4 accent-cyan-700" />
                    Verfügbarkeit für Besichtigungen ist bestätigt
                </label>
                <TextField namePrefix={namePrefix} name="vehicleLocation" label={vehicleListingDetailLabels.vehicleLocation} value={details.vehicleLocation} />
            </FieldGroup>
        </section>
    );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return <fieldset className="space-y-3"><legend className="mb-2 text-sm font-extrabold text-slate-800">{title}</legend><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div></fieldset>;
}

function TextField({ namePrefix, name, label, value, placeholder }: { namePrefix: string; name: string; label: string; value: string | null; placeholder?: string }) {
    return <div className="space-y-1.5"><Label htmlFor={`${namePrefix}${name}`} className="text-xs font-bold text-slate-700">{label}</Label><Input id={`${namePrefix}${name}`} name={`${namePrefix}${name}`} defaultValue={value ?? ""} placeholder={placeholder} maxLength={name === "vehicleLocation" ? 240 : 200} className="h-10 rounded-xl border-slate-200 bg-white" /></div>;
}

function NumberField({ namePrefix, name, label, value, step, min = "0", max }: { namePrefix: string; name: string; label: string; value: number | null; step: string; min?: string; max?: string }) {
    return <div className="space-y-1.5"><Label htmlFor={`${namePrefix}${name}`} className="text-xs font-bold text-slate-700">{label}</Label><Input id={`${namePrefix}${name}`} name={`${namePrefix}${name}`} type="number" min={min} max={max} step={step} defaultValue={value ?? ""} className="h-10 rounded-xl border-slate-200 bg-white" /></div>;
}

function TextAreaField({ namePrefix, name, label, value }: { namePrefix: string; name: string; label: string; value: string | null }) {
    return <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${namePrefix}${name}`} className="text-xs font-bold text-slate-700">{label}</Label><Textarea id={`${namePrefix}${name}`} name={`${namePrefix}${name}`} defaultValue={value ?? ""} maxLength={name === "equipment" || name === "knownDamages" || name === "maintenanceHistory" || name === "repairHistory" ? 2000 : 1200} rows={3} className="min-h-20 rounded-xl border-slate-200 bg-white" /></div>;
}

export function isVehicleListingDetails(value: unknown): value is VehicleListingDetails {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
