import { createHash } from "node:crypto";
import sharp from "sharp";
import { timingSafeEqual } from "node:crypto";

export const legacyListingTemplateVersion = "waw-mobile-listing-v1";
export const listingTemplateVersion = "waw-mobile-listing-v2";
export const listingContractVersion = 2 as const;
export const listingJobStatuses = ["queued", "processing", "needs_input", "draft_ready", "failed"] as const;
export type ListingJobStatus = (typeof listingJobStatuses)[number];

export type ListingConfirmedVehicleData = {
    manufacturer: string;
    model: string;
    vehicleType: string;
    vehicleCategory: string | null;
    vin: string;
    firstRegistration: string | null;
    constructionYear: number | null;
    mileage: number | null;
    color: string | null;
    purchaseNotes: string | null;
    damageNotes: string | null;
};

export type ListingConfirmedVehicleDataV2 = Omit<ListingConfirmedVehicleData, "purchaseNotes" | "damageNotes"> & {
    listingDetails: import("@/lib/vehicles/listing-details").VehicleListingDetails;
};

export function toPublicListingVehicleData(vehicle: ListingConfirmedVehicleData & { id?: string; listingDetails: import("@/lib/vehicles/listing-details").VehicleListingDetails }) {
    return {
        ...(vehicle.id ? { id: vehicle.id } : {}),
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        vehicleType: vehicle.vehicleType,
        vehicleCategory: vehicle.vehicleCategory,
        vin: vehicle.vin,
        firstRegistration: vehicle.firstRegistration,
        constructionYear: vehicle.constructionYear,
        mileage: vehicle.mileage,
        color: vehicle.color,
        listingDetails: vehicle.listingDetails,
    };
}

export function stableListingRevision(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(sortRecursively(value))).digest("hex");
}

export function buildPurchaseListingSourceRevision(input: {
    contractVersion: 1 | 2;
    purchase: { id: string; purchaseNumber: string | null; purchaseDate: string };
    vehicle: ListingConfirmedVehicleData & { id: string; listingDetails: import("@/lib/vehicles/listing-details").VehicleListingDetails };
    databaseListingDetails: unknown;
    registration: { id: string; filePath: string; createdAt: string; fileSize: number | null };
    oneDrive: { driveId: string; folderId: string; imagesFolderId: string };
}): string {
    if (input.contractVersion === 1) return stableListingRevision({
        purchase: { id: input.purchase.id, purchaseNumber: input.purchase.purchaseNumber, purchaseDate: input.purchase.purchaseDate },
        vehicle: {
            id: input.vehicle.id,
            manufacturer: input.vehicle.manufacturer,
            model: input.vehicle.model,
            vehicleType: input.vehicle.vehicleType,
            vehicleCategory: input.vehicle.vehicleCategory,
            vin: input.vehicle.vin,
            firstRegistration: input.vehicle.firstRegistration,
            constructionYear: input.vehicle.constructionYear,
            mileage: input.vehicle.mileage,
            color: input.vehicle.color,
            purchaseNotes: input.vehicle.purchaseNotes,
            damageNotes: input.vehicle.damageNotes,
        },
        registration: input.registration,
        oneDrive: input.oneDrive,
        templateVersion: legacyListingTemplateVersion,
    });
    return stableListingRevision({
        contractVersion: 2,
        purchase: { id: input.purchase.id, purchaseDate: input.purchase.purchaseDate },
        vehicle: toPublicListingVehicleData(input.vehicle),
        databaseListingDetails: input.databaseListingDetails,
        registration: input.registration,
        oneDrive: input.oneDrive,
        templateVersion: listingTemplateVersion,
    });
}

export function isValidListingAutomationToken(actual: string, expected: string): boolean {
    if (!actual || !expected) return false;
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function sortRecursively(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortRecursively);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, sortRecursively(item)]));
    }
    return value;
}

export function getListingTextTemplate(input: {
    vehicle: ListingConfirmedVehicleData;
    equipment?: string[];
    knownIssues?: string[];
}): { title: string; description: string; openPoints: string[] } {
    const { vehicle } = input;
    const title = [vehicle.manufacturer, vehicle.model, vehicle.vehicleType]
        .map((part) => part.trim()).filter(Boolean).join(" ").slice(0, 180);
    const data = [
        `Hersteller: ${vehicle.manufacturer}`,
        `Modell: ${vehicle.model}`,
        `Aufbau: ${vehicle.vehicleType}`,
        vehicle.vin ? `Fahrgestellnummer: ${vehicle.vin}` : null,
        vehicle.firstRegistration ? `Erstzulassung: ${vehicle.firstRegistration}` : null,
        vehicle.constructionYear ? `Baujahr: ${vehicle.constructionYear}` : null,
        vehicle.mileage !== null ? `Kilometerstand: ${vehicle.mileage} km` : null,
        vehicle.color ? `Farbe: ${vehicle.color}` : null,
    ].filter((line): line is string => Boolean(line));
    const equipment = (input.equipment ?? []).filter((item) => item.trim());
    const knownIssues = (input.knownIssues ?? []).filter((item) => item.trim());
    const openPoints = [
        vehicle.mileage === null ? "Kilometerstand prüfen" : null,
        "Zustand und bekannte Mängel prüfen",
        "Ausstattung und Besonderheiten prüfen",
        "Besichtigung und Kontaktangaben ergänzen",
    ].filter((item): item is string => Boolean(item));
    const description = [
        "Fahrzeugdaten",
        ...data,
        "",
        "Ausstattung und Besonderheiten",
        ...(equipment.length ? equipment.map((item) => `• ${item}`) : ["Noch nicht angegeben – bitte prüfen."]),
        "",
        "Zustand und bekannte Mängel",
        ...(knownIssues.length ? knownIssues.map((item) => `• ${item}`) : ["Noch nicht angegeben – bitte prüfen."]),
        "",
        "Besichtigung und Kontakt",
        "Bitte Besichtigung und Kontaktangaben ergänzen.",
    ].join("\n");
    return { title, description, openPoints };
}

function clean(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const result = value.trim().replace(/[\r\n]+/g, " ");
    return result || null;
}

function bullet(label: string, value: unknown): string | null {
    const text = clean(value);
    return text ? `• ${label}: ${text}` : null;
}

export function validateWawPublicListingText(title: string, description: string, vehicle: Record<string, unknown>): boolean {
    const manufacturer = clean(vehicle.manufacturer);
    const model = clean(vehicle.model);
    const baseTitle = manufacturer && model ? `${manufacturer} ${model}` : "";
    if (!title || title.length > 180 || (baseTitle && !title.startsWith(baseTitle))) return false;
    if ((title.match(/ \| /g) ?? []).length > 2 || /(?:\b(?:Preis|Telefon|Tel\.?|EUR|FIN|Fahrgestellnummer)\b|€|\b\d{5,}\b|\bEK[-\s]?\d|\bVK[-\s]?\d|(?:\+49|0049|0)\s?\d(?:[\s/-]?\d){6,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i.test(title)) return false;
    const vin = clean(vehicle.vin);
    if (vin && title.toLocaleLowerCase("de-DE").includes(vin.toLocaleLowerCase("de-DE"))) return false;
    if (/<\/?[a-z][^>]*>|(?:^|\n)\s*\|.*\|\s*(?:\n|$)|(?:^|\n)\s*(?:[-*_]){3,}\s*(?:\n|$)|\[[^\]]+\]|\*\*|__(?:\S)|(?:^|\n)\s*#{1,6}\s|\p{Extended_Pictographic}/iu.test(description)) return false;
    if (/noch nicht angegeben|bitte (?:prüfen|ergänzen)|offene punkte|platzhalter|unbekannt(?:e|er)? angabe/i.test(description)) return false;
    return true;
}

/** Version 2 is the central public-facing WAW listing style. */
export function getWawListingTemplateV2(vehicle: ListingConfirmedVehicleDataV2): { title: string; description: string; openPoints: string[] } {
    const details = vehicle.listingDetails;
    const isMixer = /beton.?mischer|mischer/i.test(vehicle.vehicleType);
    const isTractor = /sattelzugmaschine/i.test(vehicle.vehicleType);
    const manufacturer = clean(vehicle.manufacturer);
    const model = clean(vehicle.model);
    const baseTitle = manufacturer && model ? `${manufacturer} ${model}` : "";
    const titleParts = [baseTitle];
    if (isMixer) {
        const axle = clean(details.axleFormula);
        if (axle) titleParts.push(axle);
        const body = [clean(details.bodyManufacturer), clean(details.bodyType)].filter(Boolean).join(" ");
        const volume = details.mixerNominalVolumeM3 == null ? null : `${details.mixerNominalVolumeM3} m³`;
        const bodyPart = [body, volume].filter(Boolean).join(" ");
        if (bodyPart) titleParts.push(bodyPart);
    } else if (isTractor) {
        const features = [details.cab, details.retarder, details.hydraulics].map(clean).filter((x): x is string => Boolean(x));
        titleParts.push(...features.slice(0, 2));
    } else {
        const features = [details.axleFormula, details.bodyManufacturer, details.bodyType, details.transmission].map(clean).filter((x): x is string => Boolean(x));
        titleParts.push(...features.slice(0, 2));
    }
    const title = baseTitle ? titleParts.filter(Boolean).slice(0, 3).join(" | ").slice(0, 180) : "";

    const vehicleData = [
        bullet("Fahrzeugart", vehicle.vehicleType), bullet("Erstzulassung", vehicle.firstRegistration),
        bullet("Baujahr", vehicle.constructionYear == null ? null : String(vehicle.constructionYear)),
        bullet("Kilometerstand", vehicle.mileage == null ? null : `${vehicle.mileage} km`),
        bullet("Motorleistung", details.enginePowerKw == null ? null : `${details.enginePowerKw} kW`),
        bullet("Getriebe", details.transmission), bullet("Schadstoffklasse", details.emissionClass),
        bullet("Achsformel", details.axleFormula), bullet("Federung vorne", details.frontSuspension),
        bullet("Federung hinten", details.rearSuspension),
        bullet("Zulässiges Gesamtgewicht", details.grossVehicleWeightKg == null ? null : `${details.grossVehicleWeightKg} kg`),
        bullet("Leergewicht", details.curbWeightKg == null ? null : `${details.curbWeightKg} kg`),
        bullet("Nutzlast", details.payloadKg == null ? null : `${details.payloadKg} kg`),
        bullet("Radstand", details.wheelbaseMm == null ? null : `${details.wheelbaseMm} mm`),
        bullet("HU", details.huUntil), bullet("SP", details.spUntil), bullet("Farbe", vehicle.color),
    ].filter((x): x is string => Boolean(x));
    const bodyData = [
        bullet("Aufbauhersteller", details.bodyManufacturer), bullet("Aufbautyp", details.bodyType),
        bullet("Aufbaujahr", details.bodyYear == null ? null : String(details.bodyYear)),
        bullet("Nennvolumen", details.mixerNominalVolumeM3 == null ? null : `${details.mixerNominalVolumeM3} m³`),
        bullet("Mischerantrieb", details.mixerDrive), bullet("Wassertank", details.waterTankLiters == null ? null : `${details.waterTankLiters} Liter`),
        bullet("Bedienung", details.bodyControls), bullet("Zubehör", details.includedAccessories),
    ].filter((x): x is string => Boolean(x));
    const equipment = typeof details.equipment === "string"
        ? details.equipment.split(/\r?\n+/).map((line) => clean(line)).filter((line): line is string => Boolean(line)).map((line) => `• ${line}`)
        : [];
    const condition = [
        bullet("Fahrzeugzustand", details.vehicleCondition), bullet("Aufbauzustand", details.bodyCondition),
        bullet("Bekannte Schäden und Einschränkungen", details.knownDamages),
        bullet("Wartungen", details.maintenanceHistory), bullet("Reparaturen", details.repairHistory),
    ].filter((x): x is string => Boolean(x));
    const contact = [
        details.availabilityConfirmed ? bullet("Besichtigung", "Verfügbarkeit bestätigt") : null,
        details.availabilityConfirmed ? bullet("Standort", details.vehicleLocation) : null,
    ].filter((x): x is string => Boolean(x));
    const sections: string[] = [];
    const intro = baseTitle ? `${baseTitle}${vehicle.vehicleType ? ` als ${vehicle.vehicleType}` : ""}.` : "";
    if (intro) sections.push(intro);
    if (vehicleData.length) sections.push(["FAHRZEUGDATEN", ...vehicleData].join("\n"));
    if (bodyData.length) sections.push([["BETONMISCHERAUFBAU", "AUFBAU"].at(isMixer ? 0 : 1)!, ...bodyData].join("\n"));
    if (equipment.length) sections.push(["AUSSTATTUNG", ...equipment].join("\n"));
    if (condition.length) sections.push(["ZUSTAND UND HISTORIE", ...condition].join("\n"));
    if (contact.length) sections.push(["BESICHTIGUNG UND KONTAKT", ...contact].join("\n"));
    const openPoints = [
        vehicle.mileage === null ? "mileage" : null,
        !details.vehicleCondition && !details.knownDamages ? "condition" : null,
        !details.equipment ? "equipment" : null,
        !details.huUntil && !details.spUntil ? "inspection" : null,
        !details.availabilityConfirmed ? "location" : null,
        ...(!vehicle.manufacturer || !vehicle.model ? ["vehicleIdentity"] : []),
    ].filter((x): x is string => Boolean(x));
    return { title, description: sections.join("\n\n").slice(0, 12000), openPoints };
}

export function compareVehicleSuggestions(
    confirmed: ListingConfirmedVehicleData | Record<string, unknown>,
    suggestions: Record<string, unknown>,
): Array<{ field: string; confirmed: string | number | null; suggested: string | number }> {
    const mapping: Record<string, string> = {
        vin: "vin",
        firstRegistration: "firstRegistration",
        constructionYear: "constructionYear",
        mileage: "mileage",
        manufacturer: "manufacturer",
        model: "model",
        vehicleType: "vehicleType",
        enginePowerKw: "listingDetails.enginePowerKw",
        transmission: "listingDetails.transmission",
        emissionClass: "listingDetails.emissionClass",
        axleFormula: "listingDetails.axleFormula",
        frontSuspension: "listingDetails.frontSuspension",
        rearSuspension: "listingDetails.rearSuspension",
        grossVehicleWeightKg: "listingDetails.grossVehicleWeightKg",
        curbWeightKg: "listingDetails.curbWeightKg",
        payloadKg: "listingDetails.payloadKg",
        wheelbaseMm: "listingDetails.wheelbaseMm",
        huUntil: "listingDetails.huUntil",
        spUntil: "listingDetails.spUntil",
        color: "color",
    };
    const conflicts: Array<{ field: string; confirmed: string | number | null; suggested: string | number }> = [];
    const confirmedRecord = confirmed as Record<string, unknown>;
    for (const [suggestedField, confirmedField] of Object.entries(mapping)) {
        const proposed = suggestions[suggestedField];
        if (typeof proposed !== "string" && typeof proposed !== "number") continue;
        const existing = confirmedField.startsWith("listingDetails.")
            ? ((confirmedRecord.listingDetails as Record<string, unknown> | undefined)?.[confirmedField.slice("listingDetails.".length)])
            : confirmedRecord[confirmedField];
        if (existing === null || existing === undefined || existing === "") continue;
        if (typeof existing !== "string" && typeof existing !== "number") continue;
        const normalize = (value: string | number) => String(value).trim().toLocaleLowerCase("de-DE").replace(/\s+/g, "");
        if (normalize(existing) !== normalize(proposed)) {
            conflicts.push({ field: suggestedField, confirmed: existing, suggested: proposed });
        }
    }
    return conflicts;
}

export function fingerprintListingCallback(body: unknown): string {
    return stableListingRevision(body);
}

export function isSupportedListingImageMime(mimeType: string): boolean {
    return ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
}

export function validateListingAcceptanceAck(value: unknown, expected: {
    jobId: string; purchaseId: string; vehicleId: string; sourceRevision: string; dispatchToken: string;
    contractVersion?: number;
}): boolean {
    if (!value || typeof value !== "object") return false;
    const ack = value as Record<string, unknown>;
    return ack.status === "accepted" && (expected.contractVersion === undefined || ack.contractVersion === expected.contractVersion) && ack.jobId === expected.jobId && ack.purchaseId === expected.purchaseId &&
        ack.vehicleId === expected.vehicleId && ack.sourceRevision === expected.sourceRevision && ack.dispatchToken === expected.dispatchToken;
}

export type ListingAutomationEnvironment = {
    N8N_VEHICLE_LISTING_WEBHOOK_URL?: string;
    N8N_VEHICLE_LISTING_TOKEN?: string;
    N8N_VEHICLE_LISTING_CALLBACK_BASE_URL?: string;
};

export type ListingAutomationConfiguration = {
    webhookUrl: string;
    token: string;
    callbackBaseUrl: string;
};

export function validateListingAutomationEnvironment(environment: ListingAutomationEnvironment):
    | { ok: true; config: ListingAutomationConfiguration }
    | { ok: false; missingVariables: string[]; invalidVariables: string[] } {
    const names = [
        "N8N_VEHICLE_LISTING_WEBHOOK_URL",
        "N8N_VEHICLE_LISTING_TOKEN",
        "N8N_VEHICLE_LISTING_CALLBACK_BASE_URL",
    ] as const;
    const missingVariables = names.filter((name) => !environment[name]?.trim());
    if (missingVariables.length) return { ok: false, missingVariables, invalidVariables: [] };

    const webhookUrl = environment.N8N_VEHICLE_LISTING_WEBHOOK_URL!.trim();
    const token = environment.N8N_VEHICLE_LISTING_TOKEN!.trim();
    const callbackBaseUrl = environment.N8N_VEHICLE_LISTING_CALLBACK_BASE_URL!.trim();
    const invalidVariables: string[] = [];
    let webhook: URL | null = null;
    let callback: URL | null = null;
    try { webhook = new URL(webhookUrl); } catch { invalidVariables.push("N8N_VEHICLE_LISTING_WEBHOOK_URL"); }
    try { callback = new URL(callbackBaseUrl); } catch { invalidVariables.push("N8N_VEHICLE_LISTING_CALLBACK_BASE_URL"); }
    if (webhook && webhook.protocol !== "https:" && !invalidVariables.includes("N8N_VEHICLE_LISTING_WEBHOOK_URL")) {
        invalidVariables.push("N8N_VEHICLE_LISTING_WEBHOOK_URL");
    }
    if (callback && (callback.protocol !== "https:" || callback.pathname !== "/") && !invalidVariables.includes("N8N_VEHICLE_LISTING_CALLBACK_BASE_URL")) {
        invalidVariables.push("N8N_VEHICLE_LISTING_CALLBACK_BASE_URL");
    }
    if (invalidVariables.length) return { ok: false, missingVariables: [], invalidVariables };
    return { ok: true, config: { webhookUrl, token, callbackBaseUrl: callbackBaseUrl.replace(/\/$/, "") } };
}

export function getListingN8nHttpFailure(status: number): { code: string; message: string } {
    if (status === 401 || status === 403) return {
        code: "N8N_AUTH_FAILED",
        message: "n8n hat den Auftrag mit HTTP-Zugriffsfehler abgewiesen. Bitte prüfe das n8n Bearer-Credential und N8N_VEHICLE_LISTING_TOKEN.",
    };
    if (status === 404) return {
        code: "N8N_HTTP_404",
        message: "n8n hat HTTP 404 zurückgegeben. Bitte prüfe, ob N8N_VEHICLE_LISTING_WEBHOOK_URL auf den aktiven Inserats-Webhook zeigt.",
    };
    if (status >= 500) return {
        code: `N8N_HTTP_${status}`,
        message: `n8n hat den Auftrag mit HTTP ${status} abgewiesen. Bitte prüfe den n8n-Ausführungsfehler.`,
    };
    return {
        code: `N8N_HTTP_${status}`,
        message: `n8n hat den Auftrag mit HTTP ${status} statt HTTP 202 abgewiesen. Bitte prüfe die Webhook-Antwort.`,
    };
}

export function isListingJobLeaseExpired(status: string, leaseExpiresAt: string | null, now = Date.now()): boolean {
    return status === "processing" && Boolean(leaseExpiresAt) && Date.parse(leaseExpiresAt!) <= now;
}

export function validateListingCallback(body: unknown, expected: {
    job: { id: string; purchase_case_id: string; vehicle_id: string; source_revision: string; confirmed_vehicle_data: ListingConfirmedVehicleData; contract_version?: number };
    dispatchToken: string;
    imageIds: Set<string>;
}) {
    if (!body || typeof body !== "object") return { ok: false as const, code: "invalid_json" };
    const value = body as Record<string, unknown>;
    if (value.schemaVersion !== 1 || value.jobId !== expected.job.id || value.purchaseId !== expected.job.purchase_case_id ||
        value.vehicleId !== expected.job.vehicle_id || value.sourceRevision !== expected.job.source_revision || value.dispatchToken !== expected.dispatchToken) {
        return { ok: false as const, code: "identity_conflict" };
    }
    const contractVersion = expected.job.contract_version ?? 1;
    if ((contractVersion === 1 && value.contractVersion !== undefined && value.contractVersion !== 1) ||
        (contractVersion === 2 && value.contractVersion !== 2)) return { ok: false as const, code: "contract_version_conflict" };
    if (!["needs_input", "draft_ready", "failed"].includes(String(value.status))) return { ok: false as const, code: "invalid_status" };
    if (value.status === "failed") {
        const allowedErrorCodes = new Set(["ONEDRIVE_ACCESS_DENIED", "ONEDRIVE_TIMEOUT", "ONEDRIVE_FOLDER_MISSING", "REGISTRATION_UNREADABLE", "OCR_FAILED", "PROCESSING_TIMEOUT"]);
        const candidateCode = typeof value.errorCode === "string" ? value.errorCode : "";
        const code = allowedErrorCodes.has(candidateCode) ? candidateCode : "PROCESSING_FAILED";
        return { ok: true as const, result: { status: "failed" as const, errorCode: code, fingerprint: fingerprintListingCallback(value) } };
    }
    const suggestions = sanitizeListingSuggestions(value.extractedSuggestions, contractVersion);
    const conflicts = compareVehicleSuggestions(expected.job.confirmed_vehicle_data, suggestions);
    const allowedMissing = new Set(contractVersion === 1
        ? ["mileage", "condition", "equipment", "inspection", "photos"]
        : ["mileage", "condition", "equipment", "inspection", "photos", "location", "vehicleIdentity", "technicalData", "bodyDetails", "maintenanceHistory"]);
    const missingFields = Array.isArray(value.missingFields) ? [...new Set(value.missingFields.filter((item): item is string => typeof item === "string" && allowedMissing.has(item)))] : [];
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 180) : "";
    const description = typeof value.description === "string" ? value.description.slice(0, 12000) : "";
    if (contractVersion === 2 && !validateWawPublicListingText(title, description, expected.job.confirmed_vehicle_data as unknown as Record<string, unknown>)) {
        return { ok: false as const, code: "invalid_public_text" };
    }
    const imageIds = Array.isArray(value.selectedImageIds) ? value.selectedImageIds.filter((id): id is string => typeof id === "string") : [];
    if (imageIds.some((id) => !expected.imageIds.has(id)) || new Set(imageIds).size !== imageIds.length) return { ok: false as const, code: "invalid_image_reference" };
    if (imageIds.length === 0 && !missingFields.includes("photos")) missingFields.push("photos");
    return {
        ok: true as const,
        result: {
            status: (value.status === "draft_ready" && title && description && imageIds.length > 0 && conflicts.length === 0 ? "draft_ready" : "needs_input") as "draft_ready" | "needs_input",
            suggestions,
            conflicts,
            missingFields,
            title,
            description,
            selectedImageIds: imageIds,
            fingerprint: fingerprintListingCallback(value),
        },
    };
}

export function sanitizeListingSuggestions(value: unknown, contractVersion: number = 1): Record<string, string | number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const allowed = contractVersion === 1
        ? new Set(["manufacturer", "model", "vehicleType", "vin", "firstRegistration", "constructionYear", "mileage", "color"])
        : new Set(["manufacturer", "model", "vin", "firstRegistration", "constructionYear", "enginePowerKw", "transmission", "emissionClass", "axleFormula", "frontSuspension", "rearSuspension", "grossVehicleWeightKg", "curbWeightKg", "payloadKg", "wheelbaseMm", "huUntil", "spUntil", "color"]);
    const output: Record<string, string | number> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (!allowed.has(key)) continue;
        if (contractVersion === 2) {
            const numericLimits: Record<string, number> = {
                constructionYear: 2100, enginePowerKw: 3000, grossVehicleWeightKg: 100000,
                curbWeightKg: 100000, payloadKg: 100000, wheelbaseMm: 30000,
            };
            if (key in numericLimits) {
                if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > numericLimits[key] || !Number.isInteger(item) || (key === "constructionYear" && item < 1900)) continue;
                output[key] = item;
                continue;
            }
            if (key === "firstRegistration") {
                if (typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) && isRealDate(item)) output[key] = item;
                continue;
            }
            if (key === "huUntil" || key === "spUntil") {
                if (typeof item === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(item)) output[key] = item;
                continue;
            }
            if (typeof item === "string" && item.trim().length > 0 && item.length <= 500) output[key] = item.trim();
            continue;
        }
        if (typeof item === "string" && item.trim().length > 0 && item.length <= 500) output[key] = item.trim();
        else if (typeof item === "number" && Number.isFinite(item) && item >= 0 && key !== "constructionYear") output[key] = item;
        else if (typeof item === "number" && Number.isInteger(item) && item >= 1900 && item <= 2100 && key === "constructionYear") output[key] = item;
    }
    return output;
}

function isRealDate(value: string): boolean {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function inspectListingImageBytes(bytes: Uint8Array, expectedMime: string): Promise<{ valid: boolean; width: number | null; height: number | null }> {
    try {
        const metadata = await sharp(Buffer.from(bytes), { limitInputPixels: 80_000_000 }).metadata();
        const actualMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : null;
        return { valid: actualMime === expectedMime && Boolean(metadata.width && metadata.height && metadata.width >= 64 && metadata.height >= 64), width: metadata.width ?? null, height: metadata.height ?? null };
    } catch {
        return { valid: false, width: null, height: null };
    }
}
