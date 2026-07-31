import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LicensePlateType = "export" | "customs" | "short_term";
export type LicensePlateStatus = "open" | "requested" | "completed" | "cancelled";

export type LicensePlateCaseRow = {
    id: string;

    vehicle_id: string | null;
    customer_id: string | null;
    sale_id: string | null;

    plate_type: LicensePlateType;
    duration_days: number | null;
    status: LicensePlateStatus;

    requested_at: string;
    valid_from: string | null;
    valid_until: string | null;

    license_plate_number: string | null;
    registration_office: string | null;
    notes: string | null;

    created_at: string;

    customer_name: string | null;
    vehicle_internal_number: string | null;
    vehicle_name: string | null;
    vin: string | null;
};

type LicensePlateCaseQueryRow = {
    id: string;

    vehicle_id: string | null;
    customer_id: string | null;
    sale_id: string | null;

    plate_type: LicensePlateType;
    duration_days: number | null;
    status: LicensePlateStatus;

    requested_at: string;
    valid_from: string | null;
    valid_until: string | null;

    license_plate_number: string | null;
    registration_office: string | null;
    notes: string | null;

    created_at: string;

    customers: {
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
    } | null;

    vehicles: {
        internal_number: string;
        manufacturer: string;
        model: string;
        vin: string;
    } | null;
};

type LicensePlateCompactQueryRow = {
    id: string;
    plate_type: LicensePlateType;
    status: LicensePlateStatus;
    license_plate_number: string | null;
    valid_until: string | null;
    customers: LicensePlateCaseQueryRow["customers"];
    vehicles: {
        manufacturer: string;
        model: string;
    } | null;
};

type LicensePlateDashboardCountRow = {
    plate_type: LicensePlateType;
    status: LicensePlateStatus;
};

export type LicensePlateCompactRow = {
    id: string;
    plate_type: LicensePlateType;
    status: LicensePlateStatus;
    customer_name: string | null;
    vehicle_name: string | null;
    license_plate_number: string | null;
    valid_until: string | null;
};

export type LicensePlateDashboardSummary = {
    totalCount: number;
    openCount: number;
    requestedCount: number;
    completedCount: number;
    activeCount: number;
    recentCases: LicensePlateCompactRow[];
};

export type OpenLicensePlateCasesSummary = {
    count: number;
    cases: LicensePlateCompactRow[];
};

function getCustomerName(
    customer: LicensePlateCaseQueryRow["customers"],
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

function getVehicleName(
    vehicle: LicensePlateCompactQueryRow["vehicles"],
): string | null {
    if (!vehicle) return null;

    return `${vehicle.manufacturer} ${vehicle.model}`;
}

function mapCompactLicensePlateCase(
    item: LicensePlateCompactQueryRow,
): LicensePlateCompactRow {
    return {
        id: item.id,
        plate_type: item.plate_type,
        status: item.status,
        customer_name: getCustomerName(item.customers),
        vehicle_name: getVehicleName(item.vehicles),
        license_plate_number: item.license_plate_number,
        valid_until: item.valid_until,
    };
}

export async function getLicensePlateCases(): Promise<LicensePlateCaseRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("license_plate_cases")
        .select(
            `
      id,
      vehicle_id,
      customer_id,
      sale_id,
      plate_type,
      duration_days,
      status,
      requested_at,
      valid_from,
      valid_until,
      license_plate_number,
      registration_office,
      notes,
      created_at,
      customers (
        type,
        company_name,
        first_name,
        last_name
      ),
      vehicles (
        internal_number,
        manufacturer,
        model,
        vin
      )
    `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(
            `Kennzeichen-Vorgänge konnten nicht geladen werden: ${error.message}`,
        );
    }

    return ((data ?? []) as unknown as LicensePlateCaseQueryRow[]).map((item) => {
        const vehicle = item.vehicles;

        return {
            id: item.id,

            vehicle_id: item.vehicle_id,
            customer_id: item.customer_id,
            sale_id: item.sale_id,

            plate_type: item.plate_type,
            duration_days: item.duration_days,
            status: item.status,

            requested_at: item.requested_at,
            valid_from: item.valid_from,
            valid_until: item.valid_until,

            license_plate_number: item.license_plate_number,
            registration_office: item.registration_office,
            notes: item.notes,

            created_at: item.created_at,

            customer_name: getCustomerName(item.customers),
            vehicle_internal_number: vehicle?.internal_number ?? null,
            vehicle_name: vehicle
                ? `${vehicle.manufacturer} ${vehicle.model}`
                : null,
            vin: vehicle?.vin ?? null,
        };
    });
}

export async function getLicensePlateDashboardSummary(): Promise<LicensePlateDashboardSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [countsResult, recentResult] = await Promise.all([
        supabase
            .from("license_plate_cases")
            .select("plate_type, status")
            .eq("company_id", companyId),
        supabase
            .from("license_plate_cases")
            .select(
                `
      id,
      plate_type,
      status,
      license_plate_number,
      valid_until,
      customers (
        type,
        company_name,
        first_name,
        last_name
      ),
      vehicles (
        manufacturer,
        model
      )
    `,
            )
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(4),
    ]);

    if (countsResult.error) {
        throw new Error(
            `Kennzeichen-Zähler konnten nicht geladen werden: ${countsResult.error.message}`,
        );
    }

    if (recentResult.error) {
        throw new Error(
            `Aktuelle Kennzeichen-Vorgänge konnten nicht geladen werden: ${recentResult.error.message}`,
        );
    }

    let openCount = 0;
    let requestedCount = 0;
    let completedCount = 0;

    for (const item of (countsResult.data ?? []) as LicensePlateDashboardCountRow[]) {
        if (item.status === "open") {
            openCount += 1;
            continue;
        }

        if (item.status === "requested") {
            requestedCount += 1;
            continue;
        }

        if (item.status === "completed") {
            completedCount += 1;
        }
    }

    return {
        totalCount: countsResult.data?.length ?? 0,
        openCount,
        requestedCount,
        completedCount,
        activeCount: openCount + requestedCount,
        recentCases: ((recentResult.data ?? []) as unknown as LicensePlateCompactQueryRow[])
            .map(mapCompactLicensePlateCase),
    };
}

export async function getOpenLicensePlateCasesSummary(): Promise<OpenLicensePlateCasesSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [countResult, casesResult] = await Promise.all([
        supabase
            .from("license_plate_cases")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .in("status", ["open", "requested"]),
        supabase
            .from("license_plate_cases")
            .select(
                `
      id,
      plate_type,
      status,
      license_plate_number,
      valid_until,
      customers (
        type,
        company_name,
        first_name,
        last_name
      ),
      vehicles (
        manufacturer,
        model
      )
    `,
            )
            .eq("company_id", companyId)
            .in("status", ["open", "requested"])
            .order("created_at", { ascending: false })
            .limit(8),
    ]);

    if (countResult.error) {
        throw new Error(
            `Offene Kennzeichen-Zähler konnten nicht geladen werden: ${countResult.error.message}`,
        );
    }

    if (casesResult.error) {
        throw new Error(
            `Offene Kennzeichen-Vorgänge konnten nicht geladen werden: ${casesResult.error.message}`,
        );
    }

    return {
        count: countResult.count ?? 0,
        cases: ((casesResult.data ?? []) as unknown as LicensePlateCompactQueryRow[])
            .map(mapCompactLicensePlateCase),
    };
}
