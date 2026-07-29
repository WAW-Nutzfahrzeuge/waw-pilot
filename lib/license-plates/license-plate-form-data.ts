import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LicensePlateFormVehicle = {
    id: string;
    label: string;
};

export type LicensePlateFormCustomer = {
    id: string;
    type: "company" | "private";
    company_name: string | null;
    owner_name: string | null;
    first_name: string | null;
    last_name: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    email: string | null;
};

export type LicensePlateFormSale = {
    id: string;
    label: string;
};

type VehicleRow = {
    id: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    vin: string;
};

type CustomerRow = {
    id: string;
    type: "company" | "private";
    company_name: string | null;
    owner_name: string | null;
    first_name: string | null;
    last_name: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    email: string | null;
};

type SaleRow = {
    id: string;
    sale_date: string;
    vehicles: {
        internal_number: string;
        manufacturer: string;
        model: string;
    } | null;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
};

export type LicensePlateFormData = {
    vehicles: LicensePlateFormVehicle[];
    customers: LicensePlateFormCustomer[];
    sales: LicensePlateFormSale[];
};

function getCustomerName(customer: CustomerRow | SaleRow["customers"]): string {
    if (!customer) return "Unbekannter Kunde";

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

export async function getLicensePlateFormData(): Promise<LicensePlateFormData> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [{ data: vehiclesData, error: vehiclesError }, { data: customersData, error: customersError }, { data: salesData, error: salesError }] =
        await Promise.all([
            supabase
                .from("vehicles")
                .select("id, internal_number, manufacturer, model, vin")
                .eq("company_id", companyId)
                .order("created_at", { ascending: false }),

            supabase
                .from("customers")
                .select("id, type, company_name, owner_name, first_name, last_name, postal_code, city, country, email")
                .eq("company_id", companyId)
                .order("created_at", { ascending: false }),

            supabase
                .from("sales")
                .select(
                    `
                    id,
                    sale_date,
                    vehicles (
                        internal_number,
                        manufacturer,
                        model
                    ),
                    customers:buyer_customer_id (
                        type,
                        company_name,
                        first_name,
                        last_name
                    )
                `,
                )
                .eq("company_id", companyId)
                .order("created_at", { ascending: false }),
        ]);

    if (vehiclesError) {
        throw new Error(`Fahrzeuge konnten nicht geladen werden: ${vehiclesError.message}`);
    }

    if (customersError) {
        throw new Error(`Kunden konnten nicht geladen werden: ${customersError.message}`);
    }

    if (salesError) {
        throw new Error(`Verkäufe konnten nicht geladen werden: ${salesError.message}`);
    }

    const vehicles = ((vehiclesData ?? []) as VehicleRow[]).map((vehicle) => ({
        id: vehicle.id,
        label: `${vehicle.manufacturer} ${vehicle.model} · ${vehicle.vin}`,
    }));

    const customers = ((customersData ?? []) as CustomerRow[]).map((customer) => ({
        id: customer.id,
        type: customer.type,
        company_name: customer.company_name,
        owner_name: customer.owner_name,
        first_name: customer.first_name,
        last_name: customer.last_name,
        postal_code: customer.postal_code,
        city: customer.city,
        country: customer.country,
        email: customer.email,
    }));

    const sales = ((salesData ?? []) as unknown as SaleRow[]).map((sale) => {
        const vehicleLabel = sale.vehicles
            ? `${sale.vehicles.manufacturer} ${sale.vehicles.model}`
            : "Unbekanntes Fahrzeug";

        const customerLabel = getCustomerName(sale.customers);

        return {
            id: sale.id,
            label: `${vehicleLabel} · ${customerLabel} · ${sale.sale_date}`,
        };
    });

    return {
        vehicles,
        customers,
        sales,
    };
}
