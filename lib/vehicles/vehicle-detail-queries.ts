import { getCurrentCompanyId } from "@/lib/company";
import type { PaymentStatus, SaleStatus } from "@/lib/sales/sale-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type VehicleBaseRow = {
    id: string;
    company_id: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    vehicle_type: string;
    status: string;
    vin: string;
    license_plate: string | null;
    construction_year: number | null;
    first_registration: string | null;
    purchase_price_net: number | string;
    sale_price_net: number | string | null;
    additional_costs_net: number | string | null;
    notes: string | null;
    damage_notes: string | null;
    show_damage_on_invoice: boolean | null;
    created_at: string;
    seller_customer_id: string | null;
    buyer_customer_id: string | null;
};

type CustomerRow = {
    id: string;
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
};

type DocumentRow = {
    id: string;
    document_type: string;
    source: string;
    status: "available" | "missing" | "needs_review";
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    created_at: string;
};

type SaleRow = {
    id: string;
    sale_date: string;
    net_amount: number | string;
    gross_amount: number | string;
    status: SaleStatus;
    payment_status: PaymentStatus;
    buyer_customer_id: string;
};

type InvoiceRow = {
    id: string;
    sale_id: string;
    invoice_number: string;
    invoice_date: string;
    gross_amount: number | string;
};

export type VehicleDetailDocument = {
    id: string;
    document_type: string;
    source: string;
    status: "available" | "missing" | "needs_review";
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    created_at: string;
};

export type VehicleDetailSale = {
    id: string;
    sale_date: string;
    net_amount: number;
    gross_amount: number;
    status: SaleStatus;
    payment_status: PaymentStatus;
    customer_name: string;
    invoice_id: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
};

export type VehicleDetail = {
    id: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    vehicle_type: string;
    name: string;
    status: string;
    vin: string;
    license_plate: string | null;
    construction_year: number | null;
    first_registration: string | null;
    purchase_price_net: number;
    sale_price_net: number | null;
    additional_costs_net: number;
    document_status: "complete" | "partial" | "missing";
    notes: string | null;
    damage_notes: string | null;
    show_damage_on_invoice: boolean;
    created_at: string;

    seller: {
        id: string;
        name: string;
        address: string;
        email: string | null;
        phone: string | null;
    } | null;

    buyer: {
        id: string;
        name: string;
        address: string;
        email: string | null;
        phone: string | null;
    } | null;

    documents: VehicleDetailDocument[];
    sales: VehicleDetailSale[];
};

function getCustomerName(customer: CustomerRow | null): string {
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

function getCustomerAddress(customer: CustomerRow | null): string {
    if (!customer) return "—";

    return [
        customer.street,
        [customer.postal_code, customer.city].filter(Boolean).join(" "),
        customer.country,
    ]
        .filter(Boolean)
        .join(", ");
}

function mapCustomer(customer: CustomerRow | null) {
    if (!customer) return null;

    return {
        id: customer.id,
        name: getCustomerName(customer),
        address: getCustomerAddress(customer),
        email: customer.email,
        phone: customer.phone,
    };
}

function getVehicleDocumentStatus(
    documents: VehicleDetailDocument[],
): "complete" | "partial" | "missing" {
    const availableDocuments = documents.filter(
        (document) => document.status === "available",
    );

    if (availableDocuments.length >= 2) {
        return "complete";
    }

    if (availableDocuments.length === 1) {
        return "partial";
    }

    return "missing";
}

async function getCustomersByIds(
    customerIds: Array<string | null>,
): Promise<Map<string, CustomerRow>> {
    const uniqueCustomerIds = Array.from(
        new Set(customerIds.filter((customerId): customerId is string => Boolean(customerId))),
    );

    if (uniqueCustomerIds.length === 0) return new Map();

    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("customers")
        .select(
            `
      id,
      type,
      company_name,
      first_name,
      last_name,
      street,
      postal_code,
      city,
      country,
      email,
      phone
    `,
        )
        .eq("company_id", companyId)
        .in("id", uniqueCustomerIds);

    if (error || !data) return new Map();

    return new Map(((data ?? []) as CustomerRow[]).map((customer) => [customer.id, customer]));
}

export async function getVehicleDetail(
    vehicleId: string,
): Promise<VehicleDetail> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select(
            `
      id,
      company_id,
      internal_number,
      manufacturer,
      model,
      vehicle_type,
      status,
      vin,
      license_plate,
      construction_year,
      first_registration,
      purchase_price_net,
      sale_price_net,
      additional_costs_net,
      notes,
      damage_notes,
      show_damage_on_invoice,
      created_at,
      seller_customer_id,
      buyer_customer_id
    `,
        )
        .eq("id", vehicleId)
        .single();

    if (vehicleError || !vehicleData) {
        throw new Error(
            `Fahrzeug wurde über diese ID nicht gefunden. ID: ${vehicleId} | Fehler: ${
                vehicleError?.message ?? "Kein Datensatz"
            }`,
        );
    }

    const vehicle = vehicleData as VehicleBaseRow;

    if (vehicle.company_id !== companyId) {
        throw new Error(
            `Company-ID passt nicht. Fahrzeug company_id: ${vehicle.company_id} | Aktuelle company_id: ${companyId}`,
        );
    }

    const customersPromise = getCustomersByIds([
        vehicle.seller_customer_id,
        vehicle.buyer_customer_id,
    ]);
    const documentsPromise = supabase
        .from("documents")
        .select(
            `
      id,
      document_type,
      source,
      status,
      file_name,
      file_path,
      mime_type,
      file_size,
      created_at
    `,
        )
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
    const salesPromise = supabase
        .from("sales")
        .select(
            `
      id,
      sale_date,
      net_amount,
      gross_amount,
      status,
      payment_status,
      buyer_customer_id
    `,
        )
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId)
        .order("sale_date", { ascending: false });

    const [
        customerById,
        { data: documentsData, error: documentsError },
        { data: salesData, error: salesError },
    ] = await Promise.all([
        customersPromise,
        documentsPromise,
        salesPromise,
    ]);
    const seller = vehicle.seller_customer_id
        ? customerById.get(vehicle.seller_customer_id) ?? null
        : null;
    const buyer = vehicle.buyer_customer_id
        ? customerById.get(vehicle.buyer_customer_id) ?? null
        : null;

    if (documentsError) {
        throw new Error(
            `Fahrzeugdokumente konnten nicht geladen werden: ${documentsError.message}`,
        );
    }

    const documents = ((documentsData ?? []) as DocumentRow[]).map((document) => ({
        id: document.id,
        document_type: document.document_type,
        source: document.source,
        status: document.status,
        file_name: document.file_name,
        file_path: document.file_path,
        mime_type: document.mime_type,
        file_size: document.file_size,
        created_at: document.created_at,
    }));

    if (salesError) {
        throw new Error(
            `Fahrzeugverkäufe konnten nicht geladen werden: ${salesError.message}`,
        );
    }

    const salesRows = (salesData ?? []) as SaleRow[];
    const saleIds = salesRows.map((sale) => sale.id);
    const buyerCustomerIds = Array.from(
        new Set(salesRows.map((sale) => sale.buyer_customer_id).filter(Boolean)),
    );

    const invoicesPromise =
        saleIds.length > 0
            ? supabase
                  .from("invoices")
                  .select(
                      `
            id,
            sale_id,
            invoice_number,
            invoice_date,
            gross_amount
          `,
                  )
                  .eq("company_id", companyId)
                  .in("sale_id", saleIds)
            : Promise.resolve({ data: [], error: null });
    const saleCustomersPromise =
        buyerCustomerIds.length > 0
            ? supabase
                  .from("customers")
                  .select(
                      `
            id,
            type,
            company_name,
            first_name,
            last_name,
            street,
            postal_code,
            city,
            country,
            email,
            phone
          `,
                  )
                  .eq("company_id", companyId)
                  .in("id", buyerCustomerIds)
            : Promise.resolve({ data: [], error: null });

    const [
        { data: invoicesData, error: invoicesError },
        { data: saleCustomersData, error: saleCustomersError },
    ] = await Promise.all([invoicesPromise, saleCustomersPromise]);

    if (invoicesError) {
        throw new Error(
            `Rechnungen zum Fahrzeug konnten nicht geladen werden: ${invoicesError.message}`,
        );
    }

    if (saleCustomersError) {
        throw new Error(
            `Käufer zum Fahrzeug konnten nicht geladen werden: ${saleCustomersError.message}`,
        );
    }

    const invoices = (invoicesData ?? []) as InvoiceRow[];
    const saleCustomers = (saleCustomersData ?? []) as CustomerRow[];
    const invoiceBySaleId = new Map(
        invoices
            .filter((invoice) => invoice.sale_id)
            .map((invoice) => [invoice.sale_id, invoice]),
    );
    const saleCustomerById = new Map(saleCustomers.map((customer) => [customer.id, customer]));

    const sales: VehicleDetailSale[] = salesRows.map((sale) => {
        const invoice = invoiceBySaleId.get(sale.id) ?? null;
        const customer = sale.buyer_customer_id
            ? saleCustomerById.get(sale.buyer_customer_id) ?? null
            : null;

        return {
            id: sale.id,
            sale_date: sale.sale_date,
            net_amount: Number(sale.net_amount),
            gross_amount: Number(sale.gross_amount),
            status: sale.status,
            payment_status: sale.payment_status,
            customer_name: getCustomerName(customer),
            invoice_id: invoice?.id ?? null,
            invoice_number: invoice?.invoice_number ?? null,
            invoice_date: invoice?.invoice_date ?? null,
        };
    });

    return {
        id: vehicle.id,
        internal_number: vehicle.internal_number,
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        vehicle_type: vehicle.vehicle_type,
        name: `${vehicle.manufacturer} ${vehicle.model}`,
        status: vehicle.status,
        vin: vehicle.vin,
        license_plate: vehicle.license_plate,
        construction_year: vehicle.construction_year,
        first_registration: vehicle.first_registration,
        purchase_price_net: Number(vehicle.purchase_price_net),
        sale_price_net:
            vehicle.sale_price_net === null ? null : Number(vehicle.sale_price_net),
        additional_costs_net: Number(vehicle.additional_costs_net ?? 0),
        document_status: getVehicleDocumentStatus(documents),
        notes: vehicle.notes,
        damage_notes: vehicle.damage_notes,
        show_damage_on_invoice: Boolean(vehicle.show_damage_on_invoice),
        created_at: vehicle.created_at,

        seller: mapCustomer(seller),
        buyer: mapCustomer(buyer),

        documents,
        sales,
    };
}
