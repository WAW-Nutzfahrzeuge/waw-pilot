"use server";

import { redirect } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import {
    getDocumentTooLargeMessage,
    getDocumentUploadFailedMessage,
    getUnsupportedVehicleDocumentTypeMessage,
    isAllowedVehicleDocumentFile,
    maxDocumentFileSizeBytes,
} from "@/lib/documents/upload-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getDuplicateVinMessage,
    translateVehicleDatabaseError,
} from "@/lib/vehicles/vehicle-save-errors";

type CreateVehicleState = {
    success: boolean;
    message: string;
};

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getNumberValue(formData: FormData, key: string): number | null {
    const value = getStringValue(formData, key);

    if (!value) return null;

    const normalizedValue = value.replace(",", ".");
    const numberValue = Number(normalizedValue);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function getDateValue(formData: FormData, key: string): string | null {
    return getStringValue(formData, key);
}

function getFileValue(formData: FormData, key: string): File | null {
    const value = formData.get(key);

    if (!(value instanceof File) || value.size <= 0) return null;

    return value;
}

function sanitizeFileName(fileName: string): string {
    return fileName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9.\-_]/g, "");
}

function getFileExtension(fileName: string): string {
    const parts = fileName.split(".");
    const extension = parts.length > 1 ? parts.pop() : null;

    return extension ? `.${extension}` : "";
}

function getVehicleActivityName({
                                    internalNumber,
                                    manufacturer,
                                    model,
}: {
    internalNumber: string | null;
    manufacturer: string;
    model: string;
}): string {
    return [internalNumber, manufacturer, model].filter(Boolean).join(" · ");
}

async function storeVehicleDocument({
                                        supabase,
                                        companyId,
                                        vehicleId,
                                        sellerCustomerId,
                                        documentType,
                                        label,
                                        file,
                                    }: {
    supabase: ReturnType<typeof createServerSupabaseClient>;
    companyId: string;
    vehicleId: string;
    sellerCustomerId: string | null;
    documentType: "vehicle_registration" | "purchase_invoice";
    label: string;
    file: File;
}): Promise<{ success: true } | { success: false; message: string }> {
    if (!isAllowedVehicleDocumentFile(file)) {
        return {
            success: false,
            message: getUnsupportedVehicleDocumentTypeMessage(),
        };
    }

    if (file.size > maxDocumentFileSizeBytes) {
        return {
            success: false,
            message: getDocumentTooLargeMessage(),
        };
    }

    const originalFileName = sanitizeFileName(file.name);
    const fileExtension = getFileExtension(originalFileName);
    const fileName = `${documentType}-${Date.now()}${fileExtension}`;
    const filePath = `vehicles/${vehicleId}/${fileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        console.error("[upload] vehicle document storage upload failed", uploadError);
        return {
            success: false,
            message: getDocumentUploadFailedMessage(uploadError),
        };
    }

    const { error: documentError } = await supabase.from("documents").insert({
        company_id: companyId,
        document_type: documentType,
        source: "uploaded",
        status: "available",
        file_name: originalFileName || label,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
        customer_id: documentType === "purchase_invoice" ? sellerCustomerId : null,
        vehicle_id: vehicleId,
        sale_id: null,
        invoice_id: null,
        purchase_case_id: null,
        generated_by_system: false,
    });

    if (documentError) {
        await supabase.storage.from("documents").remove([filePath]);
        console.error("[upload] vehicle document insert failed", documentError);

        return {
            success: false,
            message:
                "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
        };
    }

    await logActivity({
        action: `${label} für Fahrzeug hochgeladen`,
        entityType: "document",
        entityId: vehicleId,
    });

    return { success: true };
}

export async function createVehicleAction(
    _previousState: CreateVehicleState,
    formData: FormData,
): Promise<CreateVehicleState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const manufacturer = getStringValue(formData, "manufacturer");
    const model = getStringValue(formData, "model");
    const vehicleType = getStringValue(formData, "vehicle_type");
    const vin = getStringValue(formData, "vin");

    const constructionYear = getNumberValue(formData, "construction_year");
    const licensePlate = getStringValue(formData, "license_plate");

    const purchasePriceNet = getNumberValue(formData, "purchase_price_net");
    const additionalCostsNet = getNumberValue(formData, "additional_costs_net") ?? 0;

    const sellerCustomerId = getStringValue(formData, "seller_customer_id");
    const purchaseDate = getDateValue(formData, "purchase_date");
    const notes = getStringValue(formData, "notes");
    const damageNotes = getStringValue(formData, "damage_notes");
    const vehicleRegistrationFile = getFileValue(
        formData,
        "vehicle_registration_file",
    );
    const purchaseInvoiceFile = getFileValue(formData, "purchase_invoice_file");

    if (!manufacturer || !model || !vehicleType || !vin) {
        return {
            success: false,
            message:
                "Bitte fülle Hersteller, Modell, Fahrzeugtyp und VIN aus.",
        };
    }

    if (purchasePriceNet === null) {
        return {
            success: false,
            message: "Bitte gib einen gültigen Einkaufspreis netto ein.",
        };
    }

    const vehicleActivityName = getVehicleActivityName({
        internalNumber: null,
        manufacturer,
        model,
    });

    const { data: duplicateVinVehicle, error: duplicateVinError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("company_id", companyId)
        .eq("vin", vin)
        .limit(1);

    if (duplicateVinError) {
        console.error("VIN duplicate check failed", duplicateVinError);
    }

    if (duplicateVinVehicle && duplicateVinVehicle.length > 0) {
        return {
            success: false,
            message: getDuplicateVinMessage(),
        };
    }

    const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .insert({
            company_id: companyId,
            internal_number: null,
            manufacturer,
            model,
            vehicle_type: vehicleType,
            construction_year: constructionYear,
            first_registration: null,
            vin,
            license_plate: licensePlate,
            purchase_price_net: purchasePriceNet,
            sale_price_net: null,
            additional_costs_net: additionalCostsNet,
            status: "in_stock",
            seller_customer_id: sellerCustomerId || null,
            notes,
            damage_notes: damageNotes,
            show_damage_on_invoice: false,
        })
        .select("id")
        .single();

    if (vehicleError || !vehicle) {
        if (vehicleError) {
            console.error("Vehicle insert failed", vehicleError);
        }

        return {
            success: false,
            message: vehicleError
                ? translateVehicleDatabaseError(vehicleError)
                : "Fahrzeug konnte nicht gespeichert werden. Bitte versuche es erneut.",
        };
    }

    const vehicleId = vehicle.id as string;

    await logActivity({
        action: `Fahrzeug ${vehicleActivityName} angelegt`,
        entityType: "vehicle",
        entityId: vehicleId,
    });

    if (sellerCustomerId) {
        const { data: purchase, error: purchaseError } = await supabase
            .from("purchases")
            .insert({
                company_id: companyId,
                vehicle_id: vehicleId,
                seller_customer_id: sellerCustomerId,
                purchase_date: purchaseDate ?? new Date().toISOString().slice(0, 10),
                purchase_price_net: purchasePriceNet,
                additional_costs_net: additionalCostsNet,
                notes,
            })
            .select("id")
            .single();

        if (purchaseError || !purchase) {
            return {
                success: false,
                message: `Fahrzeug wurde gespeichert, aber der Ankauf konnte nicht gespeichert werden: ${
                    purchaseError?.message ?? "Keine Ankauf-ID erhalten"
                }`,
            };
        }

        await logActivity({
            action: `Ankauf für Fahrzeug ${vehicleActivityName} automatisch angelegt`,
            entityType: "purchase",
            entityId: purchase.id as string,
        });

    }

    const documentUploads = [
        vehicleRegistrationFile
            ? {
                  file: vehicleRegistrationFile,
                  documentType: "vehicle_registration" as const,
                  label: "Fahrzeugschein",
              }
            : null,
        purchaseInvoiceFile
            ? {
                  file: purchaseInvoiceFile,
                  documentType: "purchase_invoice" as const,
                  label: "Einkaufsrechnung",
              }
            : null,
    ].filter((upload): upload is NonNullable<typeof upload> => Boolean(upload));

    for (const upload of documentUploads) {
        const uploadResult = await storeVehicleDocument({
            supabase,
            companyId,
            vehicleId,
            sellerCustomerId,
            documentType: upload.documentType,
            label: upload.label,
            file: upload.file,
        });

        if (!uploadResult.success) {
            redirect(
                `/dashboard/vehicles/${vehicleId}?vehicleSaved=1&vehicleDocumentUploadError=${encodeURIComponent(
                    uploadResult.message,
                )}`,
            );
        }
    }

    redirect(`/dashboard/vehicles?vehicleCreated=1&highlightVehicleId=${vehicleId}`);
}
