"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PDFDocument } from "pdf-lib";

import { getCurrentCompanyId } from "@/lib/company";
import {
    getDocumentUploadFailedMessage,
    getImageAssetTooLargeMessage,
    getUnsupportedImageAssetTypeMessage,
    isAllowedTermsPdfFile,
    isAllowedImageAssetFile,
    maxImageAssetFileSizeBytes,
    maxTermsPdfFileSizeBytes,
} from "@/lib/documents/upload-validation";
import { isValidBic, isValidIban, normalizeBic, normalizeIban } from "@/lib/settings/company-bank-details";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UpdateCompanySettingsState = {
    success: boolean;
    message: string;
    values: {
        legal_name: string;
        street: string;
        postal_code: string;
        city: string;
        country: string;
        email: string;
        invoice_sender_email: string;
        website: string;
        phone: string;
        mobile_phone_1: string;
        mobile_phone_2: string;
        vat_id: string;
        tax_number: string;
        commercial_register_number: string;
        bank_name: string;
        bank_blz: string;
        bank_iban: string;
        bank_bic: string;
        bank_account_holder: string;
    };
};

export type UpdateUserPasswordState = {
    success: boolean;
    message: string;
};

type CompanyAssetPathRow = {
    signature_image_path: string | null;
    stamp_image_path: string | null;
};

type CompanyTermsPathRow = {
    terms_pdf_path: string | null;
};

function getStringValue(formData: FormData, key: string): string {
    const value = formData.get(key);

    if (typeof value !== "string") return "";

    return value.trim();
}

function normalizeEmailAddressInput(value: string): string {
    const trimmedValue = value.trim();
    const addressMatch = trimmedValue.match(/<([^<>]+)>$/);
    const emailValue = addressMatch?.[1] ?? trimmedValue;

    return emailValue.trim().toLowerCase();
}

function getFormValues(formData: FormData): UpdateCompanySettingsState["values"] {
    return {
        legal_name: getStringValue(formData, "legal_name"),
        street: getStringValue(formData, "street"),
        postal_code: getStringValue(formData, "postal_code"),
        city: getStringValue(formData, "city"),
        country: getStringValue(formData, "country") || "Deutschland",
        email: getStringValue(formData, "email"),
        invoice_sender_email: normalizeEmailAddressInput(
            getStringValue(formData, "invoice_sender_email"),
        ),
        website: getStringValue(formData, "website"),
        phone: getStringValue(formData, "phone"),
        mobile_phone_1: getStringValue(formData, "mobile_phone_1"),
        mobile_phone_2: getStringValue(formData, "mobile_phone_2"),
        vat_id: getStringValue(formData, "vat_id"),
        tax_number: getStringValue(formData, "tax_number"),
        commercial_register_number: getStringValue(
            formData,
            "commercial_register_number",
        ),
        bank_name: getStringValue(formData, "bank_name"),
        bank_blz: getStringValue(formData, "bank_blz"),
        bank_iban: normalizeIban(getStringValue(formData, "bank_iban")),
        bank_bic: normalizeBic(getStringValue(formData, "bank_bic")),
        bank_account_holder: getStringValue(formData, "bank_account_holder"),
    };
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

function getAssetField(assetType: string | null) {
    if (assetType === "signature") {
        return {
            fieldName: "signature_image_path",
            folderName: "signature",
            redirectFlag: "signatureUploaded",
        } as const;
    }

    if (assetType === "stamp") {
        return {
            fieldName: "stamp_image_path",
            folderName: "stamp",
            redirectFlag: "stampUploaded",
        } as const;
    }

    return null;
}

function isValidEmailAddress(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function redirectWithAssetUploadError(errorCode: string): never {
    redirect(`/dashboard/settings?assetUploadError=${encodeURIComponent(errorCode)}`);
}

function redirectWithTermsUploadError(errorCode: string): never {
    redirect(`/dashboard/settings?termsUploadError=${encodeURIComponent(errorCode)}`);
}

export async function updateCompanySettingsAction(
    _previousState: UpdateCompanySettingsState,
    formData: FormData,
): Promise<UpdateCompanySettingsState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const values = getFormValues(formData);

    if (!values.legal_name) {
        return {
            success: false,
            message: "Bitte gib den Firmennamen ein.",
            values,
        };
    }

    if (!values.street) {
        return {
            success: false,
            message: "Bitte gib die Straße ein.",
            values,
        };
    }

    if (!values.postal_code) {
        return {
            success: false,
            message: "Bitte gib die Postleitzahl ein.",
            values,
        };
    }

    if (!values.city) {
        return {
            success: false,
            message: "Bitte gib den Ort ein.",
            values,
        };
    }

    if (!values.bank_name || !values.bank_iban) {
        return {
            success: false,
            message: "Bitte hinterlege mindestens Bankname und IBAN. Diese Angaben werden auf Rechnungen benötigt.",
            values,
        };
    }

    if (!isValidIban(values.bank_iban)) {
        return {
            success: false,
            message: "Bitte gib eine gültige IBAN ein.",
            values,
        };
    }

    if (!isValidBic(values.bank_bic)) {
        return {
            success: false,
            message: "Bitte gib eine gültige BIC ein oder lasse das Feld leer.",
            values,
        };
    }

    if (
        values.invoice_sender_email &&
        !isValidEmailAddress(values.invoice_sender_email)
    ) {
        return {
            success: false,
            message: "Bitte gib eine gültige Rechnungs-Absender-E-Mail ein.",
            values,
        };
    }

    const { data, error } = await supabase
        .from("companies")
        .update({
            legal_name: values.legal_name,
            street: values.street,
            postal_code: values.postal_code,
            city: values.city,
            country: values.country,
            email: values.email || null,
            invoice_sender_email: values.invoice_sender_email || null,
            website: values.website || null,
            phone: values.phone || null,
            mobile_phone_1: values.mobile_phone_1 || null,
            mobile_phone_2: values.mobile_phone_2 || null,
            vat_id: values.vat_id || null,
            tax_number: values.tax_number || null,
            commercial_register_number: values.commercial_register_number || null,
            bank_name: values.bank_name,
            bank_blz: values.bank_blz || null,
            bank_iban: values.bank_iban,
            bank_bic: values.bank_bic || null,
            bank_account_holder: values.bank_account_holder || values.legal_name,
            updated_at: new Date().toISOString(),
        })
        .eq("id", companyId)
        .select("id")
        .maybeSingle();

    if (error) {
        return {
            success: false,
            message: `Firmendaten konnten nicht gespeichert werden: ${error.message}`,
            values,
        };
    }

    if (!data) {
        return {
            success: false,
            message:
                "Firmendaten konnten nicht gespeichert werden: Es wurde kein passender Firmendatensatz gefunden oder die RLS-Policy blockiert das Update.",
            values,
        };
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard/documents");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/reports");

    redirect("/dashboard/settings?companySaved=1");
}

export async function updateUserPasswordAction(
    _previousState: UpdateUserPasswordState,
    formData: FormData,
): Promise<UpdateUserPasswordState> {
    const supabase = await createAuthServerSupabaseClient();

    const newPassword = getStringValue(formData, "new_password");
    const passwordConfirm = getStringValue(formData, "password_confirm");

    if (!newPassword) {
        return {
            success: false,
            message: "Bitte gib ein neues Passwort ein.",
        };
    }

    if (newPassword.length < 8) {
        return {
            success: false,
            message: "Das neue Passwort muss mindestens 8 Zeichen lang sein.",
        };
    }

    if (newPassword !== passwordConfirm) {
        return {
            success: false,
            message: "Die Passwortbestätigung stimmt nicht überein.",
        };
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return {
            success: false,
            message: "Du bist nicht angemeldet. Bitte melde dich erneut an.",
        };
    }

    const { error } = await supabase.auth.updateUser({
        password: newPassword,
    });

    if (error) {
        return {
            success: false,
            message: `Passwort konnte nicht geändert werden: ${error.message}`,
        };
    }

    return {
        success: true,
        message: "Passwort wurde erfolgreich geändert.",
    };
}

export async function uploadCompanySignatureAssetAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const asset = getAssetField(getStringValue(formData, "asset_type"));
    const fileValue = formData.get("file");

    if (!asset) {
        throw new Error("Ungültiger Upload-Typ.");
    }

    if (!(fileValue instanceof File) || fileValue.size <= 0) {
        redirectWithAssetUploadError("missingFile");
    }

    if (fileValue.size > maxImageAssetFileSizeBytes) {
        redirectWithAssetUploadError("fileTooLarge");
    }

    if (!isAllowedImageAssetFile(fileValue)) {
        redirectWithAssetUploadError("unsupportedType");
    }

    const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select(asset.fieldName)
        .eq("id", companyId)
        .single();

    if (companyError || !companyData) {
        throw new Error(
            `Firmendaten konnten nicht geladen werden: ${
                companyError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const companyAssetPaths = companyData as CompanyAssetPathRow;
    const oldPath = companyAssetPaths[asset.fieldName];
    const originalFileName = sanitizeFileName(fileValue.name);
    const filePath = `company-assets/${companyId}/${asset.folderName}/${Date.now()}${getFileExtension(
        originalFileName,
    )}`;
    const fileBuffer = Buffer.from(await fileValue.arrayBuffer());

    try {
        const pdfDocument = await PDFDocument.load(fileBuffer);

        if (pdfDocument.getPageCount() < 1) {
            redirectWithTermsUploadError("invalidFile");
        }
    } catch {
        redirectWithTermsUploadError("invalidFile");
    }

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
            contentType: fileValue.type || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        console.error("[settings] company signature/stamp upload failed", uploadError);
        const message = getDocumentUploadFailedMessage(uploadError);

        if (message === getUnsupportedImageAssetTypeMessage()) {
            redirectWithAssetUploadError("unsupportedType");
        }

        if (message === getImageAssetTooLargeMessage()) {
            redirectWithAssetUploadError("fileTooLarge");
        }

        redirectWithAssetUploadError("uploadFailed");
    }

    const { error: updateError } = await supabase
        .from("companies")
        .update({
            [asset.fieldName]: filePath,
            updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);

    if (updateError) {
        await supabase.storage.from("documents").remove([filePath]);
        console.error("[settings] company signature/stamp path update failed", updateError);
        throw new Error(
            "Unterschrift oder Stempel konnte nicht gespeichert werden. Bitte versuche es erneut.",
        );
    }

    if (oldPath && oldPath !== filePath) {
        await supabase.storage.from("documents").remove([oldPath]);
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/invoices");

    redirect(`/dashboard/settings?${asset.redirectFlag}=1`);
}

export async function removeCompanySignatureAssetAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const asset = getAssetField(getStringValue(formData, "asset_type"));

    if (!asset) {
        throw new Error("Ungültiger Upload-Typ.");
    }

    const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select(asset.fieldName)
        .eq("id", companyId)
        .single();

    if (companyError || !companyData) {
        throw new Error(
            `Firmendaten konnten nicht geladen werden: ${
                companyError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const companyAssetPaths = companyData as CompanyAssetPathRow;
    const oldPath = companyAssetPaths[asset.fieldName];

    const { error: updateError } = await supabase
        .from("companies")
        .update({
            [asset.fieldName]: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);

    if (updateError) {
        throw new Error(
            "Unterschrift oder Stempel konnte nicht entfernt werden. Bitte versuche es erneut.",
        );
    }

    if (oldPath) {
        await supabase.storage.from("documents").remove([oldPath]);
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/invoices");

    redirect("/dashboard/settings?assetRemoved=1");
}

export async function uploadCompanyTermsPdfAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const fileValue = formData.get("file");

    if (!(fileValue instanceof File) || fileValue.size <= 0) {
        redirectWithTermsUploadError("invalidFile");
    }

    if (
        fileValue.size > maxTermsPdfFileSizeBytes ||
        !isAllowedTermsPdfFile(fileValue)
    ) {
        redirectWithTermsUploadError("invalidFile");
    }

    const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("terms_pdf_path")
        .eq("id", companyId)
        .single();

    if (companyError || !companyData) {
        console.error("[settings] company terms lookup failed", companyError);
        redirectWithTermsUploadError("uploadFailed");
    }

    const oldPath = (companyData as CompanyTermsPathRow).terms_pdf_path;
    const originalFileName = sanitizeFileName(fileValue.name) || "agb.pdf";
    const filePath = `company-assets/${companyId}/terms/${Date.now()}-${originalFileName}`;
    const fileBuffer = Buffer.from(await fileValue.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
            contentType: "application/pdf",
            upsert: false,
        });

    if (uploadError) {
        console.error("[settings] terms PDF upload failed", uploadError);
        redirectWithTermsUploadError("uploadFailed");
    }

    const uploadedAt = new Date().toISOString();
    const { error: updateError } = await supabase
        .from("companies")
        .update({
            terms_pdf_path: filePath,
            terms_pdf_filename: fileValue.name,
            terms_pdf_mime_type: "application/pdf",
            terms_pdf_size: fileValue.size,
            terms_pdf_uploaded_at: uploadedAt,
            updated_at: uploadedAt,
        })
        .eq("id", companyId);

    if (updateError) {
        await supabase.storage.from("documents").remove([filePath]);
        console.error("[settings] terms PDF metadata update failed", updateError);
        redirectWithTermsUploadError("uploadFailed");
    }

    if (oldPath && oldPath !== filePath) {
        await supabase.storage.from("documents").remove([oldPath]);
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/invoices");

    redirect("/dashboard/settings?termsUploaded=1");
}

export async function removeCompanyTermsPdfAction(_formData: FormData) {
    void _formData;

    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("terms_pdf_path")
        .eq("id", companyId)
        .single();

    if (companyError || !companyData) {
        console.error("[settings] company terms lookup failed", companyError);
        redirectWithTermsUploadError("removeFailed");
    }

    const oldPath = (companyData as CompanyTermsPathRow).terms_pdf_path;
    const { error: updateError } = await supabase
        .from("companies")
        .update({
            terms_pdf_path: null,
            terms_pdf_filename: null,
            terms_pdf_mime_type: null,
            terms_pdf_size: null,
            terms_pdf_uploaded_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);

    if (updateError) {
        console.error("[settings] terms PDF remove failed", updateError);
        redirectWithTermsUploadError("removeFailed");
    }

    if (oldPath) {
        await supabase.storage.from("documents").remove([oldPath]);
    }

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/sales");
    revalidatePath("/dashboard/invoices");

    redirect("/dashboard/settings?termsRemoved=1");
}
