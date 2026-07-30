import { getCurrentCompanyId } from "@/lib/company";
import type { PaymentStatus, SaleStatus } from "@/lib/sales/sale-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CustomerBaseRow = {
    id: string;
    company_id: string;
    type: "company" | "private";
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    email: string | null;
    preferred_language: string;
    phone: string | null;
    tax_number: string | null;
    vat_id: string | null;
    created_at: string;
};

type VehicleRow = {
    id: string;
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
    seller_customer_id: string | null;
    buyer_customer_id: string | null;
    created_at: string;
};

type SaleRow = {
    id: string;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    net_amount: number | string;
    gross_amount: number | string;
    status: SaleStatus;
    payment_status: PaymentStatus;
};

type InvoiceRow = {
    id: string;
    sale_id: string | null;
    customer_id: string;
    vehicle_id: string | null;
    invoice_number: string;
    invoice_date: string;
    net_amount: number | string;
    gross_amount: number | string;
    payment_status: PaymentStatus;
    pdf_document_id: string | null;
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

export type CustomerDetailVehicle = {
    id: string;
    internal_number: string;
    name: string;
    vehicle_type: string;
    status: string;
    vin: string;
    license_plate: string | null;
    construction_year: number | null;
    first_registration: string | null;
    purchase_price_net: number;
    sale_price_net: number | null;
    additional_costs_net: number;
    role: "seller" | "buyer";
};

export type CustomerDetailSale = {
    id: string;
    vehicle_id: string;
    vehicle_name: string;
    vehicle_internal_number: string;
    sale_date: string;
    net_amount: number;
    gross_amount: number;
    status: SaleStatus;
    payment_status: PaymentStatus;
    invoice_id: string | null;
    invoice_number: string | null;
};

export type CustomerDetailInvoice = {
    id: string;
    sale_id: string | null;
    vehicle_id: string | null;
    invoice_number: string;
    invoice_date: string;
    net_amount: number;
    gross_amount: number;
    payment_status: PaymentStatus;
    pdf_document_id: string | null;
};

export type CustomerDetailDocument = {
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

export type CustomerDetail = {
    id: string;
    type: "company" | "private";
    name: string;
    street: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
    address: string;
    email: string | null;
    preferred_language: string;
    phone: string | null;
    tax_number: string | null;
    vat_id: string | null;
    created_at: string;

    vehicles: CustomerDetailVehicle[];
    sales: CustomerDetailSale[];
    invoices: CustomerDetailInvoice[];
    documents: CustomerDetailDocument[];

    total_revenue_gross: number;
    total_revenue_net: number;
};

function getCustomerName(customer: CustomerBaseRow): string {
    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

function getCustomerAddress(customer: CustomerBaseRow): string {
    return [
        customer.street,
        [customer.postal_code, customer.city].filter(Boolean).join(" "),
        customer.country,
    ]
        .filter(Boolean)
        .join(", ");
}

function getVehicleName(vehicle: VehicleRow | null): string {
    if (!vehicle) return "Unbekanntes Fahrzeug";

    return `${vehicle.manufacturer} ${vehicle.model}`;
}

export async function getCustomerDetail(
    customerId: string,
): Promise<CustomerDetail> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select(
            `
      id,
      company_id,
      type,
      company_name,
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
      created_at
    `,
        )
        .eq("id", customerId)
        .single();

    if (customerError || !customerData) {
        throw new Error(
            `Kunde wurde über diese ID nicht gefunden. ID: ${customerId} | Fehler: ${
                customerError?.message ?? "Kein Datensatz"
            }`,
        );
    }

    const customer = customerData as CustomerBaseRow;

    if (customer.company_id !== companyId) {
        throw new Error(
            `Company-ID passt nicht. Kunde company_id: ${customer.company_id} | Aktuelle company_id: ${companyId}`,
        );
    }

    const vehiclesPromise = supabase
        .from("vehicles")
        .select(
            `
      id,
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
      seller_customer_id,
      buyer_customer_id,
      created_at
    `,
        )
        .eq("company_id", companyId)
        .or(`seller_customer_id.eq.${customerId},buyer_customer_id.eq.${customerId}`)
        .order("created_at", { ascending: false });
    const salesPromise = supabase
        .from("sales")
        .select(
            `
      id,
      vehicle_id,
      buyer_customer_id,
      sale_date,
      net_amount,
      gross_amount,
      status,
      payment_status
    `,
        )
        .eq("company_id", companyId)
        .eq("buyer_customer_id", customerId)
        .order("sale_date", { ascending: false });
    const invoicesPromise = supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      customer_id,
      vehicle_id,
      invoice_number,
      invoice_date,
      net_amount,
      gross_amount,
      payment_status,
      pdf_document_id
    `,
        )
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .order("invoice_date", { ascending: false });
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
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

    const [
        { data: vehiclesData, error: vehiclesError },
        { data: salesData, error: salesError },
        { data: invoicesData, error: invoicesError },
        { data: documentsData, error: documentsError },
    ] = await Promise.all([
        vehiclesPromise,
        salesPromise,
        invoicesPromise,
        documentsPromise,
    ]);

    if (vehiclesError) {
        throw new Error(`Kundenfahrzeuge konnten nicht geladen werden: ${vehiclesError.message}`);
    }

    if (salesError) {
        throw new Error(`Kundenverkäufe konnten nicht geladen werden: ${salesError.message}`);
    }

    if (invoicesError) {
        throw new Error(`Kundenrechnungen konnten nicht geladen werden: ${invoicesError.message}`);
    }

    if (documentsError) {
        throw new Error(`Kundendokumente konnten nicht geladen werden: ${documentsError.message}`);
    }

    const vehiclesRows = (vehiclesData ?? []) as VehicleRow[];
    const vehicleById = new Map(vehiclesRows.map((vehicle) => [vehicle.id, vehicle]));

    const vehicles: CustomerDetailVehicle[] = vehiclesRows.map((vehicle) => ({
        id: vehicle.id,
        internal_number: vehicle.internal_number,
        name: getVehicleName(vehicle),
        vehicle_type: vehicle.vehicle_type,
        status: vehicle.status,
        vin: vehicle.vin,
        license_plate: vehicle.license_plate,
        construction_year: vehicle.construction_year,
        first_registration: vehicle.first_registration,
        purchase_price_net: Number(vehicle.purchase_price_net),
        sale_price_net:
            vehicle.sale_price_net === null ? null : Number(vehicle.sale_price_net),
        additional_costs_net: Number(vehicle.additional_costs_net ?? 0),
        role:
            vehicle.seller_customer_id === customerId
                ? "seller"
                : "buyer",
    }));

    const salesRows = (salesData ?? []) as SaleRow[];
    const missingSaleVehicleIds = Array.from(
        new Set(
            salesRows
                .map((sale) => sale.vehicle_id)
                .filter((vehicleId): vehicleId is string =>
                    Boolean(vehicleId) && !vehicleById.has(vehicleId),
                ),
        ),
    );

    const { data: saleVehiclesData, error: saleVehiclesError } =
        missingSaleVehicleIds.length > 0
            ? await supabase
                .from("vehicles")
                .select(
                    `
            id,
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
            seller_customer_id,
            buyer_customer_id,
            created_at
          `,
                )
                .eq("company_id", companyId)
                .in("id", missingSaleVehicleIds)
            : { data: [], error: null };

    if (saleVehiclesError) {
        throw new Error(
            `Fahrzeuge zu Kundenverkäufen konnten nicht geladen werden: ${saleVehiclesError.message}`,
        );
    }

    const saleVehicles = (saleVehiclesData ?? []) as VehicleRow[];
    for (const vehicle of saleVehicles) {
        vehicleById.set(vehicle.id, vehicle);
    }

    const invoicesRows = (invoicesData ?? []) as InvoiceRow[];
    const invoiceBySaleId = new Map(
        invoicesRows
            .filter((invoice) => invoice.sale_id)
            .map((invoice) => [invoice.sale_id, invoice]),
    );

    const sales: CustomerDetailSale[] = salesRows.map((sale) => {
        const vehicle = sale.vehicle_id
            ? vehicleById.get(sale.vehicle_id) ?? null
            : null;
        const invoice = invoiceBySaleId.get(sale.id) ?? null;

        return {
            id: sale.id,
            vehicle_id: sale.vehicle_id,
            vehicle_name: getVehicleName(vehicle),
            vehicle_internal_number: vehicle?.internal_number ?? "—",
            sale_date: sale.sale_date,
            net_amount: Number(sale.net_amount),
            gross_amount: Number(sale.gross_amount),
            status: sale.status,
            payment_status: sale.payment_status,
            invoice_id: invoice?.id ?? null,
            invoice_number: invoice?.invoice_number ?? null,
        };
    });

    const invoices = invoicesRows.map((invoice) => ({
        id: invoice.id,
        sale_id: invoice.sale_id,
        vehicle_id: invoice.vehicle_id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        net_amount: Number(invoice.net_amount),
        gross_amount: Number(invoice.gross_amount),
        payment_status: invoice.payment_status,
        pdf_document_id: invoice.pdf_document_id,
    }));

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

    const totalRevenueGross = invoices.reduce(
        (sum, invoice) => sum + invoice.gross_amount,
        0,
    );

    const totalRevenueNet = invoices.reduce(
        (sum, invoice) => sum + invoice.net_amount,
        0,
    );

    return {
        id: customer.id,
        type: customer.type,
        name: getCustomerName(customer),
        street: customer.street,
        postal_code: customer.postal_code,
        city: customer.city,
        country: customer.country,
        address: getCustomerAddress(customer),
        email: customer.email,
        preferred_language: customer.preferred_language,
        phone: customer.phone,
        tax_number: customer.tax_number,
        vat_id: customer.vat_id,
        created_at: customer.created_at,

        vehicles,
        sales,
        invoices,
        documents,

        total_revenue_gross: totalRevenueGross,
        total_revenue_net: totalRevenueNet,
    };
}
