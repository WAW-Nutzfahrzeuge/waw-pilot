import "server-only";

import { createHash } from "node:crypto";

import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { selectCurrentVehicleDocument } from "@/lib/vehicles/vehicle-document-selection";
import {
    listingTemplateVersion,
    isValidListingAutomationToken,
    stableListingRevision,
    validateListingAutomationEnvironment,
    type ListingConfirmedVehicleData,
    type ListingJobStatus,
} from "@/lib/purchases/purchase-listing-contract";

export type ListingJobRecord = {
    id: string;
    company_id: string;
    purchase_case_id: string;
    vehicle_id: string;
    source_revision: string;
    status: ListingJobStatus;
    source_snapshot: Record<string, unknown>;
    confirmed_vehicle_data: ListingConfirmedVehicleData;
    extracted_suggestions: Record<string, unknown>;
    conflicts: unknown[];
    missing_fields: unknown[];
    title: string | null;
    description: string | null;
    selected_image_ids: string[];
    manual_revision: number;
    result_fingerprint: string | null;
    dispatch_token: string | null;
    lease_expires_at: string | null;
    attempt_count: number;
    last_error_code: string | null;
    last_error: string | null;
    created_at: string;
    updated_at: string;
};

export type ListingImageRecord = {
    id: string;
    company_id: string;
    job_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    sha256: string;
    source_drive_item_id: string;
    source_e_tag: string;
    upload_status: "pending" | "available";
    created_at: string;
};

export type ListingSource = {
    purchase: { id: string; company_id: string; vehicle_id: string; purchase_number: string | null; purchase_date: string };
    vehicle: ListingConfirmedVehicleData & { id: string };
    registrationDocument: { id: string; file_path: string; file_name: string; mime_type: string | null; file_size: number | null; created_at: string };
    folder: { drive_id: string; folder_id: string; folder_url: string; images_folder_id: string };
    sourceRevision: string;
};

export function isListingAutomationRequestAuthorized(request: Request): boolean {
    const expected = process.env.N8N_VEHICLE_LISTING_TOKEN?.trim() ?? "";
    const authorization = request.headers.get("authorization") ?? "";
    const actual = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    return isValidListingAutomationToken(actual, expected);
}

export function getListingAutomationConfig() {
    return validateListingAutomationEnvironment({
        N8N_VEHICLE_LISTING_WEBHOOK_URL: process.env.N8N_VEHICLE_LISTING_WEBHOOK_URL,
        N8N_VEHICLE_LISTING_TOKEN: process.env.N8N_VEHICLE_LISTING_TOKEN,
        N8N_VEHICLE_LISTING_CALLBACK_BASE_URL: process.env.N8N_VEHICLE_LISTING_CALLBACK_BASE_URL,
    });
}

export async function loadPurchaseListingSource(companyId: string, purchaseId: string): Promise<ListingSource> {
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 12_000 });
    const { data: purchase, error: purchaseError } = await supabase
        .from("purchase_cases")
        .select("id, company_id, vehicle_id, purchase_number, purchase_date")
        .eq("company_id", companyId).eq("id", purchaseId).maybeSingle();
    if (purchaseError) throw new Error("PURCHASE_LOOKUP_FAILED");
    if (!purchase?.vehicle_id) throw new Error("PURCHASE_NOT_FOUND");

    const [vehicleResult, documentsResult, folderResult] = await Promise.all([
        supabase.from("vehicles").select("id, manufacturer, model, vehicle_type, vehicle_category, vin, first_registration, construction_year, mileage, color, notes, damage_notes")
            .eq("company_id", companyId).eq("id", purchase.vehicle_id).maybeSingle(),
        supabase.from("documents").select("id, document_type, status, file_path, file_name, mime_type, file_size, created_at, purchase_case_id, vehicle_id")
            .eq("company_id", companyId).or(`purchase_case_id.eq.${purchaseId},vehicle_id.eq.${purchase.vehicle_id}`).order("created_at", { ascending: false }),
        supabase.from("purchase_vehicle_folder_jobs").select("company_id, purchase_case_id, vehicle_id, status, drive_id, folder_id, folder_url, images_folder_id")
            .eq("company_id", companyId).eq("purchase_case_id", purchaseId).maybeSingle(),
    ]);
    if (vehicleResult.error) throw new Error("VEHICLE_LOOKUP_FAILED");
    if (!vehicleResult.data) throw new Error("VEHICLE_NOT_FOUND");
    if (documentsResult.error) throw new Error("DOCUMENT_LOOKUP_FAILED");
    if (folderResult.error) throw new Error("FOLDER_LOOKUP_FAILED");

    const document = selectCurrentVehicleDocument(documentsResult.data ?? [], "vehicle_registration");
    if (!document || document.status !== "available" || !document.file_path) throw new Error("REGISTRATION_MISSING");
    if (document.purchase_case_id !== purchaseId && document.vehicle_id !== purchase.vehicle_id) throw new Error("REGISTRATION_LINK_INVALID");

    const folder = folderResult.data;
    if (!folder || folder.status !== "ready" || !folder.drive_id || !folder.folder_id || !folder.images_folder_id || !folder.folder_url) {
        throw new Error("ONEDRIVE_FOLDER_MISSING");
    }

    const v = vehicleResult.data;
    const confirmed: ListingConfirmedVehicleData = {
        manufacturer: String(v.manufacturer ?? ""),
        model: String(v.model ?? ""),
        vehicleType: String(v.vehicle_type ?? ""),
        vehicleCategory: v.vehicle_category ?? null,
        vin: String(v.vin ?? ""),
        firstRegistration: v.first_registration ?? null,
        constructionYear: v.construction_year === null ? null : Number(v.construction_year),
        mileage: v.mileage === null ? null : Number(v.mileage),
        color: v.color ?? null,
        purchaseNotes: v.notes ?? null,
        damageNotes: v.damage_notes ?? null,
    };
    const identity = {
        purchase: { id: purchase.id, purchaseNumber: purchase.purchase_number, purchaseDate: purchase.purchase_date },
        vehicle: { id: v.id, ...confirmed },
        registration: { id: document.id, filePath: document.file_path, createdAt: document.created_at, fileSize: document.file_size },
        oneDrive: { driveId: folder.drive_id, folderId: folder.folder_id, imagesFolderId: folder.images_folder_id },
        templateVersion: listingTemplateVersion,
    };
    return {
        purchase: purchase as ListingSource["purchase"],
        vehicle: { id: v.id, ...confirmed },
        registrationDocument: {
            id: document.id, file_path: document.file_path, file_name: document.file_name,
            mime_type: document.mime_type, file_size: document.file_size, created_at: document.created_at,
        },
        folder: { drive_id: folder.drive_id, folder_id: folder.folder_id, folder_url: folder.folder_url, images_folder_id: folder.images_folder_id },
        sourceRevision: stableListingRevision(identity),
    };
}

export async function verifyRegistrationFileIsReadable(filePath: string): Promise<boolean> {
    const supabase = createAutomationSupabaseClient({ requestTimeoutMs: 12_000 });
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) return false;
    try {
        const response = await fetch(data.signedUrl, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(8_000) });
        return response.ok;
    } catch {
        return false;
    }
}

export function calculateImageHash(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}
