import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company";

export type CustomerRow = {
    id: string;
    type: "company" | "private";
    company_name: string | null;
    owner_name: string | null;
    first_name: string | null;
    last_name: string | null;
    street: string;
    postal_code: string;
    city: string;
    country: string;
    email: string | null;
    preferred_language: string;
    phone: string | null;
    tax_number: string | null;
    vat_id: string | null;
    commercial_register_number: string | null;
    notes: string | null;
    created_at: string;
    vehicles_count: number;
    sales_count: number;
};

export async function getCustomersCount(): Promise<number> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { count, error } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

    if (error) {
        throw new Error(`Kundenanzahl konnte nicht geladen werden: ${error.message}`);
    }

    return count ?? 0;
}

export async function getCustomers(): Promise<CustomerRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("customers")
        .select(
            `
      id,
      type,
      company_name,
      owner_name,
      first_name,
      last_name,
      street,
      postal_code,
      city,
      country,
      email,
      preferred_language,
      phone,
      tax_number,
      vat_id,
      commercial_register_number,
      notes,
      created_at
    `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Kunden konnten nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).map((customer) => ({
        ...customer,
        vehicles_count: 0,
        sales_count: 0,
    }));
}

export async function getSaleFormCustomers(): Promise<CustomerRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("customers")
        .select(
            `
      id,
      type,
      company_name,
      owner_name,
      first_name,
      last_name,
      street,
      postal_code,
      city,
      country,
      email,
      preferred_language,
      phone,
      tax_number,
      vat_id,
      commercial_register_number,
      created_at
    `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Kunden für Verkaufsformular konnten nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).map((customer) => ({
        ...customer,
        notes: null,
        vehicles_count: 0,
        sales_count: 0,
    }));
}
