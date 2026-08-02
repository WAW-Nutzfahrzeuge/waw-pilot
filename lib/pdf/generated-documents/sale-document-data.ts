import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GeneratedDocumentValidationData } from "@/lib/pdf/generated-documents/document-validation";

type SupabaseRelation<T> = T | T[] | null;

type CompanyRelation = {
    legal_name: string;
    street: string;
    postal_code: string;
    city: string;
    country: string;
    email: string | null;
    website?: string | null;
    phone: string | null;
    mobile_phone_1?: string | null;
    mobile_phone_2?: string | null;
    vat_id: string | null;
    tax_number: string | null;
};

type CustomerRelation = {
    type: "company" | "private";
    company_name: string | null;
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

type VehicleRelation = {
    internal_number: string;
    manufacturer: string;
    model: string;
    vehicle_type: string;
    vin: string;
    license_plate: string | null;
    first_registration: string | null;
    construction_year: number | null;
};

type SaleQueryRow = {
    id: string;
    company_id: string;
    sale_number: string | null;
    buyer_customer_id: string;
    vehicle_id: string;
    sale_type: string | null;
    sale_date: string;
    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    export_destination_city: string | null;
    export_destination_country: string | null;
    export_arrival_month: string | null;
    export_arrival_year: string | null;
    export_transport_date: string | null;
    export_transport_type: string | null;
    export_receiver_name: string | null;
    companies: SupabaseRelation<CompanyRelation>;
    customers: SupabaseRelation<CustomerRelation>;
    vehicles: SupabaseRelation<VehicleRelation>;
};

type InvoiceQueryRow = {
    id: string;
    invoice_number: string;
    invoice_date: string;
    invoice_type: string | null;
    status: string;
    payment_status: string;
};

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

function getCustomerName(customer: CustomerRelation | null): string | null {
    if (!customer) return null;

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

export type SaleGeneratedDocumentData = GeneratedDocumentValidationData & {
    saleId: string;
    customerId: string;
    vehicleId: string;
    invoiceId: string | null;
};

export async function getSaleGeneratedDocumentData(
    saleId: string,
): Promise<SaleGeneratedDocumentData> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [
        { data: saleData, error: saleError },
        { data: invoiceData, error: invoiceError },
    ] = await Promise.all([
        supabase
            .from("sales")
            .select(
                `
    id,
            sale_number,
            company_id,
            buyer_customer_id,
            vehicle_id,
            sale_type,
            sale_date,
            net_amount,
            vat_rate,
            vat_amount,
            gross_amount,
            export_destination_city,
            export_destination_country,
            export_arrival_month,
            export_arrival_year,
            export_transport_date,
            export_transport_type,
            export_receiver_name,
            companies (
                legal_name,
                street,
                postal_code,
                city,
                country,
                email,
                website,
                phone,
                mobile_phone_1,
                mobile_phone_2,
                vat_id,
                tax_number
            ),
            customers:buyer_customer_id (
                type,
                company_name,
                first_name,
                last_name,
                street,
                postal_code,
                city,
                country,
                email,
                phone,
                vat_id
            ),
            vehicles (
                internal_number,
                manufacturer,
                model,
                vehicle_type,
                vin,
                license_plate,
                first_registration,
                construction_year
            )
                `,
            )
            .eq("id", saleId)
            .eq("company_id", companyId)
            .single(),
        supabase
            .from("invoices")
            .select(
                `
            id,
            invoice_number,
            invoice_date,
            invoice_type,
            status,
            payment_status
        `,
            )
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .order("invoice_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    if (saleError || !saleData) {
        throw new Error(
            `Verkauf konnte nicht geladen werden: ${
                saleError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const sale = saleData as unknown as SaleQueryRow;

    const company = getSingleRelation(sale.companies);
    const customer = getSingleRelation(sale.customers);
    const vehicle = getSingleRelation(sale.vehicles);

    if (invoiceError) {
        throw new Error(
            `Rechnung zum Verkauf konnte nicht geprüft werden: ${invoiceError.message}`,
        );
    }

    const invoice = invoiceData as InvoiceQueryRow | null;

    return {
        saleId: sale.id,
        customerId: sale.buyer_customer_id,
        vehicleId: sale.vehicle_id,
        invoiceId: invoice?.id ?? null,

        company: company
            ? {
                legalName: company.legal_name,
                street: company.street,
                postalCode: company.postal_code,
                city: company.city,
                country: company.country,
                email: company.email,
                website: company.website ?? null,
                phone: company.phone,
                mobilePhone1: company.mobile_phone_1 ?? null,
                mobilePhone2: company.mobile_phone_2 ?? null,
                vatId: company.vat_id,
                taxNumber: company.tax_number,
            }
            : null,

        customer: customer
            ? {
                name: getCustomerName(customer),
                street: customer.street,
                postalCode: customer.postal_code,
                city: customer.city,
                country: customer.country,
                email: customer.email,
                phone: customer.phone,
                vatId: customer.vat_id,
            }
            : null,

        vehicle: vehicle
            ? {
                internalNumber: vehicle.internal_number,
                manufacturer: vehicle.manufacturer,
                model: vehicle.model,
                vehicleType: vehicle.vehicle_type,
                vin: vehicle.vin,
                licensePlate: vehicle.license_plate,
                firstRegistration: vehicle.first_registration,
                constructionYear: vehicle.construction_year,
            }
            : null,

        sale: {
            id: sale.id,
            saleNumber: sale.sale_number,
            saleType: sale.sale_type ?? "inland",
            saleDate: sale.sale_date,
            invoiceNumber: invoice?.invoice_number ?? null,
            invoiceDate: invoice?.invoice_date ?? null,
            netAmount: Number(sale.net_amount),
            vatRate: Number(sale.vat_rate),
            vatAmount: Number(sale.vat_amount),
            grossAmount: Number(sale.gross_amount),
        },

        export: {
            destinationCity: sale.export_destination_city ?? customer?.city ?? null,
            destinationCountry: sale.export_destination_country ?? customer?.country ?? null,
            arrivalMonth: sale.export_arrival_month,
            arrivalYear: sale.export_arrival_year,
            transportDate: sale.export_transport_date,
            transportType: sale.export_transport_type,
            receiverName: sale.export_receiver_name ?? getCustomerName(customer),
        },
    };
}
