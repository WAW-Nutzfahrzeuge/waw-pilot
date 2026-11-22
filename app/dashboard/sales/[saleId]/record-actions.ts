"use server";

import { redirect } from "next/navigation";

import { getDecimalFormValue, getStringFormValue } from "@/lib/actions/form-data";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { logActivity } from "@/lib/activity/activity-log";
import { getCurrentCompanyId } from "@/lib/company";
import {
    normalizeEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";
import { generateAndStoreInvoicePdf } from "@/lib/pdf/invoice-storage";
import type { SaleType } from "@/lib/sales/sale-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";
import { isValidPhoneNumber } from "@/lib/validation/phone";
import {
    getDuplicateVinMessage,
    translateVehicleDatabaseError,
} from "@/lib/vehicles/vehicle-save-errors";
import { normalizeVin } from "@/lib/vehicles/vin";
import {
    getSaleTaxConfiguration,
    type SaleBuyerType,
} from "@/utils/sale-tax-rules";
import { normalizeCustomerCountry } from "@/lib/countries/country-options";

function getEmailLanguage(formData: FormData): EmailLanguage {
    return normalizeEmailLanguage(getStringFormValue(formData, "preferred_language"));
}

function redirectWithSaleMessage(saleId: string, params: Record<string, string>): never {
    const searchParams = new URLSearchParams(params);

    redirect(`/dashboard/sales/${saleId}?${searchParams.toString()}`);
}

function getMetadataRecord(metadata: unknown): Record<string, unknown> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {};
    }

    return metadata as Record<string, unknown>;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

type SaleTaxSyncInvoice = {
    id: string;
    invoice_number: string;
    invoice_type: string | null;
    pdf_document_id: string | null;
    zugferd_file_path: string | null;
};

async function syncSaleTaxAmountsAfterBuyerChange({
    saleId,
    companyId,
    buyerType,
    billingCountry,
    buyerVatId,
}: {
    saleId: string;
    companyId: string;
    buyerType: SaleBuyerType;
    billingCountry: string | null;
    buyerVatId: string | null;
}) {
    const supabase = createServerSupabaseClient();

    const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select("id, sale_type, net_amount, vat_rate")
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (saleError || !saleData) {
        throw new Error(
            `Verkauf konnte für Steuerkorrektur nicht geladen werden: ${
                saleError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const saleType = (saleData.sale_type ?? "inland") as SaleType;
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType,
        deliveryType: saleType,
        billingCountry,
    });

    const currentVatRate = Number(saleData.vat_rate);
    const nextVatRate = taxConfiguration.defaultVatRate;

    if (taxConfiguration.showVatId && !buyerVatId?.trim()) {
        return { changed: false, invoiceCount: 0 };
    }

    if (
        !taxConfiguration.forceVatRate &&
        Number.isFinite(currentVatRate) &&
        currentVatRate === nextVatRate
    ) {
        return { changed: false, invoiceCount: 0 };
    }

    const netAmount = Number(saleData.net_amount);

    if (!Number.isFinite(netAmount)) {
        throw new Error("Verkaufspreis netto ist ungültig.");
    }

    const vatAmount = roundMoney(netAmount * (nextVatRate / 100));
    const grossAmount = roundMoney(netAmount + vatAmount);

    if (
        Number.isFinite(currentVatRate) &&
        currentVatRate === nextVatRate
    ) {
        return { changed: false, invoiceCount: 0 };
    }

    const { error: saleUpdateError } = await supabase
        .from("sales")
        .update({
            vat_rate: nextVatRate,
            vat_amount: vatAmount,
            gross_amount: grossAmount,
        })
        .eq("id", saleId)
        .eq("company_id", companyId);

    if (saleUpdateError) {
        throw new Error(
            `Verkauf konnte steuerlich nicht aktualisiert werden: ${saleUpdateError.message}`,
        );
    }

    const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_type, pdf_document_id, zugferd_file_path")
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .in("invoice_type", ["standard", "proforma", "down_payment"]);

    if (invoicesError) {
        throw new Error(
            `Rechnungen konnten für Steuerkorrektur nicht geladen werden: ${invoicesError.message}`,
        );
    }

    const invoices = (invoicesData ?? []) as SaleTaxSyncInvoice[];

    if (invoices.length > 0) {
        const invoiceIds = invoices.map((invoice) => invoice.id);

        const { error: invoiceUpdateError } = await supabase
            .from("invoices")
            .update({
                vat_rate: nextVatRate,
                vat_amount: vatAmount,
                gross_amount: grossAmount,
            })
            .eq("company_id", companyId)
            .in("id", invoiceIds);

        if (invoiceUpdateError) {
            throw new Error(
                `Rechnungen konnten steuerlich nicht aktualisiert werden: ${invoiceUpdateError.message}`,
            );
        }

        const zugferdInvoiceIds = invoices
            .filter((invoice) => Boolean(invoice.zugferd_file_path))
            .map((invoice) => invoice.id);

        if (zugferdInvoiceIds.length > 0) {
            const { error: zugferdUpdateError } = await supabase
                .from("invoices")
                .update({
                    zugferd_validation_status: "invalid",
                    zugferd_generation_started_at: null,
                    zugferd_validation_summary: {
                        status: "invalid",
                        issues: [
                            {
                                severity: "error",
                                message:
                                    "Steuerbeträge wurden nach Kundenänderung angepasst. ZUGFeRD muss neu erzeugt werden.",
                            },
                        ],
                    },
                })
                .eq("company_id", companyId)
                .in("id", zugferdInvoiceIds);

            if (zugferdUpdateError) {
                throw new Error(
                    `ZUGFeRD-Status konnte nach Steuerkorrektur nicht invalidiert werden: ${zugferdUpdateError.message}`,
                );
            }
        }

        for (const invoice of invoices) {
            const storedPdf = await generateAndStoreInvoicePdf(invoice.id);

            if (!invoice.pdf_document_id) continue;

            const { error: documentUpdateError } = await supabase
                .from("documents")
                .update({
                    status: "available",
                    file_name: storedPdf.fileName,
                    file_path: storedPdf.filePath,
                    file_size: storedPdf.fileSize,
                    mime_type: "application/pdf",
                })
                .eq("id", invoice.pdf_document_id)
                .eq("company_id", companyId);

            if (documentUpdateError) {
                throw new Error(
                    `Rechnungs-PDF ${invoice.invoice_number} wurde erzeugt, aber das Dokument konnte nicht aktualisiert werden: ${documentUpdateError.message}`,
                );
            }
        }
    }

    await logActivity({
        action: `Steuerbeträge nach Käuferänderung aktualisiert (${nextVatRate}% MwSt.)`,
        entityType: "sale",
        entityId: saleId,
    });

    return { changed: true, invoiceCount: invoices.length };
}

export async function updateSaleCustomerAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringFormValue(formData, "sale_id");
    const customerId = getStringFormValue(formData, "customer_id");
    const type = getStringFormValue(formData, "type");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!customerId) throw new Error("Kunde fehlt.");
    if (type !== "company" && type !== "private") {
        redirectWithSaleMessage(saleId, { recordError: "invalidCustomerType" });
    }
    const buyerType: SaleBuyerType = type === "private" ? "private" : "company";

    const companyName = getStringFormValue(formData, "company_name");
    const ownerName = getStringFormValue(formData, "owner_name");
    const firstName = getStringFormValue(formData, "first_name");
    const lastName = getStringFormValue(formData, "last_name");
    const street = getStringFormValue(formData, "street");
    const postalCode = getStringFormValue(formData, "postal_code");
    const city = getStringFormValue(formData, "city");
    const country = normalizeCustomerCountry(getStringFormValue(formData, "country"));
    const email = getStringFormValue(formData, "email");
    const preferredLanguage = getEmailLanguage(formData);
    const phone = getStringFormValue(formData, "phone");
    const taxNumber = getStringFormValue(formData, "tax_number");
    const vatId = getStringFormValue(formData, "vat_id");
    const commercialRegisterNumber = getStringFormValue(
        formData,
        "commercial_register_number",
    );

    if (!street || !postalCode || !city || !country) {
        redirectWithSaleMessage(saleId, { recordError: "customerAddressMissing" });
    }

    if (type === "company" && !companyName) {
        redirectWithSaleMessage(saleId, { recordError: "companyNameMissing" });
    }

    if (type === "private" && (!firstName || !lastName)) {
        redirectWithSaleMessage(saleId, { recordError: "privateNameMissing" });
    }

    if (!isValidPhoneNumber(phone)) {
        redirectWithSaleMessage(saleId, { recordError: "invalidPhone" });
    }

    const [{ data: sale }, { data: existingCustomer }] = await Promise.all([
        supabase
            .from("sales")
            .select("id")
            .eq("id", saleId)
            .eq("company_id", companyId)
            .eq("buyer_customer_id", customerId)
            .maybeSingle(),
        supabase
            .from("customers")
            .select("vat_id, type")
            .eq("id", customerId)
            .eq("company_id", companyId)
            .maybeSingle(),
    ]);

    if (!sale) {
        redirectWithSaleMessage(saleId, { recordError: "saleCustomerMismatch" });
    }

    const { error } = await supabase
        .from("customers")
        .update({
            type,
            company_name: companyName,
            owner_name: ownerName,
            first_name: firstName,
            last_name: lastName,
            street,
            postal_code: postalCode,
            city,
            country,
            email,
            preferred_language: preferredLanguage,
            phone,
            tax_number: taxNumber,
            vat_id: vatId,
            commercial_register_number: commercialRegisterNumber,
        })
        .eq("id", customerId)
        .eq("company_id", companyId);

    if (error) {
        console.error("[sale-record] customer update failed", error);
        redirectWithSaleMessage(saleId, { recordError: "customerUpdateFailed" });
    }

    const previousVatId =
        typeof existingCustomer?.vat_id === "string"
            ? existingCustomer.vat_id.trim()
            : null;
    const nextVatId = vatId?.trim() ?? null;

    if (previousVatId !== nextVatId) {
        const { data: bzstDocuments, error: bzstDocumentsError } = await supabase
            .from("documents")
            .select("id, metadata")
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .in("document_type", [
                "bzst_vat_verification_primary",
                "bzst_vat_verification_secondary",
            ]);

        if (bzstDocumentsError) {
            console.error("[sale-record] BZSt documents lookup failed", bzstDocumentsError);
        }

        const vatNumberChangedAt = new Date().toISOString();

        const bzstResetResults = await Promise.all(
            (bzstDocuments ?? []).map((document) =>
                supabase
                    .from("documents")
                    .update({
                        status: "needs_review",
                        metadata: {
                            ...getMetadataRecord(document.metadata),
                            reviewStatus: "REVIEW_REQUIRED",
                            vatNumberChangedAt,
                            previousVatId,
                            currentVatId: nextVatId,
                        },
                    })
                    .eq("company_id", companyId)
                    .eq("id", document.id),
            ),
        );

        const bzstResetError = bzstResetResults.find((result) => result.error)?.error;

        if (bzstResetError) {
            console.error("[sale-record] BZSt review reset failed", bzstResetError);
        }

        if (bzstResetError) {
            console.error("[sale-record] BZSt review reset incomplete");
        } else {
            await logActivity({
                action:
                    "Die USt-ID wurde geändert. Die BZSt-Prüfung muss erneut geprüft werden.",
                entityType: "sale",
                entityId: saleId,
            });
        }
    }

    const taxSyncResult = await syncSaleTaxAmountsAfterBuyerChange({
        saleId,
        companyId,
        buyerType,
        billingCountry: country,
        buyerVatId: vatId,
    });

    await logActivity({
        action: taxSyncResult.changed
            ? `Kunde in Verkaufsakte bearbeitet; Steuerbeträge und ${taxSyncResult.invoiceCount} Rechnung${taxSyncResult.invoiceCount === 1 ? "" : "en"} aktualisiert`
            : "Kunde in Verkaufsakte bearbeitet",
        entityType: "customer",
        entityId: customerId,
    });

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/customers",
        "/dashboard/activities",
    ]);

    redirectWithSaleMessage(saleId, { recordSaved: "customer" });
}

export async function updateSaleTypeAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const saleId = getStringFormValue(formData, "sale_id");
    const nextSaleType = getStringFormValue(formData, "sale_type");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (
        nextSaleType !== "inland" &&
        nextSaleType !== "eu" &&
        nextSaleType !== "export_third_country"
    ) {
        redirectWithSaleMessage(saleId, { saleTypeError: "invalidType" });
    }
    if (getStringFormValue(formData, "confirm_sale_type_change") !== "yes") {
        redirectWithSaleMessage(saleId, { saleTypeError: "confirmationRequired" });
    }

    const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("id, sale_type, status, payment_status, datev_status, net_amount, vat_rate, vat_amount, gross_amount, buyer_customer_id")
        .eq("id", saleId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (saleError || !sale) {
        redirectWithSaleMessage(saleId, { saleTypeError: "saleNotFound" });
    }
    if (sale.status === "cancelled") {
        redirectWithSaleMessage(saleId, { saleTypeError: "cancelled" });
    }
    if ((sale.sale_type ?? "inland") === nextSaleType) {
        redirectWithSaleMessage(saleId, { saleTypeSaved: "1" });
    }

    const [customerResult, invoicesResult, paymentsResult, refundsResult, cashbookResult, financialEntriesResult] = await Promise.all([
        supabase
            .from("customers")
            .select("id, type, country, vat_id")
            .eq("id", sale.buyer_customer_id)
            .eq("company_id", companyId)
            .maybeSingle(),
        supabase
            .from("invoices")
            .select("id, invoice_number, invoice_type, status, payment_status, datev_status, email_sent_at, zugferd_email_sent_at, zugferd_file_path, zugferd_validation_status, pdf_document_id, net_amount, vat_rate, vat_amount, gross_amount, correction_of_invoice_id, root_invoice_id")
            .eq("sale_id", saleId)
            .eq("company_id", companyId),
        supabase
            .from("sale_payments")
            .select("id")
            .eq("sale_id", saleId)
            .eq("company_id", companyId)
            .eq("is_voided", false),
        supabase
            .from("sale_refunds")
            .select("id")
            .eq("sale_id", saleId)
            .eq("company_id", companyId)
            .eq("is_voided", false),
        supabase
            .from("cashbook_entries")
            .select("id")
            .eq("sale_id", saleId)
            .eq("company_id", companyId),
        supabase
            .from("financial_entries")
            .select("id")
            .eq("sale_id", saleId)
            .eq("company_id", companyId),
    ]);

    if (customerResult.error || !customerResult.data) {
        redirectWithSaleMessage(saleId, { saleTypeError: "customerNotFound" });
    }
    if (invoicesResult.error || paymentsResult.error || refundsResult.error || cashbookResult.error || financialEntriesResult.error) {
        redirectWithSaleMessage(saleId, { saleTypeError: "dependenciesCouldNotBeChecked" });
    }

    const invoices = invoicesResult.data ?? [];
    const hasInvoiceHistory = invoices.some(
        (invoice) =>
            invoice.status !== "created" ||
            invoice.payment_status !== "open" ||
            invoice.datev_status === "sent" ||
            Boolean(invoice.email_sent_at) ||
            Boolean(invoice.zugferd_email_sent_at) ||
            Boolean(invoice.correction_of_invoice_id) ||
            Boolean(invoice.root_invoice_id),
    );

    if (sale.datev_status === "sent" || hasInvoiceHistory) {
        redirectWithSaleMessage(saleId, { saleTypeError: "invoiceAlreadySent" });
    }
    if (
        sale.payment_status !== "open" ||
        (paymentsResult.data?.length ?? 0) > 0 ||
        (cashbookResult.data?.length ?? 0) > 0 ||
        (financialEntriesResult.data?.length ?? 0) > 0
    ) {
        redirectWithSaleMessage(saleId, { saleTypeError: "paymentsExist" });
    }
    if ((refundsResult.data?.length ?? 0) > 0) {
        redirectWithSaleMessage(saleId, { saleTypeError: "refundsExist" });
    }
    if (
        invoices.some(
            (invoice) =>
                !["standard", "proforma", "down_payment"].includes(invoice.invoice_type),
        )
    ) {
        redirectWithSaleMessage(saleId, { saleTypeError: "correctionExists" });
    }
    if (
        nextSaleType === "eu" &&
        customerResult.data.type === "company" &&
        !customerResult.data.vat_id?.trim()
    ) {
        redirectWithSaleMessage(saleId, { saleTypeError: "euCompanyVatIdMissing" });
    }

    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: customerResult.data.type,
        deliveryType: nextSaleType as SaleType,
        billingCountry: customerResult.data.country,
    });
    const nextVatRate = taxConfiguration.defaultVatRate;
    const netAmount = Number(sale.net_amount);
    if (!Number.isFinite(netAmount) || netAmount < 0) {
        redirectWithSaleMessage(saleId, { saleTypeError: "invalidSaleAmount" });
    }
    const authSupabase = await createAuthServerSupabaseClient();
    const { error: typeChangeError } = await authSupabase.rpc("change_sale_type_safely", {
        p_company_id: companyId,
        p_sale_id: saleId,
        p_expected_sale_type: sale.sale_type,
        p_next_sale_type: nextSaleType,
        p_vat_rate: nextVatRate,
    });

    if (typeChangeError) {
        const errorMessage = typeChangeError.message ?? "";
        const errorKey = errorMessage.includes("ACCOUNTING_RECORDS_EXIST")
            ? "paymentsExist"
            : errorMessage.includes("REFUNDS_EXIST")
              ? "refundsExist"
            : errorMessage.includes("INVALID_AMOUNT")
              ? "invalidInvoiceAmount"
            : errorMessage.includes("INVOICE_HISTORY")
              ? "invoiceAlreadySent"
              : errorMessage.includes("CONCURRENT")
                ? "concurrentChange"
                : errorMessage.includes("EU_VAT_ID_REQUIRED")
                  ? "euCompanyVatIdMissing"
                  : errorMessage.includes("CANCELLED")
                    ? "cancelled"
                    : errorMessage.includes("CUSTOMER_NOT_FOUND") || errorMessage.includes("NOT_FOUND")
                      ? "saleNotFound"
                      : "atomicUpdateFailed";
        redirectWithSaleMessage(saleId, { saleTypeError: errorKey });
    }

    try {
        for (const invoice of invoices) {
            if (!invoice.pdf_document_id) continue;
            const storedPdf = await generateAndStoreInvoicePdf(invoice.id);
            const { error: documentUpdateError } = await supabase
                .from("documents")
                .update({
                    status: "available",
                    file_name: storedPdf.fileName,
                    file_path: storedPdf.filePath,
                    file_size: storedPdf.fileSize,
                    mime_type: "application/pdf",
                })
                .eq("id", invoice.pdf_document_id)
                .eq("company_id", companyId);
            if (documentUpdateError) throw documentUpdateError;
        }
    } catch {
        await logActivity({
            action: `Verkaufstyp auf ${nextSaleType} geändert; mindestens ein Rechnungs-PDF muss erneut geprüft werden`,
            entityType: "sale",
            entityId: saleId,
        });
        revalidatePaths([
            `/dashboard/sales/${saleId}`,
            "/dashboard/sales",
            "/dashboard/invoices",
            "/dashboard/documents",
            "/dashboard/accounting",
            "/dashboard",
            "/dashboard/activities",
        ]);
        redirectWithSaleMessage(saleId, { saleTypeError: "pdfRefreshFailed" });
    }

    await logActivity({
        action: `Verkaufstyp von ${sale.sale_type} auf ${nextSaleType} geändert; Steuerbeträge neu berechnet`,
        entityType: "sale",
        entityId: saleId,
    });
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/accounting",
        "/dashboard",
        "/dashboard/activities",
    ]);
    redirectWithSaleMessage(saleId, { saleTypeSaved: "1" });
}

export async function updateSaleVehicleAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringFormValue(formData, "sale_id");
    const vehicleId = getStringFormValue(formData, "vehicle_id");
    const manufacturer = getStringFormValue(formData, "manufacturer");
    const model = getStringFormValue(formData, "model");
    const vehicleType = getStringFormValue(formData, "vehicle_type");
    const constructionYear = getDecimalFormValue(formData, "construction_year");
    const vin = normalizeVin(getStringFormValue(formData, "vin") ?? "");
    const licensePlate = getStringFormValue(formData, "license_plate");
    const mileage = getDecimalFormValue(formData, "mileage");
    const color = getStringFormValue(formData, "color");
    const vehicleCategory = getStringFormValue(formData, "vehicle_category");
    const purchasePriceNet = getDecimalFormValue(formData, "purchase_price_net");
    const additionalCostsNet = getDecimalFormValue(formData, "additional_costs_net") ?? 0;
    const damageNotes = getStringFormValue(formData, "damage_notes");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!vehicleId) throw new Error("Fahrzeug fehlt.");

    if (!manufacturer || !model || !vehicleType || !vin) {
        redirectWithSaleMessage(saleId, { recordError: "vehicleRequiredMissing" });
    }

    if (purchasePriceNet === null || purchasePriceNet < 0 || additionalCostsNet < 0) {
        redirectWithSaleMessage(saleId, { recordError: "vehiclePriceInvalid" });
    }

    const [{ data: sale }, { data: duplicateVinVehicle, error: duplicateVinError }, { data: existingVehicle, error: loadError }] =
        await Promise.all([
            supabase
                .from("sales")
                .select("id")
                .eq("id", saleId)
                .eq("company_id", companyId)
                .eq("vehicle_id", vehicleId)
                .maybeSingle(),
            supabase
                .from("vehicles")
                .select("id")
                .eq("company_id", companyId)
                .ilike("vin", vin)
                .neq("id", vehicleId)
                .limit(1),
            supabase
                .from("vehicles")
                .select("show_damage_on_invoice")
                .eq("id", vehicleId)
                .eq("company_id", companyId)
                .maybeSingle(),
        ]);

    if (!sale) {
        redirectWithSaleMessage(saleId, { recordError: "saleVehicleMismatch" });
    }

    if (duplicateVinError) {
        console.error("[sale-record] vin duplicate check failed", duplicateVinError);
    }

    if (loadError || !existingVehicle) {
        console.error("[sale-record] vehicle load failed", loadError);
        redirectWithSaleMessage(saleId, {
            recordError: encodeURIComponent(
                "Fahrzeug konnte nicht geladen werden. Bitte versuche es erneut.",
            ),
        });
        return;
    }

    if (duplicateVinVehicle && duplicateVinVehicle.length > 0) {
        redirectWithSaleMessage(saleId, {
            recordError: encodeURIComponent(getDuplicateVinMessage()),
        });
    }

    const { error } = await supabase
        .from("vehicles")
        .update({
            manufacturer,
            model,
            vehicle_type: vehicleType,
            construction_year: constructionYear,
            vin,
            license_plate: licensePlate,
            mileage,
            color,
            vehicle_category: vehicleCategory,
            purchase_price_net: purchasePriceNet,
            additional_costs_net: additionalCostsNet,
            damage_notes: damageNotes,
            show_damage_on_invoice: Boolean(existingVehicle.show_damage_on_invoice),
        })
        .eq("id", vehicleId)
        .eq("company_id", companyId);

    if (error) {
        console.error("[sale-record] vehicle update failed", error);
        redirectWithSaleMessage(saleId, {
            recordError: encodeURIComponent(translateVehicleDatabaseError(error)),
        });
    }

    await logActivity({
        action: "Fahrzeug in Verkaufsakte bearbeitet",
        entityType: "vehicle",
        entityId: vehicleId,
    });

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/vehicles",
        "/dashboard/activities",
    ]);

    redirectWithSaleMessage(saleId, { recordSaved: "vehicle" });
}
