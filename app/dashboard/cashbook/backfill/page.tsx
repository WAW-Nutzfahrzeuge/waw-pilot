export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { FinancialBackfillPanel } from "@/components/cashbook/financial-backfill-panel";
import { analyzeFinancialBackfill } from "@/lib/accounting/financial-backfill";
import { getCurrentUserRole } from "@/lib/auth/current-user";

export default async function CashbookBackfillPage() {
    const role = await getCurrentUserRole();

    if (role !== "admin") {
        redirect("/dashboard/cashbook");
    }

    let analysis = null;
    let analysisError: string | null = null;

    try {
        analysis = await analyzeFinancialBackfill();
    } catch (error) {
        analysisError =
            error instanceof Error
                ? error.message
                : "Prüfung auf offene Altdaten fehlgeschlagen.";
    }

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
            <Link
                href="/dashboard/cashbook"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
                <ArrowLeft className="size-4" />
                Zurück zum Kassenbuch
            </Link>

            <FinancialBackfillPanel analysis={analysis} analysisError={analysisError} />
        </div>
    );
}
