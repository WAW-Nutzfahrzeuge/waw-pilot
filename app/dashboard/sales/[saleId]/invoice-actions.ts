"use server";

import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import { getOptionalCurrentAuthUserId } from "@/lib/auth/current-user";
import {
    getInvoiceTypeDocumentType,
    getInvoiceTypeLabel,
    getNextInvoiceNumber,
    type InvoiceType,
} from "@/lib/invoices/invoice-numbering";
import {
    getInvoiceEmailTemplate,
    getZugferdInvoiceEmailTemplate,
} from "@/lib/email/templates/invoice-email";
import { getInvoiceMailSender } from "@/lib/email/company-mail-sender";
import { getSuggestedEmailLanguage } from "@/lib/customers/email-languages";
import { EmailConfigurationError } from "@/lib/email/resend";
import { calculateInvoiceDueDate } from "@/lib/invoices/payment-terms";
import { assertCompanySignatureStampConfigured } from "@/lib/pdf/company-signature-assets";
import { buildFinalInvoicePdf, getCompanyTermsPdf } from "@/lib/pdf/company-terms";
import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { generateAndStoreInvoicePdf } from "@/lib/pdf/invoice-storage";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    getSaleTaxConfiguration,
    type SaleBuyerType,
} from "@/utils/sale-tax-rules";
import {
    buildCanonicalInvoiceData,
    ZugferdDataValidationError,
    type ZugferdValidationIssue,
} from "@/lib/zugferd/canonical-invoice";
import {
    generateValidatedZugferdPdf,
    startZugferdGenerationJob,
    ZugferdServiceRequestError,
    ZugferdServiceConfigurationError,
    ZugferdServiceValidationError,
    type ZugferdServiceValidationSummary,
} from "@/lib/zugferd/zugferd-service-client";
import { createSendEmailUseCase } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";
import {
    sendDatevInvoice,
    type DatevInvoiceCandidate,
} from "@/lib/invoices/datev-invoice-delivery";
import { isDatevInvoiceSendable } from "@/lib/invoices/datev-invoice-rules";
import { EmailAttachmentNotFoundError } from "@/src/modules/email/domain/errors/email-errors";

type SaleInvoiceVehicleRelation = {
    damage_notes: string | null;
    show_damage_on_invoice: boolean | null;
};

type RegenerateInvoiceOptionsRow = {
    id: string;
    sale_id: string;
    invoice_type: InvoiceType | null;
    invoice_number: string;
    include_signature_stamp: boolean | null;
    include_terms_pdf?: boolean | null;
    pdf_document_id: string | null;
    zugferd_file_path?: string | null;
};

type SaleInvoiceSourceRow = {
    id: string;
    company_id: string;
    sale_number: string | null;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    sale_type: string | null;
    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    invoice_notes: string | null;
    include_damage_notes_on_invoice: boolean | null;
    vehicles: SaleInvoiceVehicleRelation | SaleInvoiceVehicleRelation[] | null;
    customers?:
        | {
              type: "company" | "private" | null;
              country: string | null;
              vat_id: string | null;
          }
        | Array<{
              type: "company" | "private" | null;
              country: string | null;
              vat_id: string | null;
          }>
        | null;
};

type InvoiceEmailDocumentRelation = {
    id: string;
    file_name: string | null;
    file_path: string | null;
    mime_type: string | null;
};

type InvoiceEmailCustomerRelation = {
    type: "company" | "private";
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    preferred_language: string | null;
    country: string | null;
};

type InvoiceEmailQueryRow = {
    id: string;
    sale_id: string | null;
    invoice_number: string;
    invoice_type: InvoiceType;
    email_send_count: number | null;
    pdf_document_id: string | null;
    customers: InvoiceEmailCustomerRelation | InvoiceEmailCustomerRelation[] | null;
    documents:
        | InvoiceEmailDocumentRelation
        | InvoiceEmailDocumentRelation[]
        | null;
};

async function resolveStoredInvoicePdfDocumentId(params: {
    supabase: ReturnType<typeof createServerSupabaseClient>;
    companyId: string;
    saleId: string;
    invoice: InvoiceEmailQueryRow;
}): Promise<string | null> {
    if (params.invoice.pdf_document_id) {
        return params.invoice.pdf_document_id;
    }

    // Legacy invoices can already have a stored document even though the
    // pointer introduced later on invoices was never backfilled. Resolve only
    // a tenant-, sale- and invoice-scoped PDF; never generate a new PDF as a
    // side effect of sending an email.
    const { data: existingDocument, error } = await params.supabase
        .from("documents")
        .select("id")
        .eq("company_id", params.companyId)
        .eq("sale_id", params.saleId)
        .eq("invoice_id", params.invoice.id)
        .eq(
            "document_type",
            getInvoiceTypeDocumentType(params.invoice.invoice_type),
        )
        .not("file_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("[email] stored invoice PDF lookup failed", error);
        return null;
    }

    const documentId = (existingDocument?.id as string | undefined) ?? null;
    if (!documentId) return null;

    const { error: linkError } = await params.supabase
        .from("invoices")
        .update({ pdf_document_id: documentId })
        .eq("id", params.invoice.id)
        .eq("sale_id", params.saleId)
        .eq("company_id", params.companyId)
        .is("pdf_document_id", null);

    if (linkError) {
        // The resolved document remains safe to use for this request. A failed
        // repair must not force PDF regeneration or block delivery.
        console.error("[email] invoice PDF link backfill failed", linkError);
    }

    return documentId;
}

function revalidateInvoiceDocumentPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/invoices",
        "/dashboard/documents",
    ]);
}

function revalidateInvoiceCreationPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/activities",
    ]);
}

function revalidateInvoiceEmailPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/invoices",
        "/dashboard/activities",
        "/dashboard/emails",
    ]);
}

type ZugferdInvoiceEmailQueryRow = {
    id: string;
    sale_id: string | null;
    invoice_number: string;
    zugferd_file_path: string | null;
    zugferd_validation_status: string | null;
    zugferd_email_send_count: number | null;
    customers: InvoiceEmailCustomerRelation | InvoiceEmailCustomerRelation[] | null;
};

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function isValidEmailAddress(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMissingIncludeTermsPdfColumn(error: { message?: string; code?: string } | null): boolean {
    if (!error) return false;

    return (
        error.code === "42703" ||
        Boolean(error.message?.includes("invoices.include_terms_pdf"))
    );
}

function getSingleRelation<T>(relation: T | T[] | null): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function getInvoiceTypeValue(formData: FormData): InvoiceType | null {
    const value = getStringValue(formData, "invoice_type");

    if (value === "standard" || value === "proforma") {
        return value;
    }

    return null;
}

function removePlannedNetSalePriceNote(existingNotes: string | null): string | null {
    if (!existingNotes?.trim()) return existingNotes;

    const nextNotes = existingNotes
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(
            (part) =>
                !/^Geplanter Netto-VK laut Fahrzeugbestand: .+ netto$/i.test(part),
        )
        .join("\n\n")
        .trim();

    return nextNotes.length > 0 ? nextNotes : null;
}

function canIncludeVehicleDamageNotes(vehicle: SaleInvoiceVehicleRelation | null): boolean {
    return Boolean(vehicle?.damage_notes?.trim());
}

function getInvoiceActivityLabel(invoiceType: InvoiceType): string {
    if (invoiceType === "standard") return "Rechnung";
    if (invoiceType === "proforma") return "Proforma-Rechnung";

    return getInvoiceTypeLabel(invoiceType);
}

function getInvoiceEmailErrorRedirect(
    saleId: string,
    invoiceId: string,
    errorCode: string,
): string {
    return `/dashboard/sales/${saleId}?invoiceEmailError=${errorCode}&highlightInvoiceId=${invoiceId}`;
}

function getCustomerNameForEmail(
    customer: InvoiceEmailCustomerRelation,
): string {
    if (customer.type === "company") {
        return customer.company_name ?? "Kunde";
    }

    return [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Kunde";
}

function getInvoiceEmailSuccessRedirect(
    saleId: string,
    invoiceId: string,
    email: string,
): string {
    return `/dashboard/sales/${saleId}?invoiceEmailSent=${encodeURIComponent(
        email,
    )}&highlightInvoiceId=${invoiceId}`;
}

function getDatevInvoiceErrorRedirect(
    saleId: string,
    invoiceId: string,
    errorCode: string,
): string {
    return `/dashboard/sales/${saleId}?datevInvoiceError=${errorCode}&highlightInvoiceId=${invoiceId}`;
}

function getDatevInvoiceSuccessRedirect(saleId: string, invoiceId: string): string {
    return `/dashboard/sales/${saleId}?datevInvoiceSent=1&highlightInvoiceId=${invoiceId}`;
}

function getZugferdErrorRedirect(
    saleId: string,
    invoiceId: string,
    errorCode: string,
    missingFields: string[] = [],
): string {
    const params = new URLSearchParams({
        zugferdError: errorCode,
        highlightInvoiceId: invoiceId,
    });

    if (missingFields.length > 0) {
        params.set("zugferdMissing", missingFields.join("|"));
    }

    return `/dashboard/sales/${saleId}?${params.toString()}`;
}

function getZugferdSuccessRedirect(
    saleId: string,
    invoiceId: string,
    successCode: "created" | "queued" | "sent",
    email?: string,
): string {
    const params = new URLSearchParams({
        highlightInvoiceId: invoiceId,
    });

    if (successCode === "created") {
        params.set("zugferdCreated", "1");
    } else if (successCode === "queued") {
        params.set("zugferdQueued", "1");
    } else if (email) {
        params.set("zugferdEmailSent", email);
    }

    return `/dashboard/sales/${saleId}?${params.toString()}`;
}

function getZugferdIssueMessages(issues: ZugferdValidationIssue[]): string[] {
    const messages = issues
        .filter((issue) => issue.severity === "error")
        .filter((issue) => !issue.ruleId?.endsWith("_REPORT"))
        .map((issue) => issue.message)
        .filter((message) => message.trim().length > 0);

    return Array.from(new Set(messages));
}

function getZugferdValidationSummaryForStorage(
    validation: ZugferdServiceValidationSummary,
): Record<string, unknown> {
    return {
        status: validation.status,
        mustangVersion: validation.mustangVersion ?? null,
        veraPdfVersion: validation.veraPdfVersion ?? null,
        xmlValid: validation.xmlValid,
        pdfAValid: validation.pdfAValid,
        consistencyValid: validation.consistencyValid,
        issues: validation.issues,
        blockingErrors: validation.blockingErrors ?? [],
        warnings: validation.warnings ?? [],
        profileNotices: validation.profileNotices ?? [],
    };
}

async function markZugferdInvalid(
    invoiceId: string,
    companyId: string,
    issues: ZugferdValidationIssue[],
) {
    const supabase = createServerSupabaseClient();

    const { error } = await supabase
        .from("invoices")
        .update({
            zugferd_validation_status: "invalid",
            zugferd_generation_started_at: null,
            zugferd_validation_summary: {
                status: "invalid",
                issues,
            },
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (error) {
        console.error("[zugferd] invalid status update failed", error);
    }
}

export async function createSaleInvoiceAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceType = getInvoiceTypeValue(formData);
    const requestedIncludeDamageNotesOnInvoice =
        getStringValue(formData, "include_damage_notes_on_invoice") === "yes";
    const includeSignatureStamp =
        getStringValue(formData, "include_signature_stamp") === "yes";
    const includeTermsPdf =
        getStringValue(formData, "include_terms_pdf") !== "no";

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!invoiceType) {
        throw new Error("Dieser Rechnungstyp kann in der Verkaufsakte nicht mehr erstellt werden.");
    }

    if (includeSignatureStamp) {
        await assertCompanySignatureStampConfigured();
    }

    const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select(
            `
      id,
      company_id,
      sale_number,
      vehicle_id,
      buyer_customer_id,
      sale_date,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      invoice_notes,
      include_damage_notes_on_invoice,
      vehicles (
        damage_notes,
        show_damage_on_invoice
      )
    `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (saleError || !saleData) {
        throw new Error(
            `Verkauf konnte nicht geladen werden: ${
                saleError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const sale = saleData as SaleInvoiceSourceRow;
    const saleVehicle = getSingleRelation(sale.vehicles);
    const includeDamageNotesOnInvoice =
        requestedIncludeDamageNotesOnInvoice &&
        canIncludeVehicleDamageNotes(saleVehicle);
    const nextInvoiceNotes = removePlannedNetSalePriceNote(sale.invoice_notes);

    if (
        Boolean(sale.include_damage_notes_on_invoice) !==
        includeDamageNotesOnInvoice ||
        (nextInvoiceNotes ?? null) !== (sale.invoice_notes ?? null)
    ) {
        const { error: saleUpdateError } = await supabase
            .from("sales")
            .update({
                include_damage_notes_on_invoice: includeDamageNotesOnInvoice,
                invoice_notes: nextInvoiceNotes,
            })
            .eq("id", saleId)
            .eq("company_id", companyId);

        if (saleUpdateError) {
            throw new Error(
                `Rechnungsoption konnte nicht gespeichert werden: ${saleUpdateError.message}`,
            );
        }
    }

    const { data: existingInvoiceData, error: existingInvoiceError } =
        await supabase
            .from("invoices")
            .select("id, invoice_number")
            .eq("company_id", companyId)
            .eq("sale_id", saleId)
            .eq("invoice_type", invoiceType)
            .maybeSingle();

    if (existingInvoiceError) {
        throw new Error(
            `Vorhandene ${getInvoiceTypeLabel(invoiceType)} konnte nicht geprüft werden: ${
                existingInvoiceError.message
            }`,
        );
    }

    if (existingInvoiceData) {
        revalidateInvoiceDocumentPaths(saleId);

        redirect(`/dashboard/sales/${saleId}`);
    }

    let sourceProformaInvoiceId: string | null = null;
    let sourceProformaInvoiceNumber: string | null = null;

    if (invoiceType === "standard") {
        const { data: existingProformaData, error: existingProformaError } =
            await supabase
                .from("invoices")
                .select("id, invoice_number")
                .eq("company_id", companyId)
                .eq("sale_id", saleId)
                .eq("invoice_type", "proforma")
                .is("source_proforma_invoice_id", null)
                .maybeSingle();

        if (existingProformaError) {
            throw new Error(
                `Vorhandene Proforma-Rechnung konnte nicht geprüft werden: ${existingProformaError.message}`,
            );
        }

        sourceProformaInvoiceId = existingProformaData?.id ?? null;
        sourceProformaInvoiceNumber =
            (existingProformaData?.invoice_number as string | undefined) ?? null;
    }

    const invoiceNumber = await getNextInvoiceNumber({
        invoiceType,
        invoiceDate: sale.sale_date,
    });

    const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
            company_id: companyId,
            sale_id: sale.id,
            customer_id: sale.buyer_customer_id,
            vehicle_id: sale.vehicle_id,
            invoice_type: invoiceType,
            invoice_number: invoiceNumber,
            invoice_date: sale.sale_date,
            due_date: calculateInvoiceDueDate(sale.sale_date),
            net_amount: Number(sale.net_amount),
            vat_rate: Number(sale.vat_rate),
            vat_amount: Number(sale.vat_amount),
            gross_amount: Number(sale.gross_amount),
            status: "created",
            payment_status: "open",
            datev_status: "not_sent",
            include_signature_stamp: includeSignatureStamp,
            include_terms_pdf: includeTermsPdf,
            paid_at: null,
            source_proforma_invoice_id: sourceProformaInvoiceId,
        })
        .select("id")
        .single();

    if (invoiceError || !invoiceData) {
        // Race protection: two concurrent requests (doubleclick, two tabs)
        // can both pass the existence checks above before either INSERT
        // completes. The database-level unique index (see migration
        // 20260926190000_add_proforma_conversion_safeguards.sql) then
        // rejects the second INSERT instead of creating a duplicate
        // standard/proforma invoice for this sale.
        if (invoiceError?.code === "23505") {
            revalidateInvoiceCreationPaths(saleId);

            redirect(
                `/dashboard/sales/${saleId}?invoiceActionError=${
                    invoiceType === "proforma"
                        ? "proformaAlreadyExists"
                        : "invoiceAlreadyExists"
                }`,
            );
        }

        throw new Error(
            `${getInvoiceTypeLabel(invoiceType)} konnte nicht erzeugt werden: ${
                invoiceError?.message ?? "Keine Rechnungs-ID erhalten"
            }`,
        );
    }

    const invoiceId = invoiceData.id as string;
    const invoiceLabel = getInvoiceActivityLabel(invoiceType);

    // If this number came from the manual gap-fill reservation queue (see
    // 20260925182900_reserve_gap_invoice_numbers.sql), record which invoice
    // finally consumed it for auditability. No-op for normal, counter-based
    // numbers since no reservation row will match.
    await supabase
        .from("invoice_number_reservations")
        .update({ used_by_invoice_id: invoiceId })
        .eq("company_id", companyId)
        .eq("invoice_number", invoiceNumber);

    await logActivity({
        action: sourceProformaInvoiceId
            ? `${invoiceLabel} ${invoiceNumber} erzeugt (aus Proforma-Rechnung erstellt)`
            : `${invoiceLabel} ${invoiceNumber} erzeugt`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    const invoiceFileName = new ExportFileNamePolicy().createDocumentFileName({
        saleReference: invoiceNumber,
        documentType: getInvoiceTypeDocumentType(invoiceType),
        mimeType: "application/pdf",
    });
    const invoiceFilePath = `invoices/${invoiceFileName}`;

    const { data: documentData, error: documentError } = await supabase
        .from("documents")
        .insert({
            company_id: companyId,
            document_type: getInvoiceTypeDocumentType(invoiceType),
            source: "generated",
            status: "needs_review",
            file_name: invoiceFileName,
            file_path: invoiceFilePath,
            mime_type: "application/pdf",
            file_size: null,
            customer_id: sale.buyer_customer_id,
            vehicle_id: sale.vehicle_id,
            sale_id: sale.id,
            invoice_id: invoiceId,
            generated_by_system: true,
        })
        .select("id")
        .single();

    if (documentError || !documentData) {
        throw new Error(
            `${getInvoiceTypeLabel(invoiceType)} wurde erzeugt, aber Dokument konnte nicht angelegt werden: ${
                documentError?.message ?? "Keine Dokument-ID erhalten"
            }`,
        );
    }

    const documentId = documentData.id as string;

    const { error: invoiceDocumentLinkError } = await supabase
        .from("invoices")
        .update({
            pdf_document_id: documentId,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (invoiceDocumentLinkError) {
        throw new Error(
            `Dokument wurde angelegt, aber nicht mit der Rechnung verknüpft: ${invoiceDocumentLinkError.message}`,
        );
    }

    try {
        const storedPdf = await generateAndStoreInvoicePdf(invoiceId);

        const { error: documentUpdateError } = await supabase
            .from("documents")
            .update({
                status: "available",
                file_name: storedPdf.fileName,
                file_path: storedPdf.filePath,
                file_size: storedPdf.fileSize,
            })
            .eq("id", documentId)
            .eq("company_id", companyId);

        if (documentUpdateError) {
            throw new Error(
                `PDF wurde gespeichert, aber Dokumentdaten konnten nicht aktualisiert werden: ${documentUpdateError.message}`,
            );
        }
    } catch (error) {
        throw new Error(
            error instanceof Error
                ? error.message
                : "PDF konnte nicht im Storage gespeichert werden.",
        );
    }

    // Diese finale Rechnung entstand aus einer Proforma-Rechnung ("In
    // Rechnung umwandeln") - die Proforma bleibt als Datensatz erhalten,
    // wird aber als umgewandelt markiert, damit sie nicht mehr wie eine
    // offene Proforma behandelt wird (siehe SaleInvoiceTypeActions/Zustand 3).
    // Ein Fehler hier soll die bereits erfolgreich erstellte finale Rechnung
    // nicht als fehlgeschlagen erscheinen lassen, deshalb nur geloggt.
    if (sourceProformaInvoiceId) {
        const { error: proformaConversionError } = await supabase
            .from("invoices")
            .update({ status: "converted" })
            .eq("id", sourceProformaInvoiceId)
            .eq("company_id", companyId);

        if (proformaConversionError) {
            console.error(
                "[invoice-actions] Proforma konnte nicht als umgewandelt markiert werden",
                proformaConversionError,
            );
        }
    }

    revalidateInvoiceCreationPaths(saleId);

    redirect(
        `/dashboard/sales/${saleId}?invoiceCreated=${encodeURIComponent(
            invoiceNumber,
        )}${
            sourceProformaInvoiceNumber
                ? `&invoiceConvertedFrom=${encodeURIComponent(sourceProformaInvoiceNumber)}`
                : ""
        }&highlightInvoiceId=${invoiceId}`,
    );
}

type DeletableProformaRow = {
    id: string;
    sale_id: string;
    invoice_type: InvoiceType;
    invoice_number: string;
    status: string;
};

/**
 * Löscht eine noch nicht umgewandelte Proforma-Rechnung inklusive ihres
 * generierten PDF-Dokuments (DB-Zeile + Storage-Objekt).
 *
 * Bewusst NUR für invoice_type "proforma" ohne source_proforma_invoice_id-
 * Verweis einer finalen Rechnung: Eine finale Rechnung mit vergebener
 * Rechnungsnummer darf laut bestehender Fachlogik nie hart gelöscht werden
 * (steuerlich relevante Historie) - dafür existiert der Storno-/
 * Korrekturprozess (SaleCorrectionsCard/correction-actions.ts). Die
 * Proforma-Nummer selbst wird nicht in den Nummernkreis zurückgelegt, der
 * Counter zählt beim Löschen nicht zurück.
 */
export async function deleteProformaInvoiceAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!invoiceId) throw new Error("Proforma-Rechnung fehlt.");

    const { data: invoiceRow, error: invoiceLoadError } = await supabase
        .from("invoices")
        .select("id, sale_id, invoice_type, invoice_number, status")
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .eq("sale_id", saleId)
        .maybeSingle();

    if (invoiceLoadError) {
        throw new Error(
            `Proforma-Rechnung konnte nicht geladen werden: ${invoiceLoadError.message}`,
        );
    }

    if (!invoiceRow) {
        redirect(
            `/dashboard/sales/${saleId}?invoiceActionError=notFound`,
        );
    }

    const invoice = invoiceRow as DeletableProformaRow;

    if (invoice.invoice_type !== "proforma") {
        redirect(
            `/dashboard/sales/${saleId}?invoiceActionError=onlyProformaDeletable`,
        );
    }

    if (invoice.status === "converted") {
        redirect(
            `/dashboard/sales/${saleId}?invoiceActionError=alreadyConverted`,
        );
    }

    // Doppelte Absicherung: falls doch bereits eine finale Rechnung auf diese
    // Proforma verweist (z. B. Statusaktualisierung ist fehlgeschlagen),
    // trotzdem nicht löschen.
    const { data: linkedFinalInvoice, error: linkedFinalInvoiceError } =
        await supabase
            .from("invoices")
            .select("id")
            .eq("company_id", companyId)
            .eq("source_proforma_invoice_id", invoice.id)
            .maybeSingle();

    if (linkedFinalInvoiceError) {
        throw new Error(
            `Verknüpfte Rechnung konnte nicht geprüft werden: ${linkedFinalInvoiceError.message}`,
        );
    }

    if (linkedFinalInvoice) {
        redirect(
            `/dashboard/sales/${saleId}?invoiceActionError=alreadyConverted`,
        );
    }

    const { data: linkedDocuments, error: linkedDocumentsError } =
        await supabase
            .from("documents")
            .select("id, file_path")
            .eq("company_id", companyId)
            .eq("invoice_id", invoice.id);

    if (linkedDocumentsError) {
        throw new Error(
            `Rechnungsdokumente konnten nicht geladen werden: ${linkedDocumentsError.message}`,
        );
    }

    const storagePaths = (linkedDocuments ?? [])
        .map((document) => document.file_path as string | null)
        .filter((filePath): filePath is string => Boolean(filePath));

    if (storagePaths.length > 0) {
        const { error: storageRemoveError } = await supabase.storage
            .from("documents")
            .remove(storagePaths);

        // Best-effort: fehlende/bereits gelöschte Storage-Objekte sollen das
        // Löschen der Proforma nicht verhindern, werden aber geloggt.
        if (storageRemoveError) {
            console.error(
                "[invoice-actions] Storage-Objekte der Proforma konnten nicht entfernt werden",
                storageRemoveError,
            );
        }
    }

    if ((linkedDocuments ?? []).length > 0) {
        const { error: documentsDeleteError } = await supabase
            .from("documents")
            .delete()
            .eq("company_id", companyId)
            .eq("invoice_id", invoice.id);

        if (documentsDeleteError) {
            throw new Error(
                `Rechnungsdokumente konnten nicht gelöscht werden: ${documentsDeleteError.message}`,
            );
        }
    }

    const { error: invoiceDeleteError } = await supabase
        .from("invoices")
        .delete()
        .eq("id", invoice.id)
        .eq("company_id", companyId)
        .eq("invoice_type", "proforma");

    if (invoiceDeleteError) {
        throw new Error(
            `Proforma-Rechnung konnte nicht gelöscht werden: ${invoiceDeleteError.message}`,
        );
    }

    await logActivity({
        action: `Proforma-Rechnung ${invoice.invoice_number} gelöscht`,
        entityType: "invoice",
        entityId: invoice.id,
    });

    revalidateInvoiceCreationPaths(saleId);

    redirect(
        `/dashboard/sales/${saleId}?invoiceDeleted=${encodeURIComponent(
            invoice.invoice_number,
        )}`,
    );
}

export async function regenerateSaleInvoicePdfAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");
    const includeSignatureStamp =
        getStringValue(formData, "include_signature_stamp") === "yes";
    const includeTermsPdf =
        getStringValue(formData, "include_terms_pdf") !== "no";
    const requestedIncludeDamageNotesOnInvoice =
        getStringValue(formData, "include_damage_notes_on_invoice") === "yes";

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!invoiceId) {
        throw new Error("Rechnung fehlt.");
    }

    if (includeSignatureStamp) {
        await assertCompanySignatureStampConfigured();
    }

    const { data: invoiceDataWithTerms, error: invoiceErrorWithTerms } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      invoice_type,
      invoice_number,
      include_signature_stamp,
      include_terms_pdf,
      pdf_document_id,
      zugferd_file_path
    `,
        )
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    let invoiceData = invoiceDataWithTerms as RegenerateInvoiceOptionsRow | null;
    let invoiceError = invoiceErrorWithTerms;

    if (invoiceErrorWithTerms && isMissingIncludeTermsPdfColumn(invoiceErrorWithTerms)) {
        const fallback = await supabase
            .from("invoices")
            .select(
                `
      id,
      sale_id,
      invoice_type,
      invoice_number,
      include_signature_stamp,
      pdf_document_id,
      zugferd_file_path
    `,
            )
            .eq("id", invoiceId)
            .eq("company_id", companyId)
            .single();

        invoiceData = fallback.data
            ? {
                  ...(fallback.data as Omit<
                      RegenerateInvoiceOptionsRow,
                      "include_terms_pdf"
                  >),
                  include_terms_pdf: true,
              }
            : null;
        invoiceError = fallback.error;
    }

    if (invoiceError || !invoiceData) {
        throw new Error(
            `Rechnung konnte nicht geladen werden: ${
                invoiceError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    if (
        Boolean(invoiceData.include_signature_stamp) !== includeSignatureStamp ||
        (invoiceData.include_terms_pdf !== false) !== includeTermsPdf
    ) {
        const invoiceUpdate = await supabase
            .from("invoices")
            .update({
                include_signature_stamp: includeSignatureStamp,
                include_terms_pdf: includeTermsPdf,
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId);

        if (
            invoiceUpdate.error &&
            isMissingIncludeTermsPdfColumn(invoiceUpdate.error) &&
            includeTermsPdf
        ) {
            const fallbackUpdate = await supabase
                .from("invoices")
                .update({
                    include_signature_stamp: includeSignatureStamp,
                })
                .eq("id", invoiceId)
                .eq("company_id", companyId);

            if (fallbackUpdate.error) {
                throw new Error(
                    `Rechnungsoption konnte nicht gespeichert werden: ${fallbackUpdate.error.message}`,
                );
            }
        } else if (invoiceUpdate.error) {
            throw new Error(
                `Rechnungsoption konnte nicht gespeichert werden: ${invoiceUpdate.error.message}`,
            );
        }
    }

    const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select(
            `
      invoice_notes,
      include_damage_notes_on_invoice,
      sale_type,
      net_amount,
      vat_rate,
      vat_amount,
      gross_amount,
      customers:buyer_customer_id (
        type,
        country,
        vat_id
      ),
      vehicles (
        damage_notes,
        show_damage_on_invoice
      )
    `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (saleError || !saleData) {
        throw new Error(
            `Verkauf konnte nicht geladen werden: ${
                saleError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const sale = saleData as Pick<
        SaleInvoiceSourceRow,
        | "invoice_notes"
        | "include_damage_notes_on_invoice"
        | "vehicles"
        | "sale_type"
        | "net_amount"
        | "vat_rate"
        | "vat_amount"
        | "gross_amount"
        | "customers"
    >;
    const buyerCustomer = getSingleRelation(sale.customers ?? null);
    const buyerType: SaleBuyerType =
        buyerCustomer?.type === "private" ? "private" : "company";
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType,
        deliveryType: sale.sale_type,
        billingCountry: buyerCustomer?.country ?? null,
    });
    const nextVatRate = taxConfiguration.defaultVatRate;
    const currentVatRate = Number(sale.vat_rate);
    const shouldSyncTaxAmounts =
        (!taxConfiguration.showVatId || Boolean(buyerCustomer?.vat_id?.trim())) &&
        Number.isFinite(currentVatRate) &&
        currentVatRate !== nextVatRate &&
        ["standard", "proforma", "down_payment"].includes(
            invoiceData.invoice_type ?? "",
        );

    if (shouldSyncTaxAmounts) {
        const netAmount = Number(sale.net_amount);

        if (!Number.isFinite(netAmount)) {
            throw new Error("Verkaufspreis netto ist ungültig.");
        }

        const vatAmount = roundMoney(netAmount * (nextVatRate / 100));
        const grossAmount = roundMoney(netAmount + vatAmount);

        const { error: saleTaxUpdateError } = await supabase
            .from("sales")
            .update({
                vat_rate: nextVatRate,
                vat_amount: vatAmount,
                gross_amount: grossAmount,
            })
            .eq("id", saleId)
            .eq("company_id", companyId);

        if (saleTaxUpdateError) {
            throw new Error(
                `Verkauf konnte steuerlich nicht aktualisiert werden: ${saleTaxUpdateError.message}`,
            );
        }

        const { error: invoiceTaxUpdateError } = await supabase
            .from("invoices")
            .update({
                vat_rate: nextVatRate,
                vat_amount: vatAmount,
                gross_amount: grossAmount,
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId);

        if (invoiceTaxUpdateError) {
            throw new Error(
                `Rechnung konnte steuerlich nicht aktualisiert werden: ${invoiceTaxUpdateError.message}`,
            );
        }

        if (invoiceData.zugferd_file_path) {
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
                                    "Steuerbeträge wurden vor PDF-Neugenerierung angepasst. ZUGFeRD muss neu erzeugt werden.",
                            },
                        ],
                    },
                })
                .eq("id", invoiceId)
                .eq("company_id", companyId);

            if (zugferdUpdateError) {
                throw new Error(
                    `ZUGFeRD-Status konnte nach Steuerkorrektur nicht invalidiert werden: ${zugferdUpdateError.message}`,
                );
            }
        }

        await logActivity({
            action: `Steuerbeträge für Rechnung ${invoiceData.invoice_number} vor PDF-Neugenerierung aktualisiert (${nextVatRate}% MwSt.)`,
            entityType: "invoice",
            entityId: invoiceId,
        });
    }

    const saleVehicle = getSingleRelation(sale.vehicles);
    const includeDamageNotesOnInvoice =
        requestedIncludeDamageNotesOnInvoice &&
        canIncludeVehicleDamageNotes(saleVehicle);
    const nextInvoiceNotes = removePlannedNetSalePriceNote(sale.invoice_notes);

    if (
        (nextInvoiceNotes ?? null) !== (sale.invoice_notes ?? null) ||
        Boolean(sale.include_damage_notes_on_invoice) !== includeDamageNotesOnInvoice
    ) {
        const { error: saleUpdateError } = await supabase
            .from("sales")
            .update({
                invoice_notes: nextInvoiceNotes,
                include_damage_notes_on_invoice: includeDamageNotesOnInvoice,
            })
            .eq("id", saleId)
            .eq("company_id", companyId);

        if (saleUpdateError) {
            throw new Error(
                `Rechnungsoption konnte nicht gespeichert werden: ${saleUpdateError.message}`,
            );
        }
    }

    const storedPdf = await generateAndStoreInvoicePdf(invoiceId);

    if (invoiceData.pdf_document_id) {
        const { error: documentUpdateError } = await supabase
            .from("documents")
            .update({
                status: "available",
                file_name: storedPdf.fileName,
                file_path: storedPdf.filePath,
                file_size: storedPdf.fileSize,
                mime_type: "application/pdf",
            })
            .eq("id", invoiceData.pdf_document_id)
            .eq("company_id", companyId);

        if (documentUpdateError) {
            throw new Error(
                `PDF wurde erzeugt, aber Dokument konnte nicht aktualisiert werden: ${documentUpdateError.message}`,
            );
        }
    }

    await logActivity({
        action: `${getInvoiceActivityLabel(
            invoiceData.invoice_type as InvoiceType,
        )} ${invoiceData.invoice_number} PDF neu erzeugt`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/activities",
    ]);

    redirect(
        `/dashboard/sales/${saleId}?invoiceRegenerated=${encodeURIComponent(
            String(invoiceData.invoice_number),
        )}&highlightInvoiceId=${invoiceId}`,
    );
}

export async function updateSaleInvoiceNotesAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceNotes = getStringValue(formData, "invoice_notes");

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    const { error: saleUpdateError } = await supabase
        .from("sales")
        .update({
            invoice_notes: invoiceNotes,
        })
        .eq("id", saleId)
        .eq("company_id", companyId);

    if (saleUpdateError) {
        throw new Error(
            `Zusätzliche Vereinbarung konnte nicht gespeichert werden: ${saleUpdateError.message}`,
        );
    }

    const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("id, invoice_number, pdf_document_id")
        .eq("sale_id", saleId)
        .eq("company_id", companyId);

    if (invoicesError) {
        throw new Error(
            `Rechnungen konnten nicht geladen werden: ${invoicesError.message}`,
        );
    }

    const invoices = (invoicesData ?? []) as Array<{
        id: string;
        invoice_number: string;
        pdf_document_id: string | null;
    }>;

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
                `PDF wurde erzeugt, aber Dokument ${invoice.invoice_number} konnte nicht aktualisiert werden: ${documentUpdateError.message}`,
            );
        }
    }

    await logActivity({
        action:
            invoices.length > 0
                ? `Zusätzliche Vereinbarung gespeichert und ${invoices.length} Rechnungs-PDF${invoices.length === 1 ? "" : "s"} neu erzeugt`
                : "Zusätzliche Vereinbarung gespeichert",
        entityType: "sale",
        entityId: saleId,
    });

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/activities",
    ]);

    redirect(`/dashboard/sales/${saleId}?invoiceNotesSaved=1#invoice-agreement`);
}

export async function sendSaleInvoiceEmailAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");
    const additionalRecipientEmail = getStringValue(
        formData,
        "additional_recipient_email",
    )?.toLocaleLowerCase() ?? null;

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!invoiceId) {
        throw new Error("Rechnung fehlt.");
    }

    if (additionalRecipientEmail && !isValidEmailAddress(additionalRecipientEmail)) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "invalidAdditionalEmail"));
    }

    const { data, error } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      invoice_number,
      email_send_count,
      pdf_document_id,
      customers:customer_id (
        type,
        company_name,
        first_name,
        last_name,
        email,
        preferred_language,
        country
      )
    `,
        )
        .eq("id", invoiceId)
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        console.error("[email] invoice lookup failed", error);
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "sendFailed"));
    }

    const invoice = data as unknown as InvoiceEmailQueryRow;
    const customer = getSingleRelation(invoice.customers);

    if (!customer?.email) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "missingEmail"));
    }

    const pdfDocumentId = await resolveStoredInvoicePdfDocumentId({
        supabase,
        companyId,
        saleId,
        invoice,
    });

    if (!pdfDocumentId) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "missingPdf"));
    }

    const customerEmail = customer.email.trim().toLocaleLowerCase();
    const recipientEmails = [customerEmail];

    if (additionalRecipientEmail && additionalRecipientEmail !== customerEmail) {
        recipientEmails.push(additionalRecipientEmail);
    }

    const language = getSuggestedEmailLanguage({
        country: customer.country,
        preferredLanguage: customer.preferred_language,
    });
    const template = getInvoiceEmailTemplate(language, {
        invoiceNumber: invoice.invoice_number,
        customerName: getCustomerNameForEmail(customer),
    });

    let deliveryErrorCode: string | null = null;

    try {
        const sender = await getInvoiceMailSender(companyId);
        const actorId = await getOptionalCurrentAuthUserId();
        const sendEmail = await createSendEmailUseCase();

        await sendEmail.execute({
            companyId,
            actorId,
            contextType: "INVOICE",
            contextId: invoiceId,
            templateKey: "invoice.send",
            senderName: sender.senderName,
            senderEmail: sender.senderEmail,
            toRecipients: recipientEmails.map((email) => ({
                email,
                name: email === customerEmail ? getCustomerNameForEmail(customer) : null,
            })),
            subject: template.subject,
            bodyText: template.text,
            bodyHtml: template.html,
            documentAttachments: [
                {
                    documentId: pdfDocumentId,
                    attachmentType: "invoice_pdf",
                },
            ],
            relations: [
                { relationType: "INVOICE", relationId: invoiceId },
                { relationType: "SALE", relationId: saleId },
            ],
            idempotencyKey: `invoice-email:${companyId}:${invoiceId}:${invoice.email_send_count ?? 0}:${recipientEmails.join(",")}`,
            metadata: {
                language,
                invoiceNumber: invoice.invoice_number,
                legacyInvoiceEmailFieldsUpdated: true,
            },
        });
    } catch (sendError) {
        deliveryErrorCode =
            sendError instanceof EmailConfigurationError
                ? "mailNotConfigured"
                : sendError instanceof EmailAttachmentNotFoundError
                  ? "missingPdf"
                : "sendFailed";

        if (!(sendError instanceof EmailConfigurationError)) {
            console.error("[email] invoice delivery failed", sendError);
        }
    }

    if (deliveryErrorCode) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, deliveryErrorCode));
    }

    const [{ error: updateError }] = await Promise.all([
        supabase
            .from("invoices")
            .update({
                email_sent_at: new Date().toISOString(),
                email_sent_to: recipientEmails.join(", "),
                email_sent_language: language,
                email_send_count: (invoice.email_send_count ?? 0) + 1,
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId),
        logActivity({
            action: `Rechnung ${invoice.invoice_number} per E-Mail an ${recipientEmails.join(", ")} gesendet`,
            entityType: "invoice",
            entityId: invoiceId,
        }),
    ]);

    if (updateError) {
        console.error("[email] invoice email status update failed", updateError);
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "sendFailed"));
    }

    revalidateInvoiceEmailPaths(saleId);

    redirect(getInvoiceEmailSuccessRedirect(saleId, invoiceId, recipientEmails.join(", ")));
}

export async function sendInvoiceToDatevAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");

    if (!saleId || !invoiceId) {
        throw new Error("Verkauf oder Rechnung fehlt.");
    }

    const { data, error } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      invoice_number,
      invoice_type,
      status,
      datev_status
    `,
        )
        .eq("id", invoiceId)
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        console.error("[email] DATEV invoice lookup failed", error);
        redirect(getDatevInvoiceErrorRedirect(saleId, invoiceId, "sendFailed"));
    }

    const invoice = data as unknown as DatevInvoiceCandidate;

    if (invoice.invoice_type !== "standard") {
        redirect(getDatevInvoiceErrorRedirect(saleId, invoiceId, "standardOnly"));
    }

    if (!isDatevInvoiceSendable(invoice)) {
        redirect(getDatevInvoiceErrorRedirect(saleId, invoiceId, "standardOnly"));
    }

    const delivery = await sendDatevInvoice(companyId, invoice);

    if (!delivery.success) {
        redirect(
            getDatevInvoiceErrorRedirect(
                saleId,
                invoiceId,
                delivery.message.includes("konfiguriert") ? "mailNotConfigured" : "sendFailed",
            ),
        );
    }

    revalidateInvoiceEmailPaths(saleId);
    redirect(getDatevInvoiceSuccessRedirect(saleId, invoiceId));
}

export async function createZugferdInvoiceAction(formData: FormData) {
    return queueZugferdInvoiceGeneration(formData);
}

async function queueZugferdInvoiceGeneration(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");

    if (!saleId) throw new Error("Verkauf fehlt.");
    if (!invoiceId) throw new Error("Rechnung fehlt.");

    const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, invoice_type, zugferd_validation_status, zugferd_generation_started_at")
        .eq("id", invoiceId)
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .single();

    if (invoiceError || !invoiceData) {
        console.error("[zugferd] invoice lookup failed", invoiceError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    if (invoiceData.invoice_type !== "standard") {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    const generationStartedAt = new Date().toISOString();
    const staleGenerationBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: claimedInvoice, error: claimError } = await supabase
        .from("invoices")
        .update({
            zugferd_validation_status: "pending",
            zugferd_generation_started_at: generationStartedAt,
            zugferd_validation_summary: null,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .or(`zugferd_validation_status.neq.pending,zugferd_generation_started_at.is.null,zugferd_generation_started_at.lt.${staleGenerationBefore}`)
        .select("id")
        .maybeSingle();

    if (claimError) {
        console.error("[zugferd] generation claim failed", claimError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }
    if (!claimedInvoice) {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "generationInProgress"));
    }

    let queued = false;

    try {
        const pdfData = await getInvoicePdfData(invoiceId);
        const termsPdf = pdfData.termsAttached ? await getCompanyTermsPdf() : null;
        const canonicalInvoice = buildCanonicalInvoiceData(pdfData);
        const invoicePdfBytes = await generateInvoicePdf({ ...pdfData, termsAttached: Boolean(termsPdf) });
        const visiblePdfBytes = await buildFinalInvoicePdf({
            invoicePdf: invoicePdfBytes,
            termsPdf: termsPdf?.bytes ?? null,
        });
        const { jobId } = await startZugferdGenerationJob({
            invoice: canonicalInvoice,
            visiblePdfBase64: Buffer.from(visiblePdfBytes).toString("base64"),
        });
        const { error: jobUpdateError } = await supabase
            .from("invoices")
            .update({
                zugferd_validation_summary: {
                    status: "pending",
                    renderJobId: jobId,
                    submittedAt: new Date().toISOString(),
                },
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId);

        if (jobUpdateError) throw new Error(`ZUGFeRD-Hintergrundauftrag konnte nicht gespeichert werden: ${jobUpdateError.message}`);

        queued = true;
    } catch (error) {
        if (error instanceof ZugferdDataValidationError) {
            await markZugferdInvalid(invoiceId, companyId, error.issues);
            redirect(getZugferdErrorRedirect(saleId, invoiceId, "missingData", error.missingFields));
        }
        if (error instanceof ZugferdServiceConfigurationError) {
            await markZugferdInvalid(invoiceId, companyId, [{ severity: "error", message: error.message }]);
            redirect(getZugferdErrorRedirect(saleId, invoiceId, "serviceNotConfigured"));
        }
        if (error instanceof ZugferdServiceRequestError) {
            await markZugferdInvalid(invoiceId, companyId, [{ severity: "error", message: error.message }]);
            const errorCodeByServiceCode: Record<string, string> = {
                UNAUTHORIZED: "serviceUnauthorized",
                PAYLOAD_TOO_LARGE: "payloadTooLarge",
                TIMEOUT: "serviceTimeout",
                SERVICE_UNAVAILABLE: "serviceUnavailable",
                SERVICE_ERROR: "serviceError",
            };
            redirect(getZugferdErrorRedirect(saleId, invoiceId, errorCodeByServiceCode[error.code] ?? "serviceError"));
        }

        await markZugferdInvalid(invoiceId, companyId, [{
            severity: "error",
            message: error instanceof Error ? error.message : "ZUGFeRD-Rechnung konnte nicht vorbereitet werden.",
        }]);
        console.error("[zugferd] job preparation failed", error);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    if (queued) {
        revalidatePaths([`/dashboard/sales/${saleId}`]);
        redirect(getZugferdSuccessRedirect(saleId, invoiceId, "queued"));
    }
}

// Retained temporarily as the proven synchronous implementation for reference
// while the asynchronous job flow is rolled out.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createZugferdInvoiceSynchronously(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!invoiceId) {
        throw new Error("Rechnung fehlt.");
    }

    const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select(
            "id, invoice_type, invoice_number, customer_id, vehicle_id, zugferd_validation_status, zugferd_generation_started_at",
        )
        .eq("id", invoiceId)
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .single();

    if (invoiceError || !invoiceData) {
        console.error("[zugferd] invoice lookup failed", invoiceError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    const generationStartedAt = new Date().toISOString();
    const staleGenerationBefore = new Date(
        Date.now() - 15 * 60 * 1000,
    ).toISOString();
    const { data: claimedInvoice, error: claimError } = await supabase
        .from("invoices")
        .update({
            zugferd_validation_status: "pending",
            zugferd_generation_started_at: generationStartedAt,
            zugferd_validation_summary: null,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .or(
            `zugferd_validation_status.neq.pending,zugferd_generation_started_at.is.null,zugferd_generation_started_at.lt.${staleGenerationBefore}`,
        )
        .select("id")
        .maybeSingle();

    if (claimError) {
        console.error("[zugferd] generation claim failed", claimError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    if (!claimedInvoice) {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "generationInProgress"));
    }

    let uploadedZugferdPath: string | null = null;
    let storedZugferd: {
        fileName: string;
        filePath: string;
        fileSize: number;
        generatedAt: string;
        profile: "EN16931";
        standardVersion: string;
        validation: ZugferdServiceValidationSummary;
        sha256: string;
    } | null = null;

    try {
        const pdfData = await getInvoicePdfData(invoiceId);
        const termsPdf = pdfData.termsAttached ? await getCompanyTermsPdf() : null;
        const canonicalInvoice = buildCanonicalInvoiceData(pdfData);
        const invoicePdfBytes = await generateInvoicePdf({
            ...pdfData,
            termsAttached: Boolean(termsPdf),
        });
        const visiblePdfBytes = await buildFinalInvoicePdf({
            invoicePdf: invoicePdfBytes,
            termsPdf: termsPdf?.bytes ?? null,
        });
        const serviceResult = await generateValidatedZugferdPdf({
            invoice: canonicalInvoice,
            visiblePdfBase64: Buffer.from(visiblePdfBytes).toString("base64"),
        });
        const pdfBytes = Buffer.from(serviceResult.pdfBase64, "base64");
        const fileName = new ExportFileNamePolicy().createDocumentFileName({
            saleReference: pdfData.invoiceNumber,
            documentType: "zugferd_invoice",
            mimeType: "application/pdf",
        });
        const filePath = `companies/${companyId}/invoices/${invoiceId}/zugferd/${randomUUID()}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(filePath, pdfBytes, {
                contentType: "application/pdf",
                upsert: false,
            });

        if (uploadError) {
            throw new Error(
                `ZUGFeRD-Rechnung konnte nicht gespeichert werden: ${uploadError.message}`,
            );
        }

        uploadedZugferdPath = filePath;

        storedZugferd = {
            fileName,
            filePath,
            fileSize: pdfBytes.byteLength,
            generatedAt: new Date().toISOString(),
            profile: serviceResult.profile,
            standardVersion: serviceResult.standardVersion,
            validation: serviceResult.validation,
            sha256: serviceResult.sha256,
        };
    } catch (error) {
        if (uploadedZugferdPath) {
            const { error: cleanupError } = await supabase.storage
                .from("documents")
                .remove([uploadedZugferdPath]);

            if (cleanupError) {
                console.error("[zugferd] storage cleanup failed", cleanupError);
            }
        }

        if (error instanceof ZugferdDataValidationError) {
            await markZugferdInvalid(invoiceId, companyId, error.issues);
            redirect(
                getZugferdErrorRedirect(
                    saleId,
                    invoiceId,
                    "missingData",
                    error.missingFields,
                ),
            );
        }

        if (error instanceof ZugferdServiceConfigurationError) {
            await markZugferdInvalid(invoiceId, companyId, [
                { severity: "error", message: error.message },
            ]);
            redirect(
                getZugferdErrorRedirect(
                    saleId,
                    invoiceId,
                    "serviceNotConfigured",
                ),
            );
        }

        if (error instanceof ZugferdServiceValidationError) {
            await markZugferdInvalid(invoiceId, companyId, error.issues);
            redirect(
                getZugferdErrorRedirect(
                    saleId,
                    invoiceId,
                    "validationFailed",
                    getZugferdIssueMessages(error.issues),
                ),
            );
        }

        if (error instanceof ZugferdServiceRequestError) {
            await markZugferdInvalid(invoiceId, companyId, [
                { severity: "error", message: error.message },
            ]);

            const errorCodeByServiceCode: Record<string, string> = {
                UNAUTHORIZED: "serviceUnauthorized",
                PAYLOAD_TOO_LARGE: "payloadTooLarge",
                TIMEOUT: "serviceTimeout",
                SERVICE_UNAVAILABLE: "serviceUnavailable",
                SERVICE_ERROR: "serviceError",
            };

            redirect(
                getZugferdErrorRedirect(
                    saleId,
                    invoiceId,
                    errorCodeByServiceCode[error.code] ?? "serviceError",
                ),
            );
        }

        await markZugferdInvalid(invoiceId, companyId, [
            {
                severity: "error",
                message: "ZUGFeRD-Rechnung konnte nicht erstellt werden.",
            },
        ]);
        console.error("[zugferd] generation failed", error);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    if (!storedZugferd) {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({
            zugferd_file_path: storedZugferd.filePath,
            zugferd_generated_at: storedZugferd.generatedAt,
            zugferd_profile: storedZugferd.profile,
            zugferd_standard_version: storedZugferd.standardVersion,
            zugferd_validation_status: "valid",
            zugferd_generation_started_at: null,
            zugferd_validated_at: storedZugferd.generatedAt,
            zugferd_validation_summary: getZugferdValidationSummaryForStorage(
                storedZugferd.validation,
            ),
            zugferd_sha256: storedZugferd.sha256,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (invoiceUpdateError) {
        console.error("[zugferd] invoice update failed", invoiceUpdateError);
        const { error: cleanupError } = await supabase.storage
            .from("documents")
            .remove([storedZugferd.filePath]);
        if (cleanupError) {
            console.error("[zugferd] storage cleanup failed", cleanupError);
        }
        await markZugferdInvalid(invoiceId, companyId, [
            { severity: "error", message: "Die E-Rechnung konnte nicht mit der Rechnung verknüpft werden." },
        ]);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    try {
        const { data: existingDocument, error: existingDocumentError } = await supabase
            .from("documents")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_id", invoiceId)
            .eq("document_type", "zugferd_invoice")
            .maybeSingle();

        if (existingDocumentError) {
            throw new Error(`ZUGFeRD-Dokument konnte nicht geprüft werden: ${existingDocumentError.message}`);
        }

        if (existingDocument?.id) {
            const { error: documentUpdateError } = await supabase
                .from("documents")
                .update({
                    source: "generated",
                    status: "available",
                    file_name: storedZugferd.fileName,
                    file_path: storedZugferd.filePath,
                    mime_type: "application/pdf",
                    file_size: storedZugferd.fileSize,
                    generated_by_system: true,
                })
                .eq("id", existingDocument.id)
                .eq("company_id", companyId);

            if (documentUpdateError) {
                throw new Error(`ZUGFeRD-Dokument konnte nicht aktualisiert werden: ${documentUpdateError.message}`);
            }
        } else {
            const { error: documentInsertError } = await supabase
                .from("documents")
                .insert({
                    company_id: companyId,
                    document_type: "zugferd_invoice",
                    source: "generated",
                    status: "available",
                    file_name: storedZugferd.fileName,
                    file_path: storedZugferd.filePath,
                    mime_type: "application/pdf",
                    file_size: storedZugferd.fileSize,
                    customer_id: invoiceData.customer_id,
                    vehicle_id: invoiceData.vehicle_id,
                    sale_id: saleId,
                    invoice_id: invoiceId,
                    generated_by_system: true,
                });

            if (documentInsertError) {
                throw new Error(`ZUGFeRD-Dokument konnte nicht angelegt werden: ${documentInsertError.message}`);
            }
        }
    } catch (error) {
        const { error: cleanupError } = await supabase.storage
            .from("documents")
            .remove([storedZugferd.filePath]);
        if (cleanupError) {
            console.error("[zugferd] storage cleanup failed", cleanupError);
        }
        await markZugferdInvalid(invoiceId, companyId, [
            {
                severity: "error",
                message: "Die ZUGFeRD-Datei konnte nicht vollständig mit den Dokumentdaten verknüpft werden.",
            },
        ]);
        console.error("[zugferd] document finalization failed", error);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    await logActivity({
        action: `ZUGFeRD-Rechnung ${invoiceData.invoice_number} erstellt und validiert`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/documents",
        "/dashboard/activities",
    ]);

    redirect(getZugferdSuccessRedirect(saleId, invoiceId, "created"));
}

export async function sendZugferdInvoiceEmailAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!invoiceId) {
        throw new Error("Rechnung fehlt.");
    }

    const { data, error } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      invoice_number,
      zugferd_file_path,
      zugferd_validation_status,
      zugferd_email_send_count,
      customers:customer_id (
        type,
        company_name,
        first_name,
        last_name,
        email,
        preferred_language,
        country
      )
    `,
        )
        .eq("id", invoiceId)
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        console.error("[zugferd-email] invoice lookup failed", error);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "sendFailed"));
    }

    const invoice = data as unknown as ZugferdInvoiceEmailQueryRow;
    const customer = getSingleRelation(invoice.customers);

    if (!customer?.email) {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "missingEmail"));
    }

    if (!invoice.zugferd_file_path) {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "missingZugferd"));
    }

    if (invoice.zugferd_validation_status !== "valid") {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "notValidated"));
    }

    const { data: fileData, error: downloadError } = await supabase.storage
        .from("documents")
        .download(invoice.zugferd_file_path);

    if (downloadError || !fileData) {
        console.error("[zugferd-email] download failed", downloadError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "missingZugferd"));
    }

    const language = getSuggestedEmailLanguage({
        country: customer.country,
        preferredLanguage: customer.preferred_language,
    });
    const template = getZugferdInvoiceEmailTemplate(language, {
        invoiceNumber: invoice.invoice_number,
        customerName: getCustomerNameForEmail(customer),
    });
    let deliveryErrorCode: string | null = null;

    try {
        const fileBytes = Buffer.from(await fileData.arrayBuffer());
        const sender = await getInvoiceMailSender(companyId);
        const actorId = await getOptionalCurrentAuthUserId();
        const sendEmail = await createSendEmailUseCase();

        await sendEmail.execute({
            companyId,
            actorId,
            contextType: "INVOICE",
            contextId: invoiceId,
            templateKey: "invoice.zugferd.send",
            senderName: sender.senderName,
            senderEmail: sender.senderEmail,
            toRecipients: [{ email: customer.email, name: getCustomerNameForEmail(customer) }],
            subject: template.subject,
            bodyText: template.text,
            bodyHtml: template.html,
            resolvedAttachments: [
                {
                    fileName: new ExportFileNamePolicy().createDocumentFileName({
                        saleReference: invoice.invoice_number,
                        documentType: "zugferd_invoice",
                        mimeType: "application/pdf",
                    }),
                    content: fileBytes,
                    mimeType: "application/pdf",
                    fileSizeBytes: fileBytes.byteLength,
                    attachmentType: "zugferd_pdf",
                },
            ],
            relations: [
                { relationType: "INVOICE", relationId: invoiceId },
                { relationType: "SALE", relationId: saleId },
            ],
            idempotencyKey: `zugferd-email:${companyId}:${invoiceId}:${invoice.zugferd_email_send_count ?? 0}`,
            metadata: {
                language,
                invoiceNumber: invoice.invoice_number,
                storagePath: invoice.zugferd_file_path,
                legacyInvoiceEmailFieldsUpdated: true,
            },
        });
    } catch (sendError) {
        deliveryErrorCode =
            sendError instanceof EmailConfigurationError
                ? "mailNotConfigured"
                : "zugferdSendFailed";

        if (!(sendError instanceof EmailConfigurationError)) {
            console.error("[zugferd-email] delivery failed", sendError);
        }
    }

    if (deliveryErrorCode) {
        redirect(getZugferdErrorRedirect(saleId, invoiceId, deliveryErrorCode));
    }

    const { error: updateError } = await supabase
        .from("invoices")
        .update({
            zugferd_email_sent_at: new Date().toISOString(),
            zugferd_email_sent_to: customer.email,
            zugferd_email_sent_language: language,
            zugferd_email_send_count: (invoice.zugferd_email_send_count ?? 0) + 1,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (updateError) {
        console.error("[zugferd-email] status update failed", updateError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "zugferdSendFailed"));
    }

    await logActivity({
        action: `ZUGFeRD-Rechnung ${invoice.invoice_number} per E-Mail an ${customer.email} gesendet`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/activities",
        "/dashboard/emails",
    ]);

    redirect(getZugferdSuccessRedirect(saleId, invoiceId, "sent", customer.email));
}
