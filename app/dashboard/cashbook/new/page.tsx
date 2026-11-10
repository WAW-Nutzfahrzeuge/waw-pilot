import { CashbookEntryForm } from "@/components/cashbook/cashbook-entry-form";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getAvailableCashInflows } from "@/lib/accounting/cash-deposit-allocations";

type NewCashbookEntryPageProps = {
    searchParams: Promise<{ category?: string }>;
};

export default async function NewCashbookEntryPage({ searchParams }: NewCashbookEntryPageProps) {
    const params = await searchParams;
    const initialCategory = params.category === "cash_bank_deposit" ? "cash_bank_deposit" : "other";
    const cashInflowCandidates = initialCategory === "cash_bank_deposit"
        ? await getAvailableCashInflows((await getCurrentUserContext()).companyId)
        : [];

    return <CashbookEntryForm initialCategory={initialCategory} cashInflowCandidates={cashInflowCandidates} />;
}
