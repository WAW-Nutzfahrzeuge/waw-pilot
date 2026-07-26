import { EmailConfigurationError } from "@/lib/email/resend";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CompanyMailSender = {
    senderName: string;
    senderEmail: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(email: string): boolean {
    return emailPattern.test(email);
}

export async function getInvoiceMailSender(
    companyId: string,
): Promise<CompanyMailSender> {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
        .from("companies")
        .select("legal_name, invoice_sender_email")
        .eq("id", companyId)
        .single();

    if (error || !data) {
        throw new EmailConfigurationError();
    }

    const senderEmail =
        typeof data.invoice_sender_email === "string"
            ? data.invoice_sender_email.trim().toLowerCase()
            : "";

    if (!senderEmail || !isValidEmailAddress(senderEmail)) {
        throw new EmailConfigurationError();
    }

    const senderName =
        typeof data.legal_name === "string" && data.legal_name.trim()
            ? data.legal_name.trim()
            : "WAW Nutzfahrzeuge";

    return {
        senderName,
        senderEmail,
    };
}
