import { notFound } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import type {
    PurchaseCaseDocumentStatus,
    PurchaseCasePaymentStatus,
    PurchaseCaseStatus,
} from "@/lib/purchases/purchase-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseRelation<T> = T | T[] | null;

type PurchaseCaseDetailQueryRow = {
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

    customers: SupabaseRelation<{
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
        preferred_language: string | null;
        phone: string | null;
        tax_number: string | null;
        vat_id: string | null;
    }>;

    vehicles: SupabaseRelation<{
        id: string;
        internal_number: string;
        manufacturer: string;
        model: string;
        vehicle_type: string;
        vin: string;
        license_plate: string | null;
        construction_year: number | null;
        first_registration: string | null;
        purchase_price_net: number | string;
        additional_costs_net: number | string;
        notes: string | null;
        damage_notes: string | null;
        show_damage_on_invoice: boolean | null;
        status: string;
    }>;
};

type PurchaseDocumentQueryRow = {
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

export type PurchaseCaseDocument = {
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

export type PurchaseCaseDetail = {
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

    seller: {
        id: string;
        type: "company" | "private";
        name: string;
        company_name: string | null;
        owner_name: string | null;
        first_name: string | null;
        last_name: string | null;
        address: string;
        street: string | null;
        postal_code: string | null;
        city: string | null;
        country: string | null;
        email: string | null;
        preferred_language: string | null;
        phone: string | null;
        tax_number: string | null;
        vat_id: string | null;
    } | null;

    vehicle: {
        id: string;
        internal_number: string;
        manufacturer: string;
        model: string;
        name: string;
        vehicle_type: string;
        vin: string;
        license_plate: string | null;
        construction_year: number | null;
        first_registration: string | null;
        purchase_price_net: number;
        additional_costs_net: number;
        notes: string | null;
        damage_notes: string | null;
        show_damage_on_invoice: boolean;
        status: string;
    } | null;

    documents: PurchaseCaseDocument[];
};

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

function getCustomerName(
    customer: PurchaseCaseDetailQueryRow["customers"] extends SupabaseRelation<infer T>
        ? T
        : never,
): string {
    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

export async function getPurchaseCaseDetail(
    purchaseId: string,
): Promise<PurchaseCaseDetail> {
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
        vat_id
      ),
      vehicles (
        id,
        internal_number,
        manufacturer,
        model,
        vehicle_type,
        vin,
        license_plate,
        construction_year,
        first_registration,
        purchase_price_net,
        additional_costs_net,
        notes,
        damage_notes,
        show_damage_on_invoice,
        status
      )
    `,
        )
        .eq("id", purchaseId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        notFound();
    }

    const purchase = data as unknown as PurchaseCaseDetailQueryRow;

    const documentRelationFilter = purchase.vehicle_id
        ? `purchase_case_id.eq.${purchaseId},vehicle_id.eq.${purchase.vehicle_id}`
        : `purchase_case_id.eq.${purchaseId}`;

    const { data: documentsData, error: documentsError } = await supabase
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
        .or(documentRelationFilter)
        .order("created_at", { ascending: false });

    if (documentsError) {
        throw new Error(
            `Ankaufsdokumente konnten nicht geladen werden: ${documentsError.message}`,
        );
    }

    const seller = getSingleRelation(purchase.customers);
    const vehicle = getSingleRelation(purchase.vehicles);

    const documents = ((documentsData ?? []) as PurchaseDocumentQueryRow[]).map(
        (document) => ({
            id: document.id,
            document_type: document.document_type,
            source: document.source,
            status: document.status,
            file_name: document.file_name,
            file_path: document.file_path,
            mime_type: document.mime_type,
            file_size: document.file_size,
            created_at: document.created_at,
        }),
    );

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

        seller: seller
            ? {
                id: seller.id,
                type: seller.type,
                name: getCustomerName(seller),
                company_name: seller.company_name,
                owner_name: seller.owner_name,
                first_name: seller.first_name,
                last_name: seller.last_name,
                address: [
                    seller.street,
                    [seller.postal_code, seller.city].filter(Boolean).join(" "),
                    seller.country,
                ]
                    .filter(Boolean)
                    .join(", "),
                street: seller.street,
                postal_code: seller.postal_code,
                city: seller.city,
                country: seller.country,
                email: seller.email,
                preferred_language: seller.preferred_language,
                phone: seller.phone,
                tax_number: seller.tax_number,
                vat_id: seller.vat_id,
            }
            : null,

        vehicle: vehicle
            ? {
                id: vehicle.id,
                internal_number: vehicle.internal_number,
                manufacturer: vehicle.manufacturer,
                model: vehicle.model,
                name: `${vehicle.manufacturer} ${vehicle.model}`,
                vehicle_type: vehicle.vehicle_type,
                vin: vehicle.vin,
                license_plate: vehicle.license_plate,
                construction_year: vehicle.construction_year,
                first_registration: vehicle.first_registration,
                purchase_price_net: Number(vehicle.purchase_price_net ?? 0),
                additional_costs_net: Number(vehicle.additional_costs_net ?? 0),
                notes: vehicle.notes,
                damage_notes: vehicle.damage_notes,
                show_damage_on_invoice: Boolean(vehicle.show_damage_on_invoice),
                status: vehicle.status,
            }
            : null,

        documents,
    };
}
