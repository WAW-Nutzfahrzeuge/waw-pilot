import { notFound } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import {
    getRequiredDocumentsForSale,
    type RequiredDocumentDefinition,
} from "@/lib/sales/sale-required-documents";
import type {
    DatevStatus,
    PaymentStatus,
    SaleStatus,
    SaleType,
} from "@/lib/sales/sale-queries";
import type { InvoiceType } from "@/lib/invoices/invoice-numbering";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSaleTaxConfiguration } from "@/utils/sale-tax-rules";
import type { PaymentMethod } from "@/lib/payments/payment-methods";
import {
    calculatePaidAmount,
    calculatePaymentStatus,
    calculateRemainingAmount,
} from "@/utils/payment-utils";
import { CorrectionCalculationService } from "@/src/modules/invoice-corrections/domain/services/correction-calculation.service";

type SupabaseRelation<T> = T | T[] | null;

type InvoiceRelation = {
    id: string;
    invoice_type: InvoiceType;
    invoice_number: string;
    invoice_date: string;
    net_amount: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    status: string;
    payment_status: PaymentStatus;
    correction_of_invoice_id: string | null;
    root_invoice_id: string | null;
    correction_reason_code: string | null;
    correction_reason_text: string | null;
    customer_visible_reason: string | null;
    correction_scope: string | null;
    correction_status: string | null;
    corrected_gross_amount: number | string | null;
    original_invoice_number: string | null;
    original_invoice_date: string | null;
    include_signature_stamp: boolean | null;
    pdf_document_id: string | null;
    email_sent_at: string | null;
    email_sent_to: string | null;
    email_sent_language: string | null;
    email_send_count: number | null;
    zugferd_file_path: string | null;
    zugferd_generated_at: string | null;
    zugferd_profile: string | null;
    zugferd_standard_version: string | null;
    zugferd_validation_status: "valid" | "invalid" | "pending" | null;
    zugferd_validated_at: string | null;
    zugferd_validation_summary: Record<string, unknown> | null;
    zugferd_sha256: string | null;
    zugferd_email_sent_at: string | null;
    zugferd_email_sent_to: string | null;
    zugferd_email_sent_language: string | null;
    zugferd_email_send_count: number | null;
    created_at: string;
};

type DocumentRelation = {
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

type SalePaymentRelation = {
    id: string;
    payment_reference: string;
    amount: number | string;
    payment_method: PaymentMethod;
    payment_date: string;
    note: string | null;
    external_reference: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    last_modified_by: string | null;
    is_voided: boolean | null;
    voided_at: string | null;
    voided_by: string | null;
    void_reason: string | null;
};

type SaleRefundRelation = {
    id: string;
    refund_reference: string;
    amount: number | string;
    refund_method: PaymentMethod;
    refund_date: string;
    reason: string;
    external_reference: string | null;
    note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    updated_by: string | null;
    is_voided: boolean | null;
    voided_at: string | null;
    voided_by: string | null;
    void_reason: string | null;
};

type SaleDetailQueryRow = {
    id: string;
    sale_number: string | null;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    sale_type: SaleType | null;
    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    status: SaleStatus;
    payment_status: PaymentStatus;
    datev_status: DatevStatus;
    notes: string | null;
    invoice_notes: string | null;
    include_damage_notes_on_invoice: boolean | null;
    created_at: string;

    companies: {
        signature_image_path: string | null;
        stamp_image_path: string | null;
    } | null;

    vehicles: {
        internal_number: string;
        manufacturer: string;
        model: string;
        vehicle_type: string;
        vin: string;
        license_plate: string | null;
        construction_year: number | null;
        first_registration: string | null;
        purchase_price_net: number | string;
        sale_price_net: number | string | null;
        additional_costs_net: number | string;
        damage_notes: string | null;
        show_damage_on_invoice: boolean | null;
    } | null;

    customers: {
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
        preferred_language: string;
        phone: string | null;
        tax_number: string | null;
        vat_id: string | null;
        commercial_register_number: string | null;
    } | null;

    invoices: SupabaseRelation<InvoiceRelation>;
    documents: SupabaseRelation<DocumentRelation>;
    sale_payments: SupabaseRelation<SalePaymentRelation>;
    sale_refunds: SupabaseRelation<SaleRefundRelation>;
};

type LegacyInvoiceRelation = {
    id: string;
    invoice_type: InvoiceType | null;
    invoice_number: string;
    invoice_date: string;
    net_amount: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    status: string;
    payment_status: PaymentStatus;
    created_at: string;
};

type LegacySaleDetailQueryRow = Omit<
    SaleDetailQueryRow,
    | "invoice_notes"
    | "include_damage_notes_on_invoice"
    | "companies"
    | "invoices"
    | "sale_refunds"
> & {
    invoices: SupabaseRelation<LegacyInvoiceRelation>;
};

export type SaleDetailDocument = {
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

export type SaleDetailInvoice = {
    id: string;
    invoice_type: InvoiceType;
    invoice_number: string;
    invoice_date: string;
    net_amount: number;
    vat_amount: number;
    gross_amount: number;
    status: string;
    payment_status: PaymentStatus;
    correction_of_invoice_id: string | null;
    root_invoice_id: string | null;
    correction_reason_code: string | null;
    correction_reason_text: string | null;
    customer_visible_reason: string | null;
    correction_scope: string | null;
    correction_status: string | null;
    corrected_gross_amount: number | null;
    original_invoice_number: string | null;
    original_invoice_date: string | null;
    include_signature_stamp: boolean;
    pdf_document_id: string | null;
    email_sent_at: string | null;
    email_sent_to: string | null;
    email_sent_language: string | null;
    email_send_count: number;
    zugferd_file_path: string | null;
    zugferd_generated_at: string | null;
    zugferd_profile: string | null;
    zugferd_standard_version: string | null;
    zugferd_validation_status: "valid" | "invalid" | "pending" | null;
    zugferd_validated_at: string | null;
    zugferd_validation_summary: Record<string, unknown> | null;
    zugferd_sha256: string | null;
    zugferd_email_sent_at: string | null;
    zugferd_email_sent_to: string | null;
    zugferd_email_sent_language: string | null;
    zugferd_email_send_count: number;
    created_at: string;
};

export type SaleDetailRefund = {
    id: string;
    refund_reference: string;
    amount: number;
    refund_method: PaymentMethod;
    refund_date: string;
    reason: string;
    external_reference: string | null;
    note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    updated_by: string | null;
    is_voided: boolean;
    voided_at: string | null;
    voided_by: string | null;
    void_reason: string | null;
};

export type SaleDetailPayment = {
    id: string;
    payment_reference: string;
    amount: number;
    payment_method: PaymentMethod;
    payment_date: string;
    note: string | null;
    external_reference: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
    last_modified_by: string | null;
    is_voided: boolean;
    voided_at: string | null;
    voided_by: string | null;
    void_reason: string | null;
};

export type RequiredDocumentStatus = RequiredDocumentDefinition & {
    isAvailable: boolean;
    document: SaleDetailDocument | null;
};

export type SaleDetail = {
    id: string;
    sale_number: string | null;
    sale_date: string;
    sale_type: SaleType;
    status: SaleStatus;
    payment_status: PaymentStatus;
    datev_status: DatevStatus;
    notes: string | null;
    invoice_notes: string | null;
    include_damage_notes_on_invoice: boolean;
    has_signature_stamp_assets: boolean;

    net_amount: number;
    vat_rate: number;
    vat_amount: number;
    gross_amount: number;
    paid_amount: number;
    remaining_amount: number;
    profit_net: number;

    customer: {
        id: string;
        type: "company" | "private";
        name: string;
        company_name: string | null;
        owner_name: string | null;
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
        commercial_register_number: string | null;
    };

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
        sale_price_net: number | null;
        additional_costs_net: number;
        damage_notes: string | null;
        show_damage_on_invoice: boolean;
    };

    invoice: SaleDetailInvoice | null;
    invoices: SaleDetailInvoice[];
    payments: SaleDetailPayment[];
    refunds: SaleDetailRefund[];
    correction_summary: {
        original_invoice_id: string | null;
        existing_correction_gross_amount: number;
        remaining_correctable_amount: number;
        effective_invoice_amount: number;
        refunded_amount: number;
        outstanding_refund_amount: number;
        refund_status: string;
    };

    documents: SaleDetailDocument[];
    required_documents: RequiredDocumentStatus[];
    required_documents_count: number;
    available_required_documents_count: number;
    missing_required_documents_count: number;
    missing_required_labels: string[];
    missing_required_data_labels: string[];
};

function getManyRelation<T>(relation: SupabaseRelation<T>): T[] {
    if (!relation) return [];

    if (Array.isArray(relation)) {
        return relation;
    }

    return [relation];
}

function getCustomerName(customer: SaleDetailQueryRow["customers"]): string {
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

function getInvoiceSortWeight(invoiceType: InvoiceType): number {
    const weights: Record<InvoiceType, number> = {
        standard: 1,
        proforma: 2,
        down_payment: 3,
        cancellation_invoice: 4,
        credit_note: 5,
    };

    return weights[invoiceType];
}

function mapLegacyInvoice(invoice: LegacyInvoiceRelation): InvoiceRelation {
    return {
        id: invoice.id,
        invoice_type: invoice.invoice_type ?? "standard",
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        net_amount: invoice.net_amount,
        vat_amount: invoice.vat_amount,
        gross_amount: invoice.gross_amount,
        status: invoice.status,
        payment_status: invoice.payment_status,
        correction_of_invoice_id: null,
        root_invoice_id: null,
        correction_reason_code: null,
        correction_reason_text: null,
        customer_visible_reason: null,
        correction_scope: null,
        correction_status: null,
        corrected_gross_amount: null,
        original_invoice_number: null,
        original_invoice_date: null,
        include_signature_stamp: false,
        pdf_document_id: null,
        email_sent_at: null,
        email_sent_to: null,
        email_sent_language: null,
        email_send_count: 0,
        zugferd_file_path: null,
        zugferd_generated_at: null,
        zugferd_profile: null,
        zugferd_standard_version: null,
        zugferd_validation_status: null,
        zugferd_validated_at: null,
        zugferd_validation_summary: null,
        zugferd_sha256: null,
        zugferd_email_sent_at: null,
        zugferd_email_sent_to: null,
        zugferd_email_sent_language: null,
        zugferd_email_send_count: 0,
        created_at: invoice.created_at,
    };
}

function mapLegacySaleDetailRow(row: LegacySaleDetailQueryRow): SaleDetailQueryRow {
    return {
        ...row,
        invoice_notes: null,
        include_damage_notes_on_invoice: false,
        companies: null,
        invoices: getManyRelation(row.invoices).map(mapLegacyInvoice),
        sale_refunds: [],
    };
}

export async function getSaleDetail(saleId: string): Promise<SaleDetail> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("sales")
        .select(
            `
	      id,
	      sale_number,
	      vehicle_id,
      buyer_customer_id,
      sale_date,
      sale_type,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      status,
      payment_status,
      datev_status,
      notes,
      invoice_notes,
      include_damage_notes_on_invoice,
      created_at,
      companies (
        signature_image_path,
        stamp_image_path
      ),
      vehicles (
        internal_number,
        manufacturer,
        model,
        vehicle_type,
        vin,
        license_plate,
        construction_year,
        first_registration,
        purchase_price_net,
        sale_price_net,
        additional_costs_net,
        damage_notes,
        show_damage_on_invoice
      ),
      customers:buyer_customer_id (
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
        vat_id,
        commercial_register_number
      ),
      invoices (
        id,
        invoice_type,
        invoice_number,
        invoice_date,
        net_amount,
        vat_amount,
        gross_amount,
        status,
        payment_status,
        correction_of_invoice_id,
        root_invoice_id,
        correction_reason_code,
        correction_reason_text,
        customer_visible_reason,
        correction_scope,
        correction_status,
        corrected_gross_amount,
        original_invoice_number,
        original_invoice_date,
        include_signature_stamp,
        pdf_document_id,
        email_sent_at,
        email_sent_to,
        email_sent_language,
        email_send_count,
        zugferd_file_path,
        zugferd_generated_at,
        zugferd_profile,
        zugferd_standard_version,
        zugferd_validation_status,
        zugferd_validated_at,
        zugferd_validation_summary,
        zugferd_sha256,
        zugferd_email_sent_at,
        zugferd_email_sent_to,
        zugferd_email_sent_language,
        zugferd_email_send_count,
        created_at
      ),
      documents (
        id,
        document_type,
        source,
        status,
        file_name,
        file_path,
        mime_type,
        file_size,
        created_at
      ),
      sale_payments (
        id,
        payment_reference,
        amount,
        payment_method,
        payment_date,
        note,
        external_reference,
        created_at,
        updated_at,
        created_by,
        last_modified_by,
        is_voided,
        voided_at,
        voided_by,
        void_reason
      ),
      sale_refunds (
        id,
        refund_reference,
        amount,
        refund_method,
        refund_date,
        reason,
        external_reference,
        note,
        status,
        created_at,
        updated_at,
        created_by,
        updated_by,
        is_voided,
        voided_at,
        voided_by,
        void_reason
      )
    `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        const { data: fallbackData, error: fallbackError } = await supabase
            .from("sales")
            .select(
                `
	      id,
	      sale_number,
	      vehicle_id,
      buyer_customer_id,
      sale_date,
      sale_type,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      status,
      payment_status,
      datev_status,
      notes,
      created_at,
      vehicles (
        internal_number,
        manufacturer,
        model,
        vehicle_type,
        vin,
        license_plate,
        construction_year,
        first_registration,
        purchase_price_net,
        sale_price_net,
        additional_costs_net,
        damage_notes,
        show_damage_on_invoice
      ),
      customers:buyer_customer_id (
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
        vat_id,
        commercial_register_number
      ),
      invoices (
        id,
        invoice_type,
        invoice_number,
        invoice_date,
        net_amount,
        vat_amount,
        gross_amount,
        status,
        payment_status,
        created_at
      ),
      documents (
        id,
        document_type,
        source,
        status,
        file_name,
        file_path,
        mime_type,
        file_size,
        created_at
      ),
      sale_payments (
        id,
        payment_reference,
        amount,
        payment_method,
        payment_date,
        note,
        external_reference,
        created_at,
        updated_at,
        created_by,
        last_modified_by,
        is_voided,
        voided_at,
        voided_by,
        void_reason
      )
    `,
            )
            .eq("id", saleId)
            .eq("company_id", companyId)
            .single();

        if (fallbackError || !fallbackData) {
            console.error("[sales] sale detail query failed", error ?? fallbackError);
            notFound();
        }

        return buildSaleDetail(mapLegacySaleDetailRow(fallbackData as unknown as LegacySaleDetailQueryRow));
    }

    return buildSaleDetail(data as unknown as SaleDetailQueryRow);
}

function buildSaleDetail(sale: SaleDetailQueryRow): SaleDetail {
    if (!sale.vehicles || !sale.customers) {
        throw new Error("Verkaufsakte ist unvollständig. Kunde oder Fahrzeug fehlt.");
    }

    const invoices = getManyRelation(sale.invoices)
        .map((invoice) => ({
            id: invoice.id,
            invoice_type: invoice.invoice_type ?? "standard",
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            net_amount: Number(invoice.net_amount),
            vat_amount: Number(invoice.vat_amount),
            gross_amount: Number(invoice.gross_amount),
            status: invoice.status,
            payment_status: invoice.payment_status,
            correction_of_invoice_id: invoice.correction_of_invoice_id,
            root_invoice_id: invoice.root_invoice_id,
            correction_reason_code: invoice.correction_reason_code,
            correction_reason_text: invoice.correction_reason_text,
            customer_visible_reason: invoice.customer_visible_reason,
            correction_scope: invoice.correction_scope,
            correction_status: invoice.correction_status,
            corrected_gross_amount:
                invoice.corrected_gross_amount === null
                    ? null
                    : Number(invoice.corrected_gross_amount),
            original_invoice_number: invoice.original_invoice_number,
            original_invoice_date: invoice.original_invoice_date,
            include_signature_stamp: Boolean(invoice.include_signature_stamp),
            pdf_document_id: invoice.pdf_document_id,
            email_sent_at: invoice.email_sent_at,
            email_sent_to: invoice.email_sent_to,
            email_sent_language: invoice.email_sent_language,
            email_send_count: invoice.email_send_count ?? 0,
            zugferd_file_path: invoice.zugferd_file_path,
            zugferd_generated_at: invoice.zugferd_generated_at,
            zugferd_profile: invoice.zugferd_profile,
            zugferd_standard_version: invoice.zugferd_standard_version,
            zugferd_validation_status: invoice.zugferd_validation_status,
            zugferd_validated_at: invoice.zugferd_validated_at,
            zugferd_validation_summary: invoice.zugferd_validation_summary,
            zugferd_sha256: invoice.zugferd_sha256,
            zugferd_email_sent_at: invoice.zugferd_email_sent_at,
            zugferd_email_sent_to: invoice.zugferd_email_sent_to,
            zugferd_email_sent_language: invoice.zugferd_email_sent_language,
            zugferd_email_send_count: invoice.zugferd_email_send_count ?? 0,
            created_at: invoice.created_at,
        }))
        .sort((a, b) => {
            const typeSort =
                getInvoiceSortWeight(a.invoice_type) -
                getInvoiceSortWeight(b.invoice_type);

            if (typeSort !== 0) return typeSort;

            return a.created_at.localeCompare(b.created_at);
        });

    const mainInvoice =
        invoices.find((invoice) => invoice.invoice_type === "standard") ??
        invoices[0] ??
        null;

    const documents = getManyRelation(sale.documents).map((document) => ({
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

    const saleType = sale.sale_type ?? "inland";
    const payments = getManyRelation(sale.sale_payments)
        .map((payment) => ({
            id: payment.id,
            payment_reference: payment.payment_reference,
            amount: Number(payment.amount),
            payment_method: payment.payment_method,
            payment_date: payment.payment_date,
            note: payment.note,
            external_reference: payment.external_reference,
            created_at: payment.created_at,
            updated_at: payment.updated_at,
            created_by: payment.created_by,
            last_modified_by: payment.last_modified_by,
            is_voided: Boolean(payment.is_voided),
            voided_at: payment.voided_at,
            voided_by: payment.voided_by,
            void_reason: payment.void_reason,
        }))
        .sort((a, b) => {
            const dateSort = b.payment_date.localeCompare(a.payment_date);

            if (dateSort !== 0) return dateSort;

            return b.created_at.localeCompare(a.created_at);
        });
    const refunds = getManyRelation(sale.sale_refunds)
        .map((refund) => ({
            id: refund.id,
            refund_reference: refund.refund_reference,
            amount: Number(refund.amount),
            refund_method: refund.refund_method,
            refund_date: refund.refund_date,
            reason: refund.reason,
            external_reference: refund.external_reference,
            note: refund.note,
            status: refund.status,
            created_at: refund.created_at,
            updated_at: refund.updated_at,
            created_by: refund.created_by,
            updated_by: refund.updated_by,
            is_voided: Boolean(refund.is_voided),
            voided_at: refund.voided_at,
            voided_by: refund.voided_by,
            void_reason: refund.void_reason,
        }))
        .sort((a, b) => {
            const dateSort = b.refund_date.localeCompare(a.refund_date);

            if (dateSort !== 0) return dateSort;

            return b.created_at.localeCompare(a.created_at);
        });

    const requiredDocuments = getRequiredDocumentsForSale({
        saleType,
        isCompanyCustomer: sale.customers.type === "company",
    });

    const requiredDocumentStatuses = requiredDocuments.map((requiredDocument) => {
        const acceptedDocumentTypes =
            requiredDocument.acceptedDocumentTypes ?? [
                requiredDocument.documentType,
            ];

        const matchingDocument =
            documents.find(
                (document) =>
                    acceptedDocumentTypes.includes(document.document_type) &&
                    document.status === "available",
            ) ?? null;

        return {
            ...requiredDocument,
            isAvailable: Boolean(matchingDocument),
            document: matchingDocument,
        };
    });

    const availableRequiredDocumentsCount = requiredDocumentStatuses.filter(
        (document) => document.isAvailable,
    ).length;
    const missingRequiredLabels = requiredDocumentStatuses
        .filter((document) => !document.isAvailable)
        .map((document) => document.label);

    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: sale.customers.type,
        deliveryType: saleType,
        billingCountry: sale.customers.country,
    });
    const missingRequiredDataLabels = [
        taxConfiguration.showTaxNumber && !sale.customers.tax_number
            ? "Steuernummer beim Kunden fehlt."
            : null,
        taxConfiguration.showVatId && !sale.customers.vat_id
            ? "USt-IdNr. beim Kunden fehlt."
            : null,
    ].filter((label): label is string => Boolean(label));

    const purchasePriceNet = Number(sale.vehicles.purchase_price_net ?? 0);
    const additionalCostsNet = Number(sale.vehicles.additional_costs_net ?? 0);
    const netAmount = Number(sale.net_amount);
    const grossAmount = Number(sale.gross_amount);
    const paidAmount = calculatePaidAmount(payments);
    const remainingAmount = calculateRemainingAmount(grossAmount, payments);
    const paymentStatus = calculatePaymentStatus(grossAmount, payments);
    const correctionCalculation = new CorrectionCalculationService();
    const standardInvoice =
        invoices.find((invoice) => invoice.invoice_type === "standard") ?? null;
    const correctionInvoices = standardInvoice
        ? invoices.filter(
              (invoice) =>
                  (invoice.invoice_type === "cancellation_invoice" ||
                      invoice.invoice_type === "credit_note") &&
                  invoice.correction_status !== "VOIDED" &&
                  (invoice.root_invoice_id === standardInvoice.id ||
                      invoice.correction_of_invoice_id === standardInvoice.id),
          )
        : [];
    const existingCorrectionGrossAmount = correctionInvoices.reduce(
        (sum, invoice) => sum + Math.abs(invoice.gross_amount),
        0,
    );
    const effectiveInvoiceAmount = Math.max(
        grossAmount - existingCorrectionGrossAmount,
        0,
    );
    const refundedAmount = refunds
        .filter((refund) => !refund.is_voided)
        .reduce((sum, refund) => sum + refund.amount, 0);
    const refundInputs = refunds.map((refund) => ({
        amount: refund.amount,
        isVoided: refund.is_voided,
    }));
    const outstandingRefundAmount =
        correctionCalculation.calculateOutstandingRefundAmount({
            paidAmount,
            effectiveInvoiceAmount,
            refunds: refundInputs,
        });

    return {
        id: sale.id,
        sale_number: sale.sale_number,
        sale_date: sale.sale_date,
        sale_type: saleType,
        status: sale.status,
        payment_status: paymentStatus,
        datev_status: sale.datev_status,
        notes: sale.notes,
        invoice_notes: sale.invoice_notes,
        include_damage_notes_on_invoice: Boolean(
            sale.include_damage_notes_on_invoice,
        ),
        has_signature_stamp_assets: Boolean(
            sale.companies?.signature_image_path && sale.companies?.stamp_image_path,
        ),

        net_amount: netAmount,
        vat_rate: Number(sale.vat_rate),
        vat_amount: Number(sale.vat_amount),
        gross_amount: grossAmount,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        profit_net: netAmount - purchasePriceNet - additionalCostsNet,

        customer: {
            id: sale.buyer_customer_id,
            type: sale.customers.type,
            name: getCustomerName(sale.customers),
            company_name: sale.customers.company_name,
            owner_name: sale.customers.owner_name,
            first_name: sale.customers.first_name,
            last_name: sale.customers.last_name,
            street: sale.customers.street,
            postal_code: sale.customers.postal_code,
            city: sale.customers.city,
            country: sale.customers.country,
            email: sale.customers.email,
            preferred_language: sale.customers.preferred_language,
            phone: sale.customers.phone,
            tax_number: sale.customers.tax_number,
            vat_id: sale.customers.vat_id,
            commercial_register_number: sale.customers.commercial_register_number,
        },

        vehicle: {
            id: sale.vehicle_id,
            internal_number: sale.vehicles.internal_number,
            manufacturer: sale.vehicles.manufacturer,
            model: sale.vehicles.model,
            name: `${sale.vehicles.manufacturer} ${sale.vehicles.model}`,
            vehicle_type: sale.vehicles.vehicle_type,
            vin: sale.vehicles.vin,
            license_plate: sale.vehicles.license_plate,
            construction_year: sale.vehicles.construction_year,
            first_registration: sale.vehicles.first_registration,
            purchase_price_net: purchasePriceNet,
            sale_price_net:
                sale.vehicles.sale_price_net === null
                    ? null
                    : Number(sale.vehicles.sale_price_net),
            additional_costs_net: additionalCostsNet,
            damage_notes: sale.vehicles.damage_notes,
            show_damage_on_invoice: Boolean(sale.vehicles.show_damage_on_invoice),
        },

        invoice: mainInvoice,
        invoices,
        payments,
        refunds,
        correction_summary: {
            original_invoice_id: standardInvoice?.id ?? null,
            existing_correction_gross_amount: existingCorrectionGrossAmount,
            remaining_correctable_amount: standardInvoice
                ? correctionCalculation.calculateRemainingCorrectableAmount({
                      originalGrossAmount: standardInvoice.gross_amount,
                      corrections: correctionInvoices.map((invoice) => ({
                          grossAmount: invoice.gross_amount,
                          status: invoice.correction_status,
                      })),
                  })
                : 0,
            effective_invoice_amount: effectiveInvoiceAmount,
            refunded_amount: refundedAmount,
            outstanding_refund_amount: outstandingRefundAmount,
            refund_status: correctionCalculation.calculateRefundStatus({
                paidAmount,
                effectiveInvoiceAmount,
                refunds: refundInputs,
            }),
        },

        documents,
        required_documents: requiredDocumentStatuses,
        required_documents_count: requiredDocumentStatuses.length,
        available_required_documents_count: availableRequiredDocumentsCount,
        missing_required_documents_count:
            requiredDocumentStatuses.length - availableRequiredDocumentsCount,
        missing_required_labels: missingRequiredLabels,
        missing_required_data_labels: missingRequiredDataLabels,
    };
}
