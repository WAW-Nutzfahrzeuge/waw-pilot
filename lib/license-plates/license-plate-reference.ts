import type { SupabaseClient } from "@supabase/supabase-js";

export type LicensePlateCaseReference = {
    saleId: string | null;
    vehicleId: string;
    customerId: string;
    source: "sale" | "manual";
};

type SaleReferenceRow = {
    id: string;
    vehicle_id: string | null;
    buyer_customer_id: string | null;
};

/**
 * Resolves the three foreign keys of a Kennzeichen-Vorgang.
 *
 * A sale is authoritative: its vehicle_id and buyer_customer_id always win
 * over values supplied by the browser. Without a sale, the existing manual
 * workflow remains available, but both manually supplied records must belong
 * to the active company.
 */
export async function resolveLicensePlateCaseReference(params: {
    supabase: SupabaseClient;
    companyId: string;
    saleId: string | null;
    vehicleId: string | null;
    customerId: string | null;
}): Promise<LicensePlateCaseReference> {
    const { supabase, companyId, saleId, vehicleId, customerId } = params;

    if (saleId) {
        const { data, error } = await supabase
            .from("sales")
            .select("id, vehicle_id, buyer_customer_id")
            .eq("id", saleId)
            .eq("company_id", companyId)
            .maybeSingle();

        const sale = data as SaleReferenceRow | null;

        if (error || !sale) {
            throw new Error("Der ausgewählte Verkauf gehört nicht zu diesem Unternehmen oder existiert nicht mehr.");
        }

        if (!sale.vehicle_id || !sale.buyer_customer_id) {
            throw new Error("Der ausgewählte Verkauf hat kein vollständiges Fahrzeug- oder Käuferverhältnis.");
        }

        return {
            saleId: sale.id,
            vehicleId: sale.vehicle_id,
            customerId: sale.buyer_customer_id,
            source: "sale",
        };
    }

    if (!vehicleId) {
        throw new Error("Bitte wähle ein Fahrzeug aus.");
    }

    if (!customerId) {
        throw new Error("Bitte wähle einen Kunden aus.");
    }

    const [vehicleResult, customerResult] = await Promise.all([
        supabase
            .from("vehicles")
            .select("id")
            .eq("id", vehicleId)
            .eq("company_id", companyId)
            .maybeSingle(),
        supabase
            .from("customers")
            .select("id")
            .eq("id", customerId)
            .eq("company_id", companyId)
            .maybeSingle(),
    ]);

    if (vehicleResult.error || !vehicleResult.data) {
        throw new Error("Das ausgewählte Fahrzeug gehört nicht zu diesem Unternehmen oder existiert nicht mehr.");
    }

    if (customerResult.error || !customerResult.data) {
        throw new Error("Der ausgewählte Kunde gehört nicht zu diesem Unternehmen oder existiert nicht mehr.");
    }

    return {
        saleId: null,
        vehicleId,
        customerId,
        source: "manual",
    };
}
