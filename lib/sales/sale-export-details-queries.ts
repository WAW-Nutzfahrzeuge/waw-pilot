import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SaleExportDetails = {
    sale_id: string;
    sale_type: "inland" | "eu" | "export_third_country";
    sale_date: string;
    buyer_city: string | null;
    buyer_country: string | null;
    export_destination_city: string | null;
    export_destination_country: string | null;
    export_arrival_month: string | null;
    export_arrival_year: string | null;
    export_transport_date: string | null;
    export_transport_type: string | null;
    export_receiver_name: string | null;
};

function getSingleRelation<T>(relation: T | T[] | null | undefined): T | null {
    if (!relation) return null;

    return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export async function getSaleExportDetails(
    saleId: string,
): Promise<SaleExportDetails> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("sales")
        .select(
            `
            id,
            sale_type,
            sale_date,
            export_destination_city,
            export_destination_country,
            export_arrival_month,
            export_arrival_year,
            export_transport_date,
            export_transport_type,
            export_receiver_name,
            customers:buyer_customer_id (
                city,
                country
            )
        `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        throw new Error(
            `Exportdaten konnten nicht geladen werden: ${
                error?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const buyerCustomer = getSingleRelation(data.customers);

    return {
        sale_id: data.id as string,
        sale_type:
            data.sale_type === "eu" || data.sale_type === "export_third_country"
                ? data.sale_type
                : "inland",
        sale_date: data.sale_date,
        buyer_city: buyerCustomer?.city ?? null,
        buyer_country: buyerCustomer?.country ?? null,
        export_destination_city:
            data.export_destination_city ?? buyerCustomer?.city ?? null,
        export_destination_country:
            data.export_destination_country ?? buyerCustomer?.country ?? null,
        export_arrival_month: data.export_arrival_month,
        export_arrival_year: data.export_arrival_year,
        export_transport_date: data.export_transport_date,
        export_transport_type: data.export_transport_type,
        export_receiver_name: data.export_receiver_name,
    };
}
