"use server";

import { redirect } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import {
    normalizeEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";
import {
    uploadCustomerBzstEvidenceDocuments,
    validateCustomerBzstEvidenceFiles,
} from "@/lib/customers/customer-bzst-evidence-upload";
import {
    getDocumentTooLargeMessage,
    getDocumentUploadFailedMessage,
    getUnsupportedVehicleDocumentTypeMessage,
    isAllowedVehicleDocumentFile,
    maxDocumentFileSizeBytes,
} from "@/lib/documents/upload-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidPhoneNumber } from "@/lib/validation/phone";
import { getNextVehicleInternalNumber } from "@/lib/vehicles/vehicle-numbering";
import {
    getDuplicateInternalNumberMessage,
    getDuplicateVinMessage,
    translateVehicleDatabaseError,
} from "@/lib/vehicles/vehicle-save-errors";

type CreatePurchaseCaseState = {
    success: boolean;
    message: string;
};

type VehicleDocumentType = "vehicle_registration" | "purchase_invoice";

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

function getFileValue(formData: FormData, key: string): File | null {
    const value = formData.get(key);

    if (!(value instanceof File) || value.size <= 0) return null;

    return value;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
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

function getEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(
        getStringValue(formData, "new_seller_preferred_language"),
    );
}

async function getNextPurchaseNumber(companyId: string): Promise<string> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("next_purchase_number", {
        target_company_id: companyId,
    });

    if (error || typeof data !== "string") {
        const now = new Date();
        return `AK-${now.getFullYear()}-${now.getTime().toString().slice(-6)}`;
    }

    return data;
}

function getVehicleActivityName(vehicle: {
    internal_number: string | null;
    manufacturer: string | null;
    model: string | null;
} | null): string {
    if (!vehicle) return "unbekanntes Fahrzeug";

    const name = [vehicle.internal_number, vehicle.manufacturer, vehicle.model]
        .filter(Boolean)
        .join(" · ")
        .trim();

    return name || "unbekanntes Fahrzeug";
}

async function storePurchaseVehicleDocument({
    companyId,
    vehicleId,
    purchaseCaseId,
    sellerCustomerId,
    purchaseNumber,
    documentType,
    label,
    file,
}: {
    companyId: string;
    vehicleId: string;
    purchaseCaseId: string;
    sellerCustomerId: string;
    purchaseNumber: string;
    documentType: VehicleDocumentType;
    label: string;
    file: File;
}): Promise<{ success: true } | { success: false; message: string }> {
    const supabase = createServerSupabaseClient();

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

    const { data: existingDocument } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .eq("document_type", documentType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const originalFileName = sanitizeFileName(file.name);
    const fileExtension = getFileExtension(originalFileName);
    const fileName = `${documentType}-${Date.now()}${fileExtension}`;
    const filePath = `purchases/${purchaseCaseId}/${fileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        console.error("[purchase-upload] storage upload failed", uploadError);
        return { success: false, message: getDocumentUploadFailedMessage(uploadError) };
    }

    const payload = {
        document_type: documentType,
        source: "uploaded",
        status: "available",
        file_name: originalFileName || label,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
        customer_id: sellerCustomerId,
        vehicle_id: vehicleId,
        purchase_case_id: purchaseCaseId,
        sale_id: null,
        invoice_id: null,
        generated_by_system: false,
    };

    if (existingDocument) {
        const { error: updateError } = await supabase
            .from("documents")
            .update(payload)
            .eq("company_id", companyId)
            .eq("id", existingDocument.id);

        if (updateError) {
            await supabase.storage.from("documents").remove([filePath]);
            console.error("[purchase-upload] document update failed", updateError);
            return {
                success: false,
                message: `${label} konnte nicht gespeichert werden.`,
            };
        }

        if (existingDocument.file_path && existingDocument.file_path !== filePath) {
            await supabase.storage
                .from("documents")
                .remove([existingDocument.file_path]);
        }
    } else {
        const { error: insertError } = await supabase.from("documents").insert({
            company_id: companyId,
            ...payload,
        });

        if (insertError) {
            await supabase.storage.from("documents").remove([filePath]);
            console.error("[purchase-upload] document insert failed", insertError);
            return {
                success: false,
                message: `${label} konnte nicht gespeichert werden.`,
            };
        }
    }

    await logActivity({
        action: `${label} für Ankauf ${purchaseNumber} hochgeladen`,
        entityType: "purchase",
        entityId: purchaseCaseId,
    });

    return { success: true };
}

async function updatePurchaseDocumentStatus({
    companyId,
    purchaseCaseId,
    vehicleId,
}: {
    companyId: string;
    purchaseCaseId: string;
    vehicleId: string;
}) {
    const supabase = createServerSupabaseClient();
    const { data: purchaseDocuments } = await supabase
        .from("documents")
        .select("document_type, status")
        .eq("company_id", companyId)
        .or(`purchase_case_id.eq.${purchaseCaseId},vehicle_id.eq.${vehicleId}`);

    const requiredDocumentTypes: VehicleDocumentType[] = [
        "vehicle_registration",
        "purchase_invoice",
    ];
    const hasAllRequiredDocuments = requiredDocumentTypes.every((requiredType) =>
        (purchaseDocuments ?? []).some(
            (document) =>
                document.document_type === requiredType &&
                document.status === "available",
        ),
    );

    await supabase
        .from("purchase_cases")
        .update({
            document_check_status: hasAllRequiredDocuments
                ? "complete"
                : "missing",
            updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseCaseId)
        .eq("company_id", companyId);
}

async function resolveSellerCustomerId(formData: FormData, companyId: string) {
    const supabase = createServerSupabaseClient();
    const sellerMode = getStringValue(formData, "seller_mode") ?? "existing";

    if (sellerMode === "existing") {
        const sellerCustomerId = getStringValue(formData, "seller_customer_id");

        if (!sellerCustomerId) {
            return { success: false as const, message: "Bitte wähle einen Verkäufer aus." };
        }

        const { data: seller } = await supabase
            .from("customers")
            .select("id")
            .eq("company_id", companyId)
            .eq("id", sellerCustomerId)
            .maybeSingle();

        if (!seller) {
            return { success: false as const, message: "Der Verkäufer wurde nicht gefunden." };
        }

        return { success: true as const, id: sellerCustomerId, created: false };
    }

    const type = getStringValue(formData, "new_seller_type");
    const companyName = getStringValue(formData, "new_seller_company_name");
    const ownerName = getStringValue(formData, "new_seller_owner_name");
    const firstName = getStringValue(formData, "new_seller_first_name");
    const lastName = getStringValue(formData, "new_seller_last_name");
    const street = getStringValue(formData, "new_seller_street");
    const postalCode = getStringValue(formData, "new_seller_postal_code");
    const city = getStringValue(formData, "new_seller_city");
    const country = getStringValue(formData, "new_seller_country") ?? "Deutschland";
    const email = getStringValue(formData, "new_seller_email");
    const phone = getStringValue(formData, "new_seller_phone");

    if (type !== "company" && type !== "private") {
        return { success: false as const, message: "Bitte wähle eine gültige Verkäuferart." };
    }

    if (type === "company" && !companyName) {
        return { success: false as const, message: "Bitte gib einen Firmennamen ein." };
    }

    if (type === "private" && (!firstName || !lastName)) {
        return { success: false as const, message: "Bitte gib Vorname und Nachname des Verkäufers ein." };
    }

    if (!street || !postalCode || !city) {
        return { success: false as const, message: "Adresse, PLZ und Ort des Verkäufers sind Pflichtfelder." };
    }

    if (!isValidPhoneNumber(phone)) {
        return { success: false as const, message: "Bitte gib eine gültige Telefonnummer für den Verkäufer ein." };
    }

    const evidenceValidationError =
        type === "company" ? validateCustomerBzstEvidenceFiles(formData) : null;
    if (evidenceValidationError) {
        return { success: false as const, message: evidenceValidationError };
    }

    const { data: customer, error } = await supabase
        .from("customers")
        .insert({
            company_id: companyId,
            type,
            company_name: companyName,
            owner_name: ownerName,
            first_name: firstName,
            last_name: lastName,
            street,
            postal_code: postalCode,
            city,
            country,
            email,
            preferred_language: getEmailLanguage(formData),
            phone,
            vat_id:
                type === "company" ? getStringValue(formData, "new_seller_vat_id") : null,
            tax_number: getStringValue(formData, "new_seller_tax_number"),
            commercial_register_number:
                type === "company"
                    ? getStringValue(formData, "new_seller_commercial_register_number")
                    : null,
        })
        .select("id")
        .single();

    if (error || !customer) {
        console.error("[purchase] seller create failed", error);
        return { success: false as const, message: "Der Verkäufer konnte nicht angelegt werden." };
    }

    if (type === "company") {
        const evidenceUpload = await uploadCustomerBzstEvidenceDocuments({
            supabase,
            companyId,
            customerId: customer.id as string,
            formData,
        });

        if (!evidenceUpload.success) {
            return {
                success: false as const,
                message: `Der Verkäufer wurde angelegt, aber ${evidenceUpload.message}`,
            };
        }
    }

    await logActivity({
        action: "Verkäufer im Ankauf neu angelegt",
        entityType: "customer",
        entityId: customer.id as string,
    });

    return { success: true as const, id: customer.id as string, created: true };
}

async function resolveVehicleId({
    formData,
    companyId,
    sellerCustomerId,
    netAmount,
}: {
    formData: FormData;
    companyId: string;
    sellerCustomerId: string;
    netAmount: number;
}) {
    const supabase = createServerSupabaseClient();
    const vehicleMode = getStringValue(formData, "vehicle_mode") ?? "existing";

    if (vehicleMode === "existing") {
        const vehicleId = getStringValue(formData, "vehicle_id");

        if (!vehicleId) {
            return { success: false as const, message: "Bitte wähle ein Fahrzeug aus." };
        }

        const [{ data: vehicle }, { data: existingPurchase }] = await Promise.all([
            supabase
                .from("vehicles")
                .select("id, internal_number, manufacturer, model, status")
                .eq("company_id", companyId)
                .eq("id", vehicleId)
                .maybeSingle(),
            supabase
                .from("purchase_cases")
                .select("id")
                .eq("company_id", companyId)
                .eq("vehicle_id", vehicleId)
                .limit(1)
                .maybeSingle(),
        ]);

        if (!vehicle) {
            return { success: false as const, message: "Das Fahrzeug wurde nicht gefunden." };
        }

        if (vehicle.status === "sold" || existingPurchase) {
            return {
                success: false as const,
                message: "Dieses Fahrzeug ist bereits verkauft oder mit einem Ankauf verknüpft.",
            };
        }

        return {
            success: true as const,
            id: vehicleId,
            created: false,
            vehicle,
        };
    }

    const submittedInternalNumber = getStringValue(
        formData,
        "new_vehicle_internal_number",
    );
    const internalNumber =
        submittedInternalNumber ?? (await getNextVehicleInternalNumber());
    const manufacturer = getStringValue(formData, "new_vehicle_manufacturer");
    const model = getStringValue(formData, "new_vehicle_model");
    const vehicleType = getStringValue(formData, "new_vehicle_type");
    const vin = getStringValue(formData, "new_vehicle_vin");
    const constructionYear = getNumberValue(
        formData,
        "new_vehicle_construction_year",
    );
    const mileage = getNumberValue(formData, "new_vehicle_mileage");
    const color = getStringValue(formData, "new_vehicle_color");
    const vehicleCategory = getStringValue(formData, "new_vehicle_category");
    const damageNotes = getStringValue(formData, "new_vehicle_damage_notes");

    if (!manufacturer || !model || !vehicleType || !vin) {
        return {
            success: false as const,
            message: "Hersteller, Modell, Typ und VIN des Fahrzeugs sind Pflichtfelder.",
        };
    }

    const [{ data: duplicateVin }, { data: duplicateInternalNumber }] =
        await Promise.all([
            supabase
                .from("vehicles")
                .select("id")
                .eq("company_id", companyId)
                .eq("vin", vin)
                .limit(1),
            supabase
                .from("vehicles")
                .select("id")
                .eq("company_id", companyId)
                .eq("internal_number", internalNumber)
                .limit(1),
        ]);

    if (duplicateVin && duplicateVin.length > 0) {
        return { success: false as const, message: getDuplicateVinMessage() };
    }

    if (duplicateInternalNumber && duplicateInternalNumber.length > 0) {
        return { success: false as const, message: getDuplicateInternalNumberMessage() };
    }

    const { data: vehicle, error } = await supabase
        .from("vehicles")
        .insert({
            company_id: companyId,
            internal_number: internalNumber,
            manufacturer,
            model,
            vehicle_type: vehicleType,
            construction_year: constructionYear,
            first_registration: null,
            vin,
            license_plate: null,
            mileage,
            color,
            vehicle_category: vehicleCategory,
            purchase_price_net: netAmount,
            sale_price_net: null,
            additional_costs_net: 0,
            status: "in_stock",
            seller_customer_id: sellerCustomerId,
            notes: null,
            damage_notes: damageNotes,
            show_damage_on_invoice: false,
        })
        .select("id, internal_number, manufacturer, model")
        .single();

    if (error || !vehicle) {
        console.error("[purchase] vehicle create failed", error);
        return {
            success: false as const,
            message: error
                ? translateVehicleDatabaseError(error)
                : "Das Fahrzeug konnte nicht gespeichert werden.",
        };
    }

    await logActivity({
        action: `Fahrzeug ${getVehicleActivityName(vehicle)} im Ankauf neu angelegt`,
        entityType: "vehicle",
        entityId: vehicle.id as string,
    });

    return {
        success: true as const,
        id: vehicle.id as string,
        created: true,
        vehicle,
    };
}

export async function createPurchaseCaseAction(
    _previousState: CreatePurchaseCaseState,
    formData: FormData,
): Promise<CreatePurchaseCaseState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const purchaseDate = getStringValue(formData, "purchase_date");
    const netAmount = getNumberValue(formData, "net_amount");
    const vatRate = getNumberValue(formData, "vat_rate") ?? 19;
    const paymentStatus = getStringValue(formData, "payment_status") ?? "open";
    const notes = getStringValue(formData, "notes");

    if (!purchaseDate) {
        return { success: false, message: "Bitte wähle ein Ankaufsdatum aus." };
    }

    if (netAmount === null || netAmount <= 0) {
        return {
            success: false,
            message: "Bitte gib einen gültigen Einkaufspreis netto ein.",
        };
    }

    if (
        paymentStatus !== "open" &&
        paymentStatus !== "partial" &&
        paymentStatus !== "paid"
    ) {
        return { success: false, message: "Bitte wähle einen gültigen Zahlungsstatus aus." };
    }

    const sellerResult = await resolveSellerCustomerId(formData, companyId);

    if (!sellerResult.success) {
        return { success: false, message: sellerResult.message };
    }

    const vehicleResult = await resolveVehicleId({
        formData,
        companyId,
        sellerCustomerId: sellerResult.id,
        netAmount,
    });

    if (!vehicleResult.success) {
        return { success: false, message: vehicleResult.message };
    }

    const vatAmount = roundMoney(netAmount * (vatRate / 100));
    const grossAmount = roundMoney(netAmount + vatAmount);
    const purchaseNumber = await getNextPurchaseNumber(companyId);

    const { data: purchaseCase, error: purchaseError } = await supabase
        .from("purchase_cases")
        .insert({
            company_id: companyId,
            vehicle_id: vehicleResult.id,
            seller_customer_id: sellerResult.id,
            purchase_number: purchaseNumber,
            purchase_date: purchaseDate,
            net_amount: netAmount,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            gross_amount: grossAmount,
            status: "active",
            payment_status: paymentStatus,
            document_check_status: "missing",
            notes,
        })
        .select("id")
        .single();

    if (purchaseError || !purchaseCase) {
        console.error("[purchase] purchase case create failed", purchaseError);
        return {
            success: false,
            message: "Der Ankauf wurde nicht vollständig gespeichert.",
        };
    }

    const purchaseCaseId = purchaseCase.id as string;
    const vehicleActivityName = getVehicleActivityName(vehicleResult.vehicle);

    const { error: vehicleUpdateError } = await supabase
        .from("vehicles")
        .update({
            seller_customer_id: sellerResult.id,
            purchase_price_net: netAmount,
            status: "in_stock",
        })
        .eq("id", vehicleResult.id)
        .eq("company_id", companyId);

    if (vehicleUpdateError) {
        console.error("[purchase] vehicle link update failed", vehicleUpdateError);
        return {
            success: false,
            message: `Ankaufsakte wurde gespeichert, aber ${translateVehicleDatabaseError(
                vehicleUpdateError,
            )}`,
        };
    }

    await logActivity({
        action: `Ankauf ${purchaseNumber} für ${vehicleActivityName} angelegt`,
        entityType: "purchase",
        entityId: purchaseCaseId,
    });

    await logActivity({
        action: vehicleResult.created
            ? `Fahrzeug ${vehicleActivityName} durch neuen Ankauf in Bestand aufgenommen`
            : `Bestehendes Fahrzeug ${vehicleActivityName} mit Ankauf ${purchaseNumber} verknüpft`,
        entityType: "vehicle",
        entityId: vehicleResult.id,
    });

    if (!sellerResult.created) {
        await logActivity({
            action: `Bestehender Verkäufer mit Ankauf ${purchaseNumber} verknüpft`,
            entityType: "customer",
            entityId: sellerResult.id,
        });
    }

    const documentUploads = [
        getFileValue(formData, "vehicle_registration_file")
            ? {
                  file: getFileValue(formData, "vehicle_registration_file") as File,
                  documentType: "vehicle_registration" as const,
                  label: "Fahrzeugschein",
              }
            : null,
        getFileValue(formData, "purchase_invoice_file")
            ? {
                  file: getFileValue(formData, "purchase_invoice_file") as File,
                  documentType: "purchase_invoice" as const,
                  label: "Einkaufsrechnung",
              }
            : null,
    ].filter((upload): upload is NonNullable<typeof upload> => Boolean(upload));

    for (const upload of documentUploads) {
        const uploadResult = await storePurchaseVehicleDocument({
            companyId,
            vehicleId: vehicleResult.id,
            purchaseCaseId,
            sellerCustomerId: sellerResult.id,
            purchaseNumber,
            documentType: upload.documentType,
            label: upload.label,
            file: upload.file,
        });

        if (!uploadResult.success) {
            redirect(
                `/dashboard/ankauf/${purchaseCaseId}?purchaseCreated=1&purchaseDocumentUploadError=${encodeURIComponent(
                    uploadResult.message,
                )}`,
            );
        }
    }

    await updatePurchaseDocumentStatus({
        companyId,
        purchaseCaseId,
        vehicleId: vehicleResult.id,
    });

    if (paymentStatus === "paid") {
        await logActivity({
            action: `Ankauf ${purchaseNumber} als bezahlt markiert`,
            entityType: "purchase",
            entityId: purchaseCaseId,
        });
    }

    redirect(`/dashboard/ankauf/${purchaseCaseId}?purchaseCreated=1`);
}
