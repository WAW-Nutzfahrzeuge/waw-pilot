import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PurchaseFormVehicle = {
    id: string;
    label: string;
    description: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    vehicle_type: string;
    vin: string;
    construction_year: number | null;
    disabled?: boolean;
};

export type PurchaseFormSeller = {
    id: string;
    label: string;
    type: "company" | "private";
    company_name: string | null;
    owner_name: string | null;
    first_name: string | null;
    last_name: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    email: string | null;
    phone: string | null;
    vat_id: string | null;
};

export type PurchaseFormData = {
    vehicles: PurchaseFormVehicle[];
    sellers: PurchaseFormSeller[];
};

type VehicleRow = {
    id: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    vehicle_type: string;
    vin: string;
    construction_year: number | null;
    status: string;
};

type CustomerRow = {
    id: string;
    type: "company" | "private";
    company_name: string | null;
    owner_name: string | null;
    first_name: string | null;
    last_name: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    email: string | null;
    phone: string | null;
    vat_id: string | null;
};

function getCustomerName(customer: CustomerRow): string {
    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

export async function getPurchaseFormData(): Promise<PurchaseFormData> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [
        { data: vehiclesData, error: vehiclesError },
        { data: customersData, error: customersError },
        { data: purchaseVehiclesData, error: purchaseVehiclesError },
    ] = await Promise.all([
        supabase
            .from("vehicles")
            .select(
                "id, internal_number, manufacturer, model, vehicle_type, vin, construction_year, status",
            )
            .eq("company_id", companyId)
            .order("created_at", { ascending: false }),

        supabase
            .from("customers")
            .select(
                "id, type, company_name, owner_name, first_name, last_name, street, postal_code, city, country, email, phone, vat_id",
            )
            .eq("company_id", companyId)
            .order("created_at", { ascending: false }),

        supabase
            .from("purchase_cases")
            .select("vehicle_id")
            .eq("company_id", companyId)
            .not("vehicle_id", "is", null),
    ]);

    if (vehiclesError) {
        throw new Error(`Fahrzeuge konnten nicht geladen werden: ${vehiclesError.message}`);
    }

    if (customersError) {
        throw new Error(`Verkäufer/Kunden konnten nicht geladen werden: ${customersError.message}`);
    }

    if (purchaseVehiclesError) {
        throw new Error(`Ankaufsverknüpfungen konnten nicht geladen werden: ${purchaseVehiclesError.message}`);
    }

    const purchasedVehicleIds = new Set(
        (purchaseVehiclesData ?? [])
            .map((purchase) => purchase.vehicle_id)
            .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
    );

    return {
        vehicles: ((vehiclesData ?? []) as unknown as VehicleRow[]).map((vehicle) => {
            const hasPurchase = purchasedVehicleIds.has(vehicle.id);
            const disabled = hasPurchase || vehicle.status === "sold";

            return {
                id: vehicle.id,
                label: `${vehicle.manufacturer} ${vehicle.model}`,
                description: [
                    `VIN: ${vehicle.vin}`,
                    vehicle.construction_year ? `Baujahr: ${vehicle.construction_year}` : null,
                    disabled ? "bereits angekauft oder verkauft" : null,
                ]
                    .filter(Boolean)
                    .join(" · "),
                internal_number: vehicle.internal_number,
                manufacturer: vehicle.manufacturer,
                model: vehicle.model,
                vehicle_type: vehicle.vehicle_type,
                vin: vehicle.vin,
                construction_year: vehicle.construction_year,
                disabled,
            };
        }),

        sellers: ((customersData ?? []) as CustomerRow[]).map((seller) => ({
            id: seller.id,
            label: getCustomerName(seller),
            type: seller.type,
            company_name: seller.company_name,
            owner_name: seller.owner_name,
            first_name: seller.first_name,
            last_name: seller.last_name,
            street: seller.street,
            postal_code: seller.postal_code,
            city: seller.city,
            country: seller.country,
            email: seller.email,
            phone: seller.phone,
            vat_id: seller.vat_id,
        })),
    };
}
