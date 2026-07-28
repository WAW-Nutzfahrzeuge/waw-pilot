export const dynamic = "force-dynamic";

import { CompanySettingsForm } from "@/components/settings/company-settings-form";
import { getCompanySettings } from "@/lib/settings/company-settings-queries";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";

type SettingsPageProps = {
    searchParams: Promise<{
        signatureUploaded?: string;
        stampUploaded?: string;
        companySaved?: string;
        assetUploadError?: string;
        termsUploaded?: string;
        termsRemoved?: string;
        termsUploadError?: string;
    }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
    const supabase = await createAuthServerSupabaseClient();

    const [company, resolvedSearchParams, userResponse] = await Promise.all([
        getCompanySettings(),
        searchParams,
        supabase.auth.getUser(),
    ]);

    return (
        <CompanySettingsForm
            company={company}
            userEmail={userResponse.data.user?.email ?? ""}
            companySaved={resolvedSearchParams.companySaved === "1"}
            signatureUploaded={resolvedSearchParams.signatureUploaded === "1"}
            stampUploaded={resolvedSearchParams.stampUploaded === "1"}
            assetUploadError={resolvedSearchParams.assetUploadError}
            termsUploaded={resolvedSearchParams.termsUploaded === "1"}
            termsRemoved={resolvedSearchParams.termsRemoved === "1"}
            termsUploadError={resolvedSearchParams.termsUploadError}
        />
    );
}
