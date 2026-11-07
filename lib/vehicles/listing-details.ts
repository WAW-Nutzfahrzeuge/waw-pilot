export type VehicleListingDetails = {
    enginePowerKw: number | null;
    transmission: string | null;
    emissionClass: string | null;
    cab: string | null;
    retarder: string | null;
    hydraulics: string | null;
    axleFormula: string | null;
    frontSuspension: string | null;
    rearSuspension: string | null;
    grossVehicleWeightKg: number | null;
    curbWeightKg: number | null;
    payloadKg: number | null;
    wheelbaseMm: number | null;
    huUntil: string | null;
    spUntil: string | null;
    bodyManufacturer: string | null;
    bodyType: string | null;
    bodyYear: number | null;
    mixerNominalVolumeM3: number | null;
    mixerDrive: string | null;
    waterTankLiters: number | null;
    bodyControls: string | null;
    includedAccessories: string | null;
    equipment: string | null;
    vehicleCondition: string | null;
    bodyCondition: string | null;
    knownDamages: string | null;
    maintenanceHistory: string | null;
    repairHistory: string | null;
    vehicleLocation: string | null;
    availabilityConfirmed: boolean;
    availabilityStatus: "unknown" | "immediate" | "from_date";
    availableFrom: string | null;
    publicHighlights: string | null;
    vehicleReadiness: "unknown" | "ready" | "limited" | "not_ready";
    engineFunction: string | null;
    transmissionFunction: string | null;
    otherFunction: string | null;
    cabinCondition: string | null;
    tireCondition: string | null;
    currentDamageStatus: "unknown" | "none" | "known";
    repairedDamageStatus: "unknown" | "none" | "known";
    repairedDamageDescription: string | null;
    maintenanceProofStatus: "unknown" | "yes" | "no";
    featureAirConditioning: "unknown" | "yes" | "no";
    featureCruiseControl: "unknown" | "yes" | "no";
    featureCamera: "unknown" | "yes" | "no";
    featurePto: "unknown" | "yes" | "no";
    bodyFunctionStatus: "unknown" | "functional" | "limited" | "nonfunctional";
    bodyKnownIssues: string | null;
    excludedItems: string | null;
    mixerDrumCondition: string | null;
    waterSystemFunction: string | null;
    mixerRemoteControl: string | null;
    chuteExtensions: string | null;
    fuelType: string | null;
    engineDisplacementCc: number | null;
    axleCount: number | null;
    drivenAxleCount: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    permittedMassF1Kg: number | null;
    permittedMassF2Kg: number | null;
};

export const emptyVehicleListingDetails: VehicleListingDetails = {
    enginePowerKw: null, transmission: null, emissionClass: null, cab: null, retarder: null,
    hydraulics: null, axleFormula: null,
    frontSuspension: null, rearSuspension: null, grossVehicleWeightKg: null,
    curbWeightKg: null, payloadKg: null, wheelbaseMm: null, huUntil: null,
    spUntil: null, bodyManufacturer: null, bodyType: null, bodyYear: null,
    mixerNominalVolumeM3: null, mixerDrive: null, waterTankLiters: null,
    bodyControls: null, includedAccessories: null, equipment: null,
    vehicleCondition: null, bodyCondition: null, knownDamages: null,
    maintenanceHistory: null, repairHistory: null, vehicleLocation: null,
    availabilityConfirmed: false, availabilityStatus: "unknown", availableFrom: null, publicHighlights: null,
    vehicleReadiness: "unknown", engineFunction: null, transmissionFunction: null, otherFunction: null,
    cabinCondition: null, tireCondition: null, currentDamageStatus: "unknown", repairedDamageStatus: "unknown",
    repairedDamageDescription: null, maintenanceProofStatus: "unknown", featureAirConditioning: "unknown",
    featureCruiseControl: "unknown", featureCamera: "unknown", featurePto: "unknown",
    bodyFunctionStatus: "unknown", bodyKnownIssues: null, excludedItems: null, mixerDrumCondition: null,
    waterSystemFunction: null, mixerRemoteControl: null, chuteExtensions: null, fuelType: null,
    engineDisplacementCc: null, axleCount: null, drivenAxleCount: null, lengthMm: null, widthMm: null,
    heightMm: null, permittedMassF1Kg: null, permittedMassF2Kg: null,
};

const numericLimits: Record<string, { max: number; label: string }> = {
    enginePowerKw: { max: 3000, label: "Motorleistung (kW)" },
    grossVehicleWeightKg: { max: 100000, label: "Zulässiges Gesamtgewicht (kg)" },
    curbWeightKg: { max: 100000, label: "Leergewicht (kg)" },
    payloadKg: { max: 100000, label: "Nutzlast (kg)" },
    wheelbaseMm: { max: 30000, label: "Radstand (mm)" },
    bodyYear: { max: 2100, label: "Aufbaujahr" },
    mixerNominalVolumeM3: { max: 100, label: "Nennvolumen (m³)" },
    waterTankLiters: { max: 10000, label: "Wassertank (Liter)" },
    engineDisplacementCc: { max: 50000, label: "Hubraum (cm³)" }, axleCount: { max: 20, label: "Anzahl Achsen" },
    drivenAxleCount: { max: 20, label: "Anzahl angetriebener Achsen" }, lengthMm: { max: 50000, label: "Länge (mm)" },
    widthMm: { max: 10000, label: "Breite (mm)" }, heightMm: { max: 10000, label: "Höhe (mm)" },
    permittedMassF1Kg: { max: 100000, label: "F.1 technisch zulässige Gesamtmasse (kg)" },
    permittedMassF2Kg: { max: 100000, label: "F.2 zulässige Gesamtmasse im Zulassungsstaat (kg)" },
};

const textLimits: Record<string, number> = {
    transmission: 120, emissionClass: 80, cab: 120, retarder: 120, hydraulics: 160,
    axleFormula: 80, frontSuspension: 120,
    rearSuspension: 120, huUntil: 7, spUntil: 7, bodyManufacturer: 160,
    bodyType: 160, mixerDrive: 160, bodyControls: 300, includedAccessories: 1200,
    equipment: 2000, vehicleCondition: 1200, bodyCondition: 1200, knownDamages: 2000,
    maintenanceHistory: 2000, repairHistory: 2000, vehicleLocation: 240, availableFrom: 10,
    publicHighlights: 1500, engineFunction: 1200, transmissionFunction: 1200, otherFunction: 1200,
    cabinCondition: 1200, tireCondition: 1200, repairedDamageDescription: 2000, bodyKnownIssues: 2000,
    excludedItems: 1200, mixerDrumCondition: 1200, waterSystemFunction: 600, mixerRemoteControl: 400,
    chuteExtensions: 800, fuelType: 80,
};

const choiceValues = {
    availabilityStatus: ["unknown", "immediate", "from_date"], vehicleReadiness: ["unknown", "ready", "limited", "not_ready"],
    currentDamageStatus: ["unknown", "none", "known"], repairedDamageStatus: ["unknown", "none", "known"],
    maintenanceProofStatus: ["unknown", "yes", "no"], featureAirConditioning: ["unknown", "yes", "no"],
    featureCruiseControl: ["unknown", "yes", "no"], featureCamera: ["unknown", "yes", "no"], featurePto: ["unknown", "yes", "no"],
    bodyFunctionStatus: ["unknown", "functional", "limited", "nonfunctional"],
} as const;

export type VehicleListingDetailsParseResult =
    | { ok: true; value: VehicleListingDetails }
    | { ok: false; message: string };

export function parseVehicleListingDetailsForm(formData: FormData, prefix: string, existing?: unknown): VehicleListingDetailsParseResult {
    const existingDetails = normalizeVehicleListingDetails(existing);
    const value: VehicleListingDetails = { ...existingDetails };
    const mutableValue = value as unknown as Record<string, unknown>;
    const getText = (key: keyof typeof textLimits) => {
        const raw = formData.get(`${prefix}${key}`);
        if (typeof raw !== "string") return null;
        const normalized = raw.trim();
        if (normalized.length > textLimits[key]) throw new Error(`${key} darf höchstens ${textLimits[key]} Zeichen enthalten.`);
        return normalized || null;
    };
    const getNumber = (key: keyof typeof numericLimits): number | null => {
        const raw = formData.get(`${prefix}${key}`);
        if (typeof raw !== "string" || !raw.trim()) return null;
        const normalized = raw.trim().replace(",", ".");
        if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) throw new Error(`${numericLimits[key].label}: bitte eine Zahl mit der angegebenen Einheit eingeben.`);
        const number = Number(normalized);
        if (!Number.isFinite(number) || number < 0 || number > numericLimits[key].max) {
            throw new Error(`${numericLimits[key].label}: Wert liegt außerhalb des erlaubten Bereichs.`);
        }
        if (key !== "mixerNominalVolumeM3" && !Number.isInteger(number)) {
            throw new Error(`${numericLimits[key].label}: bitte eine ganze Zahl in der angegebenen Einheit eingeben.`);
        }
        if (key === "bodyYear" && !Number.isInteger(number)) throw new Error("Das Aufbaujahr muss eine ganze Jahreszahl sein.");
        return number;
    };

    try {
        for (const key of Object.keys(numericLimits) as Array<keyof typeof numericLimits>) {
            if (formData.has(`${prefix}${key}`)) mutableValue[key] = getNumber(key);
        }
        for (const key of Object.keys(textLimits) as Array<keyof typeof textLimits>) {
            if (!formData.has(`${prefix}${key}`)) continue;
            const text = getText(key);
            if ((key === "huUntil" || key === "spUntil") && text && !/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
                throw new Error(`${key === "huUntil" ? "HU" : "SP"}: bitte Monat und Jahr im Format JJJJ-MM eingeben.`);
            }
            mutableValue[key] = text;
        }
        for (const key of ["enginePowerKw", "engineDisplacementCc", "axleCount", "lengthMm", "widthMm", "heightMm", "permittedMassF1Kg", "permittedMassF2Kg"] as const) {
            const number = value[key];
            if (number !== null && number <= 0) throw new Error(`${numericLimits[key].label}: bitte einen Wert größer als 0 eingeben.`);
        }
        if (value.bodyYear !== null && value.bodyYear < 1900) throw new Error("Das Aufbaujahr muss zwischen 1900 und 2100 liegen.");
        if (value.axleCount !== null && value.drivenAxleCount !== null && value.drivenAxleCount > value.axleCount) throw new Error("Die Anzahl angetriebener Achsen darf die Anzahl der Achsen nicht überschreiten.");
        for (const [key, allowed] of Object.entries(choiceValues)) {
            const raw = formData.get(`${prefix}${key}`);
            if (typeof raw === "string") {
                if (!allowed.includes(raw as never)) throw new Error("Eine Auswahl für die Inseratsangaben ist ungültig.");
                (value as unknown as Record<string, unknown>)[key] = raw;
            }
        }
        const availability = formData.get(`${prefix}availabilityStatus`);
        if (availability === null && formData.get(`${prefix}availabilityConfirmed`) === "on") value.availabilityStatus = "immediate";
        if (value.availabilityStatus === "from_date" && (!value.availableFrom || !isValidCalendarDate(value.availableFrom))) throw new Error("Bitte ein gültiges Datum für die Verfügbarkeit ab eintragen.");
        if (value.availabilityStatus !== "from_date") value.availableFrom = null;
        if (value.currentDamageStatus === "none" && value.knownDamages) throw new Error("Bei „Keine bekannt“ darf keine Beschreibung aktueller Schäden eingetragen sein.");
        if (value.currentDamageStatus === "known" && !value.knownDamages) throw new Error("Bitte bekannte aktuelle Schäden beschreiben.");
        if (value.repairedDamageStatus === "none" && value.repairedDamageDescription) throw new Error("Bei „Keine bekannt“ darf keine Beschreibung reparierter Vorschäden eingetragen sein.");
        if (value.repairedDamageStatus === "known" && !value.repairedDamageDescription) throw new Error("Bitte reparierte Vorschäden beschreiben.");
        value.availabilityConfirmed = value.availabilityStatus !== "unknown"
            || (existingDetails.availabilityStatus === "unknown" && existingDetails.availabilityConfirmed);
        return { ok: true, value };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Die Inseratsdaten sind ungültig." };
    }
}

function isValidCalendarDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeVehicleListingDetails(value: unknown): VehicleListingDetails {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...emptyVehicleListingDetails };
    const source = value as Record<string, unknown>;
    const output = { ...emptyVehicleListingDetails };
    const mutableOutput = output as unknown as Record<string, unknown>;
    for (const key of Object.keys(numericLimits) as Array<keyof typeof numericLimits>) {
        const candidate = source[key];
        if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 && candidate <= numericLimits[key].max) mutableOutput[key] = candidate;
    }
    for (const key of Object.keys(textLimits) as Array<keyof typeof textLimits>) {
        const candidate = source[key];
        if (typeof candidate === "string" && candidate.length <= textLimits[key]) mutableOutput[key] = candidate.trim() || null;
    }
    output.availabilityConfirmed = source.availabilityConfirmed === true;
    for (const [key, allowed] of Object.entries(choiceValues)) {
        const candidate = source[key];
        if (typeof candidate === "string" && allowed.includes(candidate as never)) (output as unknown as Record<string, unknown>)[key] = candidate;
    }
    return output;
}

export const vehicleListingDetailLabels: Record<string, string> = {
    enginePowerKw: "Motorleistung (kW)", transmission: "Getriebe", emissionClass: "Schadstoffklasse",
    cab: "Fahrerhaus", retarder: "Retarder", hydraulics: "Hydraulik",
    axleFormula: "Achsformel", frontSuspension: "Federung vorne", rearSuspension: "Federung hinten",
    grossVehicleWeightKg: "Zulässiges Gesamtgewicht (kg)", curbWeightKg: "Leergewicht (kg)",
    payloadKg: "Nutzlast (kg)", wheelbaseMm: "Radstand (mm)", huUntil: "HU gültig bis (JJJJ-MM)",
    spUntil: "SP gültig bis (JJJJ-MM)", bodyManufacturer: "Aufbauhersteller", bodyType: "Aufbautyp",
    bodyYear: "Aufbaujahr", mixerNominalVolumeM3: "Nennvolumen (m³)", mixerDrive: "Mischerantrieb",
    waterTankLiters: "Wassertank (Liter)", bodyControls: "Bedienung", includedAccessories: "Enthaltenes Zubehör",
    equipment: "Bestätigte Ausstattung", vehicleCondition: "Fahrzeugzustand", bodyCondition: "Aufbauzustand",
    knownDamages: "Bekannte Schäden und Einschränkungen", maintenanceHistory: "Dokumentierte Wartungen",
    repairHistory: "Dokumentierte Reparaturen", vehicleLocation: "Fahrzeugstandort",
    engineDisplacementCc: "Hubraum (cm³)", axleCount: "Anzahl Achsen", drivenAxleCount: "Anzahl angetriebener Achsen",
    lengthMm: "Länge (mm)", widthMm: "Breite (mm)", heightMm: "Höhe (mm)",
    permittedMassF1Kg: "F.1 technisch zulässige Gesamtmasse (kg)", permittedMassF2Kg: "F.2 zulässige Gesamtmasse im Zulassungsstaat (kg)",
    fuelType: "Kraftstoff", publicHighlights: "Besonderheiten / Highlights", engineFunction: "Motorfunktion",
    transmissionFunction: "Getriebefunktion", otherFunction: "Sonstige Funktion", cabinCondition: "Fahrerhaus / Innenraum",
    tireCondition: "Bereifung und Auffälligkeiten", repairedDamageDescription: "Reparierte Vorschäden (Beschreibung)",
    bodyKnownIssues: "Aufbauzustand und bekannte Mängel", excludedItems: "Ausdrücklich nicht enthalten",
    mixerDrumCondition: "Trommelzustand / Verschleiß / Betonanhaftungen", waterSystemFunction: "Wasseranlage / Funktion",
    mixerRemoteControl: "Bedienung / Fernbedienung", chuteExtensions: "Rutschen und Verlängerungen",
};
