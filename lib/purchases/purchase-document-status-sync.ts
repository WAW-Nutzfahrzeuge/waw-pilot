import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasRequiredPurchaseDocuments } from "@/lib/purchases/purchase-document-requirements";

export async function syncPurchaseDocumentStatus(params: {
    companyId: string;
    purchaseCaseId: string;
    vehicleId: string | null;
}): Promise<boolean> {
    const supabase = createServerSupabaseClient();
    let vehicle: { vehicle_type: string; vehicle_category: string | null } | null = null;

    if (params.vehicleId) {
        const { data, error } = await supabase
            .from("vehicles")
            .select("vehicle_type, vehicle_category")
            .eq("company_id", params.companyId)
            .eq("id", params.vehicleId)
            .maybeSingle();
        if (error) throw new Error(`Fahrzeugart konnte nicht geprüft werden: ${error.message}`);
        vehicle = data;
    }

    let documentsQuery = supabase
        .from("documents")
        .select("document_type, status")
        .eq("company_id", params.companyId);

    documentsQuery = params.vehicleId
        ? documentsQuery.or(
              `purchase_case_id.eq.${params.purchaseCaseId},vehicle_id.eq.${params.vehicleId}`,
          )
        : documentsQuery.eq("purchase_case_id", params.purchaseCaseId);

    const { data: documents, error: documentsError } = await documentsQuery;
    if (documentsError) {
        throw new Error(`Ankaufsdokumente konnten nicht geprüft werden: ${documentsError.message}`);
    }

    const isComplete = hasRequiredPurchaseDocuments({
        vehicle,
        documents: documents ?? [],
    });
    const { error: updateError } = await supabase
        .from("purchase_cases")
        .update({
            document_check_status: isComplete ? "complete" : "missing",
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.purchaseCaseId)
        .eq("company_id", params.companyId);

    if (updateError) {
        throw new Error(`Dokumentenstatus des Ankaufs konnte nicht gespeichert werden: ${updateError.message}`);
    }

    return isComplete;
}
