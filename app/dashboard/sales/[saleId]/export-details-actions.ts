"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { isAllowedArrivalPeriod } from "@/lib/sales/export-date-rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getSingleRelation<T>(relation: T | T[] | null | undefined): T | null {
    if (!relation) return null;

    return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function revalidateSaleExportDetailsPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/documents",
        "/dashboard/checks",
    ]);
}

export async function updateSaleExportDetailsAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    const { data: saleData, error: saleLoadError } = await supabase
        .from("sales")
        .select(
            `
            sale_type,
            sale_date,
            customers:buyer_customer_id (
                city,
                country
            )
        `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (saleLoadError || !saleData) {
        throw new Error(
            `Verkauf konnte nicht geladen werden: ${
                saleLoadError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const destinationCity = getStringValue(formData, "export_destination_city");
    const destinationCountry = getStringValue(
        formData,
        "export_destination_country",
    );
    const arrivalMonth = getStringValue(formData, "export_arrival_month");
    const arrivalYear = getStringValue(formData, "export_arrival_year");
    const transportDate = getStringValue(formData, "export_transport_date");
    const transportType = getStringValue(formData, "export_transport_type");
    const requiresExportDetails =
        saleData.sale_type === "eu" ||
        saleData.sale_type === "export_third_country";
    const buyerCustomer = getSingleRelation(saleData.customers);
    const finalDestinationCity =
        destinationCity ?? buyerCustomer?.city ?? null;
    const finalDestinationCountry =
        destinationCountry ?? buyerCustomer?.country ?? null;

    if (
        requiresExportDetails &&
        (!finalDestinationCity ||
            !finalDestinationCountry ||
            !arrivalMonth ||
            !arrivalYear ||
            !transportDate ||
            !transportType)
    ) {
        redirect(`/dashboard/sales/${saleId}?exportDataError=1#export-details`);
    }

    if (
        requiresExportDetails &&
        !isAllowedArrivalPeriod({
            saleDate: saleData.sale_date,
            month: arrivalMonth,
            year: arrivalYear,
        })
    ) {
        redirect(`/dashboard/sales/${saleId}?exportArrivalError=1#export-details`);
    }

    const { data, error } = await supabase
        .from("sales")
        .update({
            export_destination_city: finalDestinationCity,
            export_destination_country: finalDestinationCountry,
            export_arrival_month: arrivalMonth,
            export_arrival_year: arrivalYear,
            export_transport_date: transportDate,
            export_transport_type: transportType,
        })
        .eq("id", saleId)
        .eq("company_id", companyId)
        .select("id")
        .maybeSingle();

    if (error || !data) {
        throw new Error(
            `Export-/Verbringungsdaten konnten nicht gespeichert werden: ${
                error?.message ??
                "Es wurde kein passender Verkaufsdatensatz gefunden oder die RLS-Policy blockiert das Update."
            }`,
        );
    }

    revalidateSaleExportDetailsPaths(saleId);

    redirect(`/dashboard/sales/${saleId}?exportDataSaved=1#export-details`);
}
