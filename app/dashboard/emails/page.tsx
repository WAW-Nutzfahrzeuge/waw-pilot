import { getCurrentCompanyId } from "@/lib/company";
import { PageHeader } from "@/components/shared/page-header";
import { createEmailRepository } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";
import { EmailHistoryTable } from "@/src/modules/email/presentation/components/email-history-table";

type EmailsPageProps = {
    searchParams?: Promise<{
        q?: string;
        status?: string;
    }>;
};

export default async function EmailsPage({ searchParams }: EmailsPageProps) {
    const params = (await searchParams) ?? {};
    const repository = await createEmailRepository();
    const result = await repository.search({
        companyId: getCurrentCompanyId(),
        search: params.q ?? null,
        status: null,
        limit: 100,
    });

    return (
        <div className="space-y-6">
            <PageHeader
                title="E-Mail-Historie"
                description="Nachvollziehbare Versandhistorie mit konkreten Dokumentanhängen."
            />
            <EmailHistoryTable
                emails={result.emails}
                emptyText="Für diese Auswahl wurden keine E-Mails gefunden."
            />
        </div>
    );
}
