import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company";
import { calculateInventoryValueNet } from "@/lib/vehicles/inventory-domain";

export type VehicleStatus = "in_stock" | "reserved" | "sold";
export type VehicleDocumentStatus = "complete" | "partial" | "missing";

export type VehicleRow = {
    id: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    vehicle_type: string;
    construction_year: number | null;
    first_registration: string | null;
    vin: string;
    license_plate: string | null;
    purchase_price_net: number;
    sale_price_net: number | null;
    additional_costs_net: number;
    status: VehicleStatus;
    notes: string | null;
    damage_notes: string | null;
    show_damage_on_invoice: boolean | null;
    created_at: string;
    seller_name: string | null;
    buyer_name: string | null;
    document_status: VehicleDocumentStatus;
};

export type VehicleDashboardSummary = {
    vehiclesCount: number;
    currentVehiclesCount: number;
    soldVehiclesCount: number;
    inventoryValueNet: number;
    vehiclesWithOpenDocumentsCount: number;
    recentVehicles: {
        id: string;
        internalNumber: string;
        name: string;
        status: VehicleStatus;
        createdAt: string;
    }[];
};

export type VehicleReportSummary = {
    vehiclesCount: number;
    currentVehiclesCount: number;
    soldVehiclesCount: number;
    inventoryValueNet: number;
};

type VehicleDocumentRow = {
    vehicle_id: string | null;
    status: "available" | "missing" | "needs_review";
};

type VehicleDashboardRow = {
    id: string;
    status: VehicleStatus;
    purchase_price_net: number | string;
};

type RecentVehicleDashboardRow = {
    id: string;
    internal_number: string;
    manufacturer: string;
    model: string;
    status: VehicleStatus;
    created_at: string;
};

type VehicleReportRow = {
    status: VehicleStatus;
    purchase_price_net: number | string;
};

type VehicleCustomerRelationRow = {
    vehicle_id: string | null;
    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;
};

type CustomerNameRow = {
    id: string;
    type: "company" | "private";
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
};

function getVehicleDocumentStatus(availableDocumentCount: number): VehicleDocumentStatus {
    if (availableDocumentCount >= 2) return "complete";
    if (availableDocumentCount === 1) return "partial";

    return "missing";
}

function getVehicleCustomerName(
    customer: VehicleCustomerRelationRow["customers"],
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

export async function getVehicles(): Promise<VehicleRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("vehicles")
        .select(
            `
      id,
      internal_number,
      manufacturer,
      model,
      vehicle_type,
      construction_year,
      first_registration,
      vin,
      license_plate,
      purchase_price_net,
      sale_price_net,
      additional_costs_net,
      status,
      notes,
      damage_notes,
      show_damage_on_invoice,
      created_at,
      seller_customer_id
    `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Fahrzeuge konnten nicht geladen werden: ${error.message}`);
    }

    const vehicles = data ?? [];
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const sellerCustomerIds = Array.from(
        new Set(
            vehicles
                .map((vehicle) => vehicle.seller_customer_id)
                .filter((customerId): customerId is string => Boolean(customerId)),
        ),
    );
    const availableDocumentsByVehicleId = new Map<string, number>();
    const sellersByCustomerId = new Map<string, string | null>();
    const buyersByVehicleId = new Map<string, string | null>();

    if (vehicleIds.length > 0) {
        const [
            { data: documentsData, error: documentsError },
            { data: sellerCustomersData, error: sellerCustomersError },
            { data: salesData, error: salesError },
        ] = await Promise.all([
            supabase
                .from("documents")
                .select("vehicle_id, status")
                .eq("company_id", companyId)
                .in("vehicle_id", vehicleIds),
            sellerCustomerIds.length > 0
                ? supabase
                      .from("customers")
                      .select("id, type, company_name, first_name, last_name")
                      .eq("company_id", companyId)
                      .in("id", sellerCustomerIds)
                : Promise.resolve({ data: [], error: null }),
            supabase
                .from("sales")
                .select(
                    `
                    vehicle_id,
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
                .order("sale_date", { ascending: false }),
        ]);

        if (documentsError) {
            throw new Error(
                `Fahrzeugdokumente konnten nicht geladen werden: ${documentsError.message}`,
            );
        }

        if (sellerCustomersError) {
            throw new Error(
                `Verkäufer konnten nicht geladen werden: ${sellerCustomersError.message}`,
            );
        }

        if (salesError) {
            throw new Error(
                `Verkaufsbeziehungen konnten nicht geladen werden: ${salesError.message}`,
            );
        }

        for (const document of (documentsData ?? []) as VehicleDocumentRow[]) {
            if (!document.vehicle_id || document.status !== "available") continue;

            availableDocumentsByVehicleId.set(
                document.vehicle_id,
                (availableDocumentsByVehicleId.get(document.vehicle_id) ?? 0) + 1,
            );
        }

        for (const customer of (sellerCustomersData ?? []) as CustomerNameRow[]) {
            sellersByCustomerId.set(customer.id, getVehicleCustomerName(customer));
        }

        for (const sale of (salesData ?? []) as unknown as VehicleCustomerRelationRow[]) {
            if (!sale.vehicle_id || buyersByVehicleId.has(sale.vehicle_id)) continue;

            buyersByVehicleId.set(
                sale.vehicle_id,
                getVehicleCustomerName(sale.customers),
            );
        }
    }

    return vehicles.map((vehicle) => {
        const { seller_customer_id: sellerCustomerId, ...vehicleFields } = vehicle;

        return {
            ...vehicleFields,
            seller_name: sellerCustomerId
                ? sellersByCustomerId.get(sellerCustomerId) ?? null
                : null,
            buyer_name: buyersByVehicleId.get(vehicle.id) ?? null,
            document_status: getVehicleDocumentStatus(
                availableDocumentsByVehicleId.get(vehicle.id) ?? 0,
            ),
        };
    });
}

export async function getVehicleDashboardSummary(): Promise<VehicleDashboardSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [vehiclesResult, recentVehiclesResult] = await Promise.all([
        supabase
            .from("vehicles")
            .select("id, status, purchase_price_net")
            .eq("company_id", companyId),
        supabase
            .from("vehicles")
            .select("id, internal_number, manufacturer, model, status, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(4),
    ]);

    if (vehiclesResult.error) {
        throw new Error(`Fahrzeug-Zusammenfassung konnte nicht geladen werden: ${vehiclesResult.error.message}`);
    }

    if (recentVehiclesResult.error) {
        throw new Error(`Aktuelle Fahrzeuge konnten nicht geladen werden: ${recentVehiclesResult.error.message}`);
    }

    const vehicles = (vehiclesResult.data ?? []) as VehicleDashboardRow[];
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const availableDocumentsByVehicleId = new Map<string, number>();

    if (vehicleIds.length > 0) {
        const { data: documentsData, error: documentsError } = await supabase
            .from("documents")
            .select("vehicle_id, status")
            .eq("company_id", companyId)
            .in("vehicle_id", vehicleIds);

        if (documentsError) {
            throw new Error(
                `Fahrzeugdokumente konnten nicht geladen werden: ${documentsError.message}`,
            );
        }

        for (const document of (documentsData ?? []) as VehicleDocumentRow[]) {
            if (!document.vehicle_id || document.status !== "available") continue;

            availableDocumentsByVehicleId.set(
                document.vehicle_id,
                (availableDocumentsByVehicleId.get(document.vehicle_id) ?? 0) + 1,
            );
        }
    }

    let currentVehiclesCount = 0;
    let soldVehiclesCount = 0;
    let vehiclesWithOpenDocumentsCount = 0;
    const inventoryValueNet = calculateInventoryValueNet(
        vehicles.map((vehicle) => ({
            status: vehicle.status,
            purchaseNetAmount: Number(vehicle.purchase_price_net ?? 0),
        })),
    );

    for (const vehicle of vehicles) {
        if (vehicle.status === "in_stock" || vehicle.status === "reserved") {
            currentVehiclesCount += 1;
        }

        if (vehicle.status === "sold") {
            soldVehiclesCount += 1;
        }

        const documentStatus = getVehicleDocumentStatus(
            availableDocumentsByVehicleId.get(vehicle.id) ?? 0,
        );

        if (documentStatus !== "complete") {
            vehiclesWithOpenDocumentsCount += 1;
        }
    }

    return {
        vehiclesCount: vehicles.length,
        currentVehiclesCount,
        soldVehiclesCount,
        inventoryValueNet,
        vehiclesWithOpenDocumentsCount,
        recentVehicles: (
            (recentVehiclesResult.data ?? []) as RecentVehicleDashboardRow[]
        ).map((vehicle) => ({
            id: vehicle.id,
            internalNumber: vehicle.internal_number,
            name: `${vehicle.manufacturer} ${vehicle.model}`,
            status: vehicle.status,
            createdAt: vehicle.created_at,
        })),
    };
}

export async function getVehicleReportSummary(): Promise<VehicleReportSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("vehicles")
        .select("status, purchase_price_net")
        .eq("company_id", companyId);

    if (error) {
        throw new Error(`Fahrzeug-Auswertung konnte nicht geladen werden: ${error.message}`);
    }

    let currentVehiclesCount = 0;
    let soldVehiclesCount = 0;
    const vehicles = (data ?? []) as VehicleReportRow[];
    const inventoryValueNet = calculateInventoryValueNet(
        vehicles.map((vehicle) => ({
            status: vehicle.status,
            purchaseNetAmount: Number(vehicle.purchase_price_net ?? 0),
        })),
    );

    for (const vehicle of vehicles) {
        const isCurrent =
            vehicle.status === "in_stock" || vehicle.status === "reserved";

        if (isCurrent) {
            currentVehiclesCount += 1;
        }

        if (vehicle.status === "sold") {
            soldVehiclesCount += 1;
        }
    }

    return {
        vehiclesCount: data?.length ?? 0,
        currentVehiclesCount,
        soldVehiclesCount,
        inventoryValueNet,
    };
}

export async function getSellableVehicles(): Promise<VehicleRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("vehicles")
        .select(
            `
      id,
      internal_number,
      manufacturer,
      model,
      vehicle_type,
      construction_year,
      first_registration,
      vin,
      license_plate,
      purchase_price_net,
      sale_price_net,
      additional_costs_net,
      status,
      notes,
      damage_notes,
      show_damage_on_invoice,
      created_at,
      seller_customer_id
    `,
        )
        .eq("company_id", companyId)
        .in("status", ["in_stock", "reserved"])
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Verfügbare Fahrzeuge konnten nicht geladen werden: ${error.message}`);
    }

    const vehicles = data ?? [];
    const sellerCustomerIds = Array.from(
        new Set(
            vehicles
                .map((vehicle) => vehicle.seller_customer_id)
                .filter((customerId): customerId is string => Boolean(customerId)),
        ),
    );
    const sellersByCustomerId = new Map<string, string | null>();

    if (sellerCustomerIds.length > 0) {
        const { data: sellerCustomersData, error: sellerCustomersError } = await supabase
            .from("customers")
            .select("id, type, company_name, first_name, last_name")
            .eq("company_id", companyId)
            .in("id", sellerCustomerIds);

        if (sellerCustomersError) {
            throw new Error(
                `Verkäufer konnten nicht geladen werden: ${sellerCustomersError.message}`,
            );
        }

        for (const customer of (sellerCustomersData ?? []) as CustomerNameRow[]) {
            sellersByCustomerId.set(customer.id, getVehicleCustomerName(customer));
        }
    }

    return vehicles.map((vehicle) => {
        const { seller_customer_id: sellerCustomerId, ...vehicleFields } = vehicle;

        return {
            ...vehicleFields,
            seller_name: sellerCustomerId
                ? sellersByCustomerId.get(sellerCustomerId) ?? null
                : null,
            buyer_name: null,
            document_status: "missing",
        };
    });
}
