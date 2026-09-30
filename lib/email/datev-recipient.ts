import { DEFAULT_DATEV_INVOICE_UPLOAD_EMAIL } from "@/lib/email/datev-recipient-default";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isValidEmailAddress(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function getDatevInvoiceUploadEmail(companyId: string): Promise<string> {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
        .from("companies")
        .select("datev_invoice_upload_email")
        .eq("id", companyId)
        .maybeSingle();

    if (error) {
        console.error("[email] DATEV recipient lookup failed", error);
        return DEFAULT_DATEV_INVOICE_UPLOAD_EMAIL;
    }

    const configuredEmail = data?.datev_invoice_upload_email?.trim().toLowerCase();

    return configuredEmail && isValidEmailAddress(configuredEmail)
        ? configuredEmail
        : DEFAULT_DATEV_INVOICE_UPLOAD_EMAIL;
}
