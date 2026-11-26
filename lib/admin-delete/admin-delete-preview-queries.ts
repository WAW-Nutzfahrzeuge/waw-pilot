import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type VehicleAdminDeleteDependencyPreview = {
    purchases: number;
    sales: number;
    invoices: number;
    cashbookEntries: number;
    financialEntries: number;
    purchaseReferences: { id: string; number: string | null }[];
    saleReferences: { id: string; number: string | null }[];
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

    const [purchaseResult, saleResult, invoices, cashbookEntries, financialEntries] =
        await Promise.all([
            supabase
                    .from("purchase_cases")
                    .select("id, purchase_number")
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
            supabase
                    .from("sales")
                    .select("id, sale_number")
                    .eq("company_id", companyId)
                    .eq("vehicle_id", vehicleId),
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

    if (purchaseResult.error) throw new Error("Ankaufs-Abhängigkeiten konnten nicht geprüft werden.");
    if (saleResult.error) throw new Error("Verkaufs-Abhängigkeiten konnten nicht geprüft werden.");
    const purchaseReferences = (purchaseResult.data ?? []) as { id: string; purchase_number: string | null }[];
    const saleReferences = (saleResult.data ?? []) as { id: string; sale_number: string | null }[];

    return {
        purchases: purchaseReferences.length,
        sales: saleReferences.length,
        invoices,
        cashbookEntries,
        financialEntries,
        purchaseReferences: purchaseReferences.map(({ id, purchase_number }) => ({ id, number: purchase_number })),
        saleReferences: saleReferences.map(({ id, sale_number }) => ({ id, number: sale_number })),
    };
}
