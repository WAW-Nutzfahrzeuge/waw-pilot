"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeVehicleListingDetails, vehicleListingDetailLabels, type VehicleListingDetails } from "@/lib/vehicles/listing-details";

type Props = {
    namePrefix: string;
    vehicleType: string;
    value?: unknown;
    title?: string;
};

export function VehicleListingDetailsFields({ namePrefix, vehicleType, value, title = "Inseratsdaten (optional)" }: Props) {
    const details = normalizeVehicleListingDetails(value);
    const type = vehicleType.toLocaleLowerCase("de-DE");
    const isMixer = type.includes("mischer") || type.includes("betonmixer") || type.includes("betonmischer");
    const isTractor = type.includes("sattelzugmaschine");

    return (
        <section className="space-y-5 rounded-3xl border border-cyan-100 bg-cyan-50/40 p-4 md:p-5">
            <div>
                <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">Nur bestätigte Angaben eintragen. Einheiten sind ausdrücklich angegeben; es erfolgt keine automatische Umrechnung. Diese Felder sind keine Voraussetzung, um den Ankauf zu speichern.</p>
            </div>

            <FieldGroup title="Fahrzeugtechnik">
                <NumberField namePrefix={namePrefix} name="enginePowerKw" label={vehicleListingDetailLabels.enginePowerKw} value={details.enginePowerKw} step="1" />
                <TextField namePrefix={namePrefix} name="fuelType" label="Kraftstoff" value={details.fuelType} />
                <NumberField namePrefix={namePrefix} name="engineDisplacementCc" label="Hubraum (cm³)" value={details.engineDisplacementCc} step="1" />
                <TextField namePrefix={namePrefix} name="transmission" label={vehicleListingDetailLabels.transmission} value={details.transmission} />
                <TextField namePrefix={namePrefix} name="emissionClass" label={vehicleListingDetailLabels.emissionClass} value={details.emissionClass} />
                <TextField namePrefix={namePrefix} name="axleFormula" label={vehicleListingDetailLabels.axleFormula} value={details.axleFormula} />
                <NumberField namePrefix={namePrefix} name="axleCount" label="Anzahl Achsen" value={details.axleCount} step="1" />
                <NumberField namePrefix={namePrefix} name="drivenAxleCount" label="Anzahl angetriebener Achsen" value={details.drivenAxleCount} step="1" />
                <TextField namePrefix={namePrefix} name="frontSuspension" label={vehicleListingDetailLabels.frontSuspension} value={details.frontSuspension} />
                <TextField namePrefix={namePrefix} name="rearSuspension" label={vehicleListingDetailLabels.rearSuspension} value={details.rearSuspension} />
                <NumberField namePrefix={namePrefix} name="permittedMassF1Kg" label="F.1 technisch zulässige Gesamtmasse (kg)" value={details.permittedMassF1Kg} step="1" />
                <NumberField namePrefix={namePrefix} name="permittedMassF2Kg" label="F.2 zulässige Gesamtmasse im Zulassungsstaat (kg)" value={details.permittedMassF2Kg} step="1" />
                <NumberField namePrefix={namePrefix} name="curbWeightKg" label={vehicleListingDetailLabels.curbWeightKg} value={details.curbWeightKg} step="1" />
                <NumberField namePrefix={namePrefix} name="payloadKg" label={vehicleListingDetailLabels.payloadKg} value={details.payloadKg} step="1" />
                <NumberField namePrefix={namePrefix} name="wheelbaseMm" label={vehicleListingDetailLabels.wheelbaseMm} value={details.wheelbaseMm} step="1" />
                <NumberField namePrefix={namePrefix} name="lengthMm" label="Länge (mm)" value={details.lengthMm} step="1" />
                <NumberField namePrefix={namePrefix} name="widthMm" label="Breite (mm)" value={details.widthMm} step="1" />
                <NumberField namePrefix={namePrefix} name="heightMm" label="Höhe (mm)" value={details.heightMm} step="1" />
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
                    <TextAreaField namePrefix={namePrefix} name="mixerDrumCondition" label="Trommelzustand / Verschleiß / Betonanhaftungen" value={details.mixerDrumCondition} />
                    <TextAreaField namePrefix={namePrefix} name="waterSystemFunction" label="Wasseranlage und Funktion" value={details.waterSystemFunction} />
                    <TextAreaField namePrefix={namePrefix} name="mixerRemoteControl" label="Bedienung / Fernbedienung" value={details.mixerRemoteControl} />
                    <TextAreaField namePrefix={namePrefix} name="chuteExtensions" label="Rutschen und Verlängerungen" value={details.chuteExtensions} />
                </> : null}
                <TextAreaField namePrefix={namePrefix} name="includedAccessories" label={vehicleListingDetailLabels.includedAccessories} value={details.includedAccessories} />
                <ChoiceField namePrefix={namePrefix} name="bodyFunctionStatus" label="Funktionsstatus Aufbau" value={details.bodyFunctionStatus} choices={[["unknown", "Unbekannt / nicht geprüft"], ["functional", "Funktionsfähig"], ["limited", "Eingeschränkt"], ["nonfunctional", "Ohne Funktion"]]} />
                <TextAreaField namePrefix={namePrefix} name="bodyKnownIssues" label="Aufbauzustand und bekannte Mängel" value={details.bodyKnownIssues} />
                <TextAreaField namePrefix={namePrefix} name="excludedItems" label="Ausdrücklich nicht enthalten" value={details.excludedItems} />
            </FieldGroup>

            <FieldGroup title="Ausstattung, Zustand und Historie">
                <TextAreaField namePrefix={namePrefix} name="equipment" label={vehicleListingDetailLabels.equipment} value={details.equipment} />
                <TextAreaField namePrefix={namePrefix} name="vehicleCondition" label={vehicleListingDetailLabels.vehicleCondition} value={details.vehicleCondition} />
                <TextAreaField namePrefix={namePrefix} name="bodyCondition" label={vehicleListingDetailLabels.bodyCondition} value={details.bodyCondition} />
                <TextAreaField namePrefix={namePrefix} name="knownDamages" label={vehicleListingDetailLabels.knownDamages} value={details.knownDamages} />
                <ChoiceField namePrefix={namePrefix} name="vehicleReadiness" label="Fahrbereitschaft" value={details.vehicleReadiness} choices={[["unknown", "Unbekannt / nicht geprüft"], ["ready", "Fahrbereit"], ["limited", "Eingeschränkt fahrbereit"], ["not_ready", "Nicht fahrbereit"]]} />
                <TextAreaField namePrefix={namePrefix} name="engineFunction" label="Motorfunktion" value={details.engineFunction} />
                <TextAreaField namePrefix={namePrefix} name="transmissionFunction" label="Getriebefunktion" value={details.transmissionFunction} />
                <TextAreaField namePrefix={namePrefix} name="otherFunction" label="Sonstige Funktion" value={details.otherFunction} />
                <TextAreaField namePrefix={namePrefix} name="cabinCondition" label="Fahrerhaus / Innenraum" value={details.cabinCondition} />
                <TextAreaField namePrefix={namePrefix} name="tireCondition" label="Bereifung und Auffälligkeiten" value={details.tireCondition} />
                <ChoiceField namePrefix={namePrefix} name="currentDamageStatus" label="Aktuelle Schäden / Mängel" value={details.currentDamageStatus} choices={damageChoices} />
                <ChoiceField namePrefix={namePrefix} name="repairedDamageStatus" label="Reparierte Vorschäden" value={details.repairedDamageStatus} choices={damageChoices} />
                <TextAreaField namePrefix={namePrefix} name="repairedDamageDescription" label="Reparierte Vorschäden – Beschreibung" value={details.repairedDamageDescription} />
                <ChoiceField namePrefix={namePrefix} name="maintenanceProofStatus" label="Wartungsnachweise vorhanden" value={details.maintenanceProofStatus} choices={yesNoChoices} />
                <TextAreaField namePrefix={namePrefix} name="publicHighlights" label="Besonderheiten / Highlights" value={details.publicHighlights} />
                <ChoiceField namePrefix={namePrefix} name="featureAirConditioning" label="Klimaanlage" value={details.featureAirConditioning} choices={yesNoChoices} />
                <ChoiceField namePrefix={namePrefix} name="featureCruiseControl" label="Tempomat" value={details.featureCruiseControl} choices={yesNoChoices} />
                <ChoiceField namePrefix={namePrefix} name="featureCamera" label="Kamera" value={details.featureCamera} choices={yesNoChoices} />
                <ChoiceField namePrefix={namePrefix} name="featurePto" label="Nebenantrieb" value={details.featurePto} choices={yesNoChoices} />
                <TextAreaField namePrefix={namePrefix} name="maintenanceHistory" label={vehicleListingDetailLabels.maintenanceHistory} value={details.maintenanceHistory} />
                <TextAreaField namePrefix={namePrefix} name="repairHistory" label={vehicleListingDetailLabels.repairHistory} value={details.repairHistory} />
            </FieldGroup>

            <FieldGroup title="Besichtigung und Verfügbarkeit">
                <ChoiceField namePrefix={namePrefix} name="availabilityStatus" label="Verfügbarkeit" value={details.availabilityStatus} choices={[["unknown", "Unbekannt"], ["immediate", "Sofort"], ["from_date", "Ab Datum"]]} />
                <TextField namePrefix={namePrefix} name="availableFrom" label="Verfügbar ab (JJJJ-MM-TT)" value={details.availableFrom} placeholder="2026-12-01" />
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

const yesNoChoices = [["unknown", "Unbekannt"], ["yes", "Ja"], ["no", "Nein"]] as const;
const damageChoices = [["unknown", "Unbekannt / nicht geprüft"], ["none", "Keine bekannt"], ["known", "Bekannt / vorhanden"]] as const;
function ChoiceField({ namePrefix, name, label, value, choices }: { namePrefix: string; name: string; label: string; value: string; choices: readonly (readonly [string, string])[] }) {
    return <div className="space-y-1.5"><Label htmlFor={`${namePrefix}${name}`} className="text-xs font-bold text-slate-700">{label}</Label><select id={`${namePrefix}${name}`} name={`${namePrefix}${name}`} defaultValue={value} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{choices.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>;
}

export function isVehicleListingDetails(value: unknown): value is VehicleListingDetails {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
