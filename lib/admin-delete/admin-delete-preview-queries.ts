import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type VehicleAdminDeleteDependencyPreview = {
    purchases: number;
    sales: number;
    invoices: number;
    cashbookEntries: number;
    financialEntries: number;
};

async function getCount<T>(
    query: PromiseLike<{ count: number | null; error: T | null }>,
    errorMessage: string,
): Promise<number> {
    const { count, error } = await query;

    if (error) {
        throw new Error(errorMessage);
    }

    return count ?? 0;
}

export async function getVehicleAdminDeleteDependencyPreview(
    vehicleId: string,
): Promise<VehicleAdminDeleteDependencyPreview> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [purchases, sales, invoices, cashbookEntries, financialEntries] =
        await Promise.all([
            getCount(
                supabase
                    .from("purchase_cases")
                    .select("id", { count: "exact", head: true })
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
                "Ankaufs-Abhängigkeiten konnten nicht geprüft werden.",
            ),
            getCount(
                supabase
                    .from("sales")
                    .select("id", { count: "exact", head: true })
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
                "Verkaufs-Abhängigkeiten konnten nicht geprüft werden.",
            ),
            getCount(
                supabase
                    .from("invoices")
                    .select("id", { count: "exact", head: true })
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
                "Rechnungs-Abhängigkeiten konnten nicht geprüft werden.",
            ),
            getCount(
                supabase
                    .from("cashbook_entries")
                    .select("id", { count: "exact", head: true })
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
                "Kassenbuch-Abhängigkeiten konnten nicht geprüft werden.",
            ),
            getCount(
                supabase
                    .from("financial_entries")
                    .select("id", { count: "exact", head: true })
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
                "Finanz-Abhängigkeiten konnten nicht geprüft werden.",
            ),
        ]);

    return {
        purchases,
        sales,
        invoices,
        cashbookEntries,
        financialEntries,
    };
}
