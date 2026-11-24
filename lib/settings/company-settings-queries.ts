import { unstable_noStore as noStore } from "next/cache";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { renderCompanyEmailSignaturePreview, type CompanyEmailSignatureAsset } from "@/lib/email/company-email-signature";

export type CompanyEmailSignatureAssetView = CompanyEmailSignatureAsset;

export type CompanySettings = {
    id: string;
    legal_name: string;
    street: string;
    postal_code: string;
    city: string;
    country: string;
    email: string | null;
    invoice_sender_email: string | null;
    datev_invoice_upload_email: string | null;
    website: string | null;
    phone: string | null;
    mobile_phone_1: string | null;
    mobile_phone_2: string | null;
    vat_id: string | null;
    tax_number: string | null;
    commercial_register_number: string | null;
    bank_name: string | null;
    bank_blz: string | null;
    bank_iban: string | null;
    bank_bic: string | null;
    bank_account_holder: string | null;
    signature_image_path: string | null;
    stamp_image_path: string | null;
    terms_pdf_path: string | null;
    terms_pdf_filename: string | null;
    terms_pdf_mime_type: string | null;
    terms_pdf_size: number | null;
    terms_pdf_uploaded_at: string | null;
    email_signature_html: string;
    email_signature_preview_html: string;
    email_signature_includes_closing: boolean;
    email_signature_assets: CompanyEmailSignatureAssetView[];
};

export async function getCompanySettings(): Promise<CompanySettings> {
    noStore();

    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("companies")
        .select(
            `
            id,
            legal_name,
            street,
            postal_code,
            city,
            country,
            email,
            invoice_sender_email,
            datev_invoice_upload_email,
            website,
            phone,
            mobile_phone_1,
            mobile_phone_2,
            vat_id,
            tax_number,
            commercial_register_number,
            bank_name,
            bank_blz,
            bank_iban,
            bank_bic,
            bank_account_holder,
            signature_image_path,
            stamp_image_path,
            terms_pdf_path,
            terms_pdf_filename,
            terms_pdf_mime_type,
            terms_pdf_size,
            terms_pdf_uploaded_at,
            email_signature_html,
            email_signature_includes_closing,
            email_signature_assets
        `,
        )
        .eq("id", companyId)
        .single();

    if (error || !data) {
        throw new Error(
            `Firmendaten konnten nicht geladen werden: ${
                error?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const rawAssets = Array.isArray(data.email_signature_assets) ? data.email_signature_assets : [];
    const assets = await Promise.all(rawAssets.map(async (item) => {
        if (!item || typeof item !== "object") return null;
        const asset = item as Record<string, unknown>;
        if (typeof asset.contentId !== "string" || typeof asset.filePath !== "string" || typeof asset.fileName !== "string" || typeof asset.fileSizeBytes !== "number") return null;
        const { data: signed } = await supabase.storage.from("documents").createSignedUrl(asset.filePath, 600);
        return {
            contentId: asset.contentId,
            filePath: asset.filePath,
            fileName: asset.fileName,
            mimeType: "image/png" as const,
            fileSizeBytes: asset.fileSizeBytes,
            ...(signed?.signedUrl ? { previewUrl: signed.signedUrl } : {}),
        };
    }));
    const emailSignatureAssets = assets.filter((asset): asset is CompanyEmailSignatureAssetView => Boolean(asset));
    const signatureHtml = typeof data.email_signature_html === "string" ? data.email_signature_html : "";
    return {
        ...data,
        email_signature_html: signatureHtml,
        email_signature_includes_closing: data.email_signature_includes_closing === true,
        email_signature_assets: emailSignatureAssets,
        email_signature_preview_html: renderCompanyEmailSignaturePreview(signatureHtml, emailSignatureAssets),
    } as CompanySettings;
}
