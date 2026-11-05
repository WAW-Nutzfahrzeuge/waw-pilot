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
    availabilityConfirmed: false,
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
};

const textLimits: Record<string, number> = {
    transmission: 120, emissionClass: 80, cab: 120, retarder: 120, hydraulics: 160,
    axleFormula: 80, frontSuspension: 120,
    rearSuspension: 120, huUntil: 7, spUntil: 7, bodyManufacturer: 160,
    bodyType: 160, mixerDrive: 160, bodyControls: 300, includedAccessories: 1200,
    equipment: 2000, vehicleCondition: 1200, bodyCondition: 1200, knownDamages: 2000,
    maintenanceHistory: 2000, repairHistory: 2000, vehicleLocation: 240,
};

export type VehicleListingDetailsParseResult =
    | { ok: true; value: VehicleListingDetails }
    | { ok: false; message: string };

export function parseVehicleListingDetailsForm(formData: FormData, prefix: string): VehicleListingDetailsParseResult {
    const value: VehicleListingDetails = { ...emptyVehicleListingDetails };
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
            mutableValue[key] = getNumber(key);
        }
        for (const key of Object.keys(textLimits) as Array<keyof typeof textLimits>) {
            const text = getText(key);
            if ((key === "huUntil" || key === "spUntil") && text && !/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
                throw new Error(`${key === "huUntil" ? "HU" : "SP"}: bitte Monat und Jahr im Format JJJJ-MM eingeben.`);
            }
            mutableValue[key] = text;
        }
        value.availabilityConfirmed = formData.get(`${prefix}availabilityConfirmed`) === "on";
        if (!value.availabilityConfirmed) value.vehicleLocation = null;
        return { ok: true, value };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Die Inseratsdaten sind ungültig." };
    }
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
    if (!output.availabilityConfirmed) output.vehicleLocation = null;
    return output;
}

export const vehicleListingDetailLabels: Record<keyof Omit<VehicleListingDetails, "availabilityConfirmed">, string> = {
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
};
