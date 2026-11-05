import { createHash } from "node:crypto";
import sharp from "sharp";
import { timingSafeEqual } from "node:crypto";

export const listingTemplateVersion = "waw-mobile-listing-v1";
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

export function stableListingRevision(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(sortRecursively(value))).digest("hex");
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

export function compareVehicleSuggestions(
    confirmed: ListingConfirmedVehicleData,
    suggestions: Record<string, unknown>,
): Array<{ field: string; confirmed: string | number | null; suggested: string | number }> {
    const mapping: Record<string, keyof ListingConfirmedVehicleData> = {
        vin: "vin",
        firstRegistration: "firstRegistration",
        constructionYear: "constructionYear",
        mileage: "mileage",
        manufacturer: "manufacturer",
        model: "model",
        vehicleType: "vehicleType",
    };
    const conflicts: Array<{ field: string; confirmed: string | number | null; suggested: string | number }> = [];
    for (const [suggestedField, confirmedField] of Object.entries(mapping)) {
        const proposed = suggestions[suggestedField];
        if (typeof proposed !== "string" && typeof proposed !== "number") continue;
        const existing = confirmed[confirmedField];
        if (existing === null || existing === "") continue;
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
}): boolean {
    if (!value || typeof value !== "object") return false;
    const ack = value as Record<string, unknown>;
    return ack.status === "accepted" && ack.jobId === expected.jobId && ack.purchaseId === expected.purchaseId &&
        ack.vehicleId === expected.vehicleId && ack.sourceRevision === expected.sourceRevision && ack.dispatchToken === expected.dispatchToken;
}

export function isListingJobLeaseExpired(status: string, leaseExpiresAt: string | null, now = Date.now()): boolean {
    return status === "processing" && Boolean(leaseExpiresAt) && Date.parse(leaseExpiresAt!) <= now;
}

export function validateListingCallback(body: unknown, expected: {
    job: { id: string; purchase_case_id: string; vehicle_id: string; source_revision: string; confirmed_vehicle_data: ListingConfirmedVehicleData };
    dispatchToken: string;
    imageIds: Set<string>;
}) {
    if (!body || typeof body !== "object") return { ok: false as const, code: "invalid_json" };
    const value = body as Record<string, unknown>;
    if (value.schemaVersion !== 1 || value.jobId !== expected.job.id || value.purchaseId !== expected.job.purchase_case_id ||
        value.vehicleId !== expected.job.vehicle_id || value.sourceRevision !== expected.job.source_revision || value.dispatchToken !== expected.dispatchToken) {
        return { ok: false as const, code: "identity_conflict" };
    }
    if (!["needs_input", "draft_ready", "failed"].includes(String(value.status))) return { ok: false as const, code: "invalid_status" };
    if (value.status === "failed") {
        const allowedErrorCodes = new Set(["ONEDRIVE_ACCESS_DENIED", "ONEDRIVE_TIMEOUT", "ONEDRIVE_FOLDER_MISSING", "REGISTRATION_UNREADABLE", "OCR_FAILED", "PROCESSING_TIMEOUT"]);
        const candidateCode = typeof value.errorCode === "string" ? value.errorCode : "";
        const code = allowedErrorCodes.has(candidateCode) ? candidateCode : "PROCESSING_FAILED";
        return { ok: true as const, result: { status: "failed" as const, errorCode: code, fingerprint: fingerprintListingCallback(value) } };
    }
    const suggestions = sanitizeListingSuggestions(value.extractedSuggestions);
    const conflicts = compareVehicleSuggestions(expected.job.confirmed_vehicle_data, suggestions);
    const allowedMissing = new Set(["mileage", "condition", "equipment", "inspection", "photos"]);
    const missingFields = Array.isArray(value.missingFields) ? [...new Set(value.missingFields.filter((item): item is string => typeof item === "string" && allowedMissing.has(item)))] : [];
    const title = typeof value.title === "string" ? value.title.trim().slice(0, 180) : "";
    const description = typeof value.description === "string" ? value.description.slice(0, 12000) : "";
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

export function sanitizeListingSuggestions(value: unknown): Record<string, string | number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const allowed = new Set(["manufacturer", "model", "vehicleType", "vin", "firstRegistration", "constructionYear", "mileage", "color"]);
    const output: Record<string, string | number> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (!allowed.has(key)) continue;
        if (typeof item === "string" && item.trim().length > 0 && item.length <= 500) output[key] = item.trim();
        else if (typeof item === "number" && Number.isFinite(item) && item >= 0) output[key] = item;
    }
    return output;
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
