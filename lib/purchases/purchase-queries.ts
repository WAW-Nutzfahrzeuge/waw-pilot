import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PurchaseCaseStatus = "draft" | "active" | "completed" | "cancelled";
export type PurchaseCasePaymentStatus = "open" | "partial" | "paid";
export type PurchaseCaseDocumentStatus = "complete" | "missing" | "needs_review";

export type PurchaseCaseRow = {
    id: string;

    vehicle_id: string | null;
    seller_customer_id: string | null;

    purchase_number: string | null;
    purchase_date: string;

    net_amount: number;
    vat_rate: number;
    vat_amount: number;
    gross_amount: number;

    status: PurchaseCaseStatus;
    payment_status: PurchaseCasePaymentStatus;
    document_check_status: PurchaseCaseDocumentStatus;

    notes: string | null;
    created_at: string;

    seller_name: string | null;
    vehicle_internal_number: string | null;
    vehicle_name: string | null;
    vin: string | null;
};

type PurchaseCaseQueryRow = {
    id: string;

    vehicle_id: string | null;
    seller_customer_id: string | null;

    purchase_number: string | null;
    purchase_date: string;

    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;

    status: PurchaseCaseStatus;
    payment_status: PurchaseCasePaymentStatus;
    document_check_status: PurchaseCaseDocumentStatus;

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

type PurchaseDashboardSummaryRow = {
    status: PurchaseCaseStatus;
    payment_status: PurchaseCasePaymentStatus;
    document_check_status: PurchaseCaseDocumentStatus;
};

export type PurchaseDashboardSummary = {
    purchaseCasesCount: number;
    openPurchasePaymentsCount: number;
    incompletePurchaseDocumentsCount: number;
    completedPurchaseCasesCount: number;
};

export type PurchaseCasesToCheckSummary = {
    count: number;
    purchaseCases: {
        id: string;
        purchase_number: string | null;
        seller_name: string | null;
        vehicle_name: string | null;
        purchase_date: string;
        document_check_status: PurchaseCaseDocumentStatus;
    }[];
};

function getCustomerName(customer: PurchaseCaseQueryRow["customers"]): string | null {
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

export async function getPurchaseCases(): Promise<PurchaseCaseRow[]> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("purchase_cases")
        .select(
            `
      id,
      vehicle_id,
      seller_customer_id,
      purchase_number,
      purchase_date,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      status,
      payment_status,
      document_check_status,
      notes,
      created_at,
      customers:seller_customer_id (
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
        throw new Error(`Ankaufsakten konnten nicht geladen werden: ${error.message}`);
    }

    return ((data ?? []) as unknown as PurchaseCaseQueryRow[]).map((purchase) => {
        const vehicle = purchase.vehicles;

        return {
            id: purchase.id,

            vehicle_id: purchase.vehicle_id,
            seller_customer_id: purchase.seller_customer_id,

            purchase_number: purchase.purchase_number,
            purchase_date: purchase.purchase_date,

            net_amount: Number(purchase.net_amount),
            vat_rate: Number(purchase.vat_rate),
            vat_amount: Number(purchase.vat_amount),
            gross_amount: Number(purchase.gross_amount),

            status: purchase.status,
            payment_status: purchase.payment_status,
            document_check_status: purchase.document_check_status,

            notes: purchase.notes,
            created_at: purchase.created_at,

            seller_name: getCustomerName(purchase.customers),
            vehicle_internal_number: vehicle?.internal_number ?? null,
            vehicle_name: vehicle
                ? `${vehicle.manufacturer} ${vehicle.model}`
                : null,
            vin: vehicle?.vin ?? null,
        };
    });
}

export async function getPurchaseDashboardSummary(): Promise<PurchaseDashboardSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("purchase_cases")
        .select("status, payment_status, document_check_status")
        .eq("company_id", companyId);

    if (error) {
        throw new Error(`Ankaufs-Zusammenfassung konnte nicht geladen werden: ${error.message}`);
    }

    let openPurchasePaymentsCount = 0;
    let incompletePurchaseDocumentsCount = 0;
    let completedPurchaseCasesCount = 0;

    for (const purchase of (data ?? []) as PurchaseDashboardSummaryRow[]) {
        if (purchase.payment_status !== "paid") {
            openPurchasePaymentsCount += 1;
        }

        if (purchase.document_check_status !== "complete") {
            incompletePurchaseDocumentsCount += 1;
        }

        if (purchase.status === "completed") {
            completedPurchaseCasesCount += 1;
        }
    }

    return {
        purchaseCasesCount: data?.length ?? 0,
        openPurchasePaymentsCount,
        incompletePurchaseDocumentsCount,
        completedPurchaseCasesCount,
    };
}

export async function getPurchaseCasesToCheckSummary(): Promise<PurchaseCasesToCheckSummary> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const [countResult, casesResult] = await Promise.all([
        supabase
            .from("purchase_cases")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .neq("document_check_status", "complete"),
        supabase
            .from("purchase_cases")
            .select(
                `
      id,
      purchase_number,
      purchase_date,
      document_check_status,
      customers:seller_customer_id (
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
            .neq("document_check_status", "complete")
            .order("created_at", { ascending: false })
            .limit(8),
    ]);

    if (countResult.error) {
        throw new Error(`Prüfungsrelevante Ankaufs-Zähler konnten nicht geladen werden: ${countResult.error.message}`);
    }

    if (casesResult.error) {
        throw new Error(`Prüfungsrelevante Ankäufe konnten nicht geladen werden: ${casesResult.error.message}`);
    }

    return {
        count: countResult.count ?? 0,
        purchaseCases: ((casesResult.data ?? []) as unknown as PurchaseCaseQueryRow[])
            .map((purchase) => ({
                id: purchase.id,
                purchase_number: purchase.purchase_number,
                seller_name: getCustomerName(purchase.customers),
                vehicle_name: purchase.vehicles
                    ? `${purchase.vehicles.manufacturer} ${purchase.vehicles.model}`
                    : null,
                purchase_date: purchase.purchase_date,
                document_check_status: purchase.document_check_status,
            })),
    };
}
