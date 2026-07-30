export const dynamic = "force-dynamic";

import { CompanySettingsForm } from "@/components/settings/company-settings-form";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCompanySettings } from "@/lib/settings/company-settings-queries";

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
    const [company, resolvedSearchParams, userContext] = await Promise.all([
        getCompanySettings(),
        searchParams,
        getCurrentUserContext(),
    ]);

    return (
        <CompanySettingsForm
            company={company}
            userEmail={userContext.email ?? ""}
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
