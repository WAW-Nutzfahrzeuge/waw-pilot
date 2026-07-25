import { unstable_noStore as noStore } from "next/cache";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CompanySettings = {
    id: string;
    legal_name: string;
    street: string;
    postal_code: string;
    city: string;
    country: string;
    email: string | null;
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
            terms_pdf_uploaded_at
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

    return data as CompanySettings;
}
