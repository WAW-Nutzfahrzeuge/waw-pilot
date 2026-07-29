import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type InventoryListRow = {
    vehicleId: string;

    stockNumber: string;
    vehicleLabel: string;
    vin: string;
    vinLastSix: string;
    licensePlate: string | null;

    stockStartDate: string | null;
    stockEndDate: string | null;

    purchaseNumber: string | null;
    purchaseDate: string | null;
    sellerName: string | null;
    purchaseNetAmount: number;

    additionalCostsNet: number;

    saleId: string | null;
    saleNumber: string | null;
    saleDate: string | null;
    buyerName: string | null;
    saleNetAmount: number | null;

    invoiceNumber: string | null;

    rawProfitNet: number | null;

    status: "in_stock" | "reserved" | "sold";
};

type VehicleQueryRow = {
    id: string;
    internal_number: string | null;
    manufacturer: string | null;
    model: string | null;
    vehicle_type: string | null;
    construction_year: number | null;
    vin: string | null;
    license_plate: string | null;
    purchase_price_net: number | string | null;
    additional_costs_net: number | string | null;
    status: "in_stock" | "reserved" | "sold";
    created_at: string;
};

type PurchaseQueryRow = {
    vehicle_id: string | null;
    purchase_number: string | null;
    purchase_date: string | null;
    net_amount: number | string | null;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
};

type SaleQueryRow = {
    id: string;
    vehicle_id: string | null;
    sale_number: string | null;
    sale_date: string | null;
    net_amount: number | string | null;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
};

type InvoiceQueryRow = {
    sale_id: string | null;
    invoice_number: string | null;
    invoice_type: string | null;
    created_at: string;
};

function toNumber(value: number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : 0;
}

function getCustomerName(
    customer:
        | {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    }
        | null
        | undefined,
): string | null {
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

function getVehicleLabel(vehicle: VehicleQueryRow): string {
    const mainLabel = [vehicle.manufacturer, vehicle.model]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (mainLabel.length > 0) return mainLabel;

    return vehicle.vehicle_type ?? "Unbekanntes Fahrzeug";
}

function getStockNumber(vehicle: VehicleQueryRow, index: number): string {
    return `E-${index + 1}`;
}

function getInvoicePriority(invoiceType: string | null): number {
    if (invoiceType === "standard") return 1;
    if (invoiceType === "down_payment") return 2;
    if (invoiceType === "proforma") return 3;

    return 99;
}

function getVehicleCreatedDate(vehicle: VehicleQueryRow): string | null {
    if (!vehicle.created_at) return null;

    return vehicle.created_at.slice(0, 10);
}

export async function getInventoryListRows(): Promise<InventoryListRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data: vehiclesData, error: vehiclesError } = await supabase
        .from("vehicles")
        .select(
            `
            id,
            internal_number,
            manufacturer,
            model,
            vehicle_type,
            construction_year,
            vin,
            license_plate,
            purchase_price_net,
            additional_costs_net,
            status,
            created_at
        `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

    if (vehiclesError) {
        throw new Error(
            `Bestandsliste konnte nicht geladen werden: ${vehiclesError.message}`,
        );
    }

    const vehicles = (vehiclesData ?? []) as VehicleQueryRow[];
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);

    if (vehicleIds.length === 0) {
        return [];
    }

    const { data: purchasesData, error: purchasesError } = await supabase
        .from("purchase_cases")
        .select(
            `
            vehicle_id,
            purchase_number,
            purchase_date,
            net_amount,
            customers:seller_customer_id (
                type,
                company_name,
                first_name,
                last_name
            )
        `,
        )
        .eq("company_id", companyId)
        .in("vehicle_id", vehicleIds)
        .order("purchase_date", { ascending: false });

    if (purchasesError) {
        throw new Error(
            `Ankaufsdaten für Bestandsliste konnten nicht geladen werden: ${purchasesError.message}`,
        );
    }

    const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select(
            `
            id,
            vehicle_id,
            sale_number,
            sale_date,
            net_amount,
            customers:buyer_customer_id (
                type,
                company_name,
                first_name,
                last_name
            )
        `,
        )
        .eq("company_id", companyId)
        .in("vehicle_id", vehicleIds)
        .neq("status", "cancelled")
        .order("sale_date", { ascending: false });

    if (salesError) {
        throw new Error(
            `Verkaufsdaten für Bestandsliste konnten nicht geladen werden: ${salesError.message}`,
        );
    }

    const sales = (salesData ?? []) as unknown as SaleQueryRow[];
    const saleIds = sales.map((sale) => sale.id);

    const invoicesBySaleId = new Map<string, InvoiceQueryRow>();

    if (saleIds.length > 0) {
        const { data: invoicesData, error: invoicesError } = await supabase
            .from("invoices")
            .select("sale_id, invoice_number, invoice_type, created_at")
            .eq("company_id", companyId)
            .in("sale_id", saleIds)
            .order("created_at", { ascending: true });

        if (invoicesError) {
            throw new Error(
                `Rechnungsdaten für Bestandsliste konnten nicht geladen werden: ${invoicesError.message}`,
            );
        }

        const sortedInvoices = ((invoicesData ?? []) as InvoiceQueryRow[]).sort(
            (a, b) => {
                const priorityDifference =
                    getInvoicePriority(a.invoice_type) -
                    getInvoicePriority(b.invoice_type);

                if (priorityDifference !== 0) return priorityDifference;

                return a.created_at.localeCompare(b.created_at);
            },
        );

        for (const invoice of sortedInvoices) {
            if (!invoice.sale_id) continue;

            if (!invoicesBySaleId.has(invoice.sale_id)) {
                invoicesBySaleId.set(invoice.sale_id, invoice);
            }
        }
    }

    const purchasesByVehicleId = new Map<string, PurchaseQueryRow>();
    const salesByVehicleId = new Map<string, SaleQueryRow>();

    for (const purchase of (purchasesData ?? []) as unknown as PurchaseQueryRow[]) {
        if (!purchase.vehicle_id) continue;

        if (!purchasesByVehicleId.has(purchase.vehicle_id)) {
            purchasesByVehicleId.set(purchase.vehicle_id, purchase);
        }
    }

    for (const sale of sales) {
        if (!sale.vehicle_id) continue;

        if (!salesByVehicleId.has(sale.vehicle_id)) {
            salesByVehicleId.set(sale.vehicle_id, sale);
        }
    }

    return vehicles.map((vehicle, index) => {
        const purchase = purchasesByVehicleId.get(vehicle.id) ?? null;
        const sale = salesByVehicleId.get(vehicle.id) ?? null;
        const invoice = sale ? invoicesBySaleId.get(sale.id) ?? null : null;

        const purchaseNetAmount =
            purchase?.net_amount !== null && purchase?.net_amount !== undefined
                ? toNumber(purchase.net_amount)
                : toNumber(vehicle.purchase_price_net);

        const additionalCostsNet = toNumber(vehicle.additional_costs_net);

        const saleNetAmount =
            sale?.net_amount !== null && sale?.net_amount !== undefined
                ? toNumber(sale.net_amount)
                : null;

        const rawProfitNet =
            saleNetAmount !== null
                ? saleNetAmount - purchaseNetAmount - additionalCostsNet
                : null;

        const vin = vehicle.vin ?? "—";
        const purchaseDate = purchase?.purchase_date ?? null;
        const saleDate = sale?.sale_date ?? null;

        return {
            vehicleId: vehicle.id,

            stockNumber: getStockNumber(vehicle, index),
            vehicleLabel: getVehicleLabel(vehicle),
            vin,
            vinLastSix: vin === "—" ? "" : vin.slice(-6),
            licensePlate: vehicle.license_plate,

            stockStartDate: purchaseDate ?? getVehicleCreatedDate(vehicle),
            stockEndDate: saleDate,

            purchaseNumber: purchase?.purchase_number ?? null,
            purchaseDate,
            sellerName: getCustomerName(purchase?.customers),
            purchaseNetAmount,

            additionalCostsNet,

            saleId: sale?.id ?? null,
            saleNumber: sale?.sale_number ?? null,
            saleDate,
            buyerName: getCustomerName(sale?.customers),
            saleNetAmount,

            invoiceNumber: invoice?.invoice_number ?? null,

            rawProfitNet,

            status: vehicle.status,
        };
    });
}
