"use server";

import { redirect } from "next/navigation";

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
import { getTodayDateOnly, toDateOnlyString } from "@/lib/format/date";
import { assertCompanySignatureStampConfigured } from "@/lib/pdf/company-signature-assets";
import { buildFinalInvoicePdf, getCompanyTermsPdf } from "@/lib/pdf/company-terms";
import { generateInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { getInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { generateAndStoreInvoicePdf } from "@/lib/pdf/invoice-storage";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    buildCanonicalInvoiceData,
    ZugferdDataValidationError,
    type ZugferdValidationIssue,
} from "@/lib/zugferd/canonical-invoice";
import {
    generateValidatedZugferdPdf,
    ZugferdServiceRequestError,
    ZugferdServiceConfigurationError,
    ZugferdServiceValidationError,
    type ZugferdServiceValidationSummary,
} from "@/lib/zugferd/zugferd-service-client";
import { createSendEmailUseCase } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";

type SaleInvoiceVehicleRelation = {
    damage_notes: string | null;
    show_damage_on_invoice: boolean | null;
};

type SaleInvoiceSourceRow = {
    id: string;
    company_id: string;
    sale_number: string | null;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    net_amount: number | string;
    vat_rate: number | string;
    vat_amount: number | string;
    gross_amount: number | string;
    invoice_notes: string | null;
    include_damage_notes_on_invoice: boolean | null;
    vehicles: SaleInvoiceVehicleRelation | SaleInvoiceVehicleRelation[] | null;
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
    email_send_count: number | null;
    pdf_document_id: string | null;
    customers: InvoiceEmailCustomerRelation | InvoiceEmailCustomerRelation[] | null;
    documents:
        | InvoiceEmailDocumentRelation
        | InvoiceEmailDocumentRelation[]
        | null;
};

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

function revalidateInvoicePaymentPaths(saleId: string) {
    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/invoices",
        "/dashboard/cashbook",
        "/dashboard/documents",
        "/dashboard/activities",
    ]);
}

type ZugferdInvoiceEmailQueryRow = {
    id: string;
    sale_id: string | null;
    invoice_number: string;
    sales: { sale_number: string | null } | { sale_number: string | null }[] | null;
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

function getSingleRelation<T>(relation: T | T[] | null): T | null {
    if (!relation) return null;

    if (Array.isArray(relation)) {
        return relation[0] ?? null;
    }

    return relation;
}

function getInvoiceTypeValue(formData: FormData): InvoiceType | null {
    const value = getStringValue(formData, "invoice_type");

    if (value === "standard" || value === "proforma") {
        return value;
    }

    return null;
}

function addDays(dateString: string, days: number): string {
    const date = new Date(dateString);
    date.setDate(date.getDate() + days);

    return toDateOnlyString(date);
}

function getPaymentMethodLabel(paymentMethod: string): string {
    if (paymentMethod === "cash") return "Bar";
    if (paymentMethod === "bank") return "Bank";

    return paymentMethod;
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
    successCode: "created" | "sent",
    email?: string,
): string {
    const params = new URLSearchParams({
        highlightInvoiceId: invoiceId,
    });

    if (successCode === "created") {
        params.set("zugferdCreated", "1");
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
            due_date: addDays(sale.sale_date, 7),
            net_amount: Number(sale.net_amount),
            vat_rate: Number(sale.vat_rate),
            vat_amount: Number(sale.vat_amount),
            gross_amount: Number(sale.gross_amount),
            status: "created",
            payment_status: "open",
            datev_status: "not_sent",
            include_signature_stamp: includeSignatureStamp,
            paid_at: null,
        })
        .select("id")
        .single();

    if (invoiceError || !invoiceData) {
        throw new Error(
            `${getInvoiceTypeLabel(invoiceType)} konnte nicht erzeugt werden: ${
                invoiceError?.message ?? "Keine Rechnungs-ID erhalten"
            }`,
        );
    }

    const invoiceId = invoiceData.id as string;
    const invoiceLabel = getInvoiceActivityLabel(invoiceType);

    await logActivity({
        action: `${invoiceLabel} ${invoiceNumber} erzeugt`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    const invoiceFileName = new ExportFileNamePolicy().createDocumentFileName({
        saleReference: sale.sale_number ?? invoiceNumber,
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

    revalidateInvoiceCreationPaths(saleId);

    redirect(
        `/dashboard/sales/${saleId}?invoiceCreated=${encodeURIComponent(
            invoiceNumber,
        )}&highlightInvoiceId=${invoiceId}`,
    );
}

export async function regenerateSaleInvoicePdfAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");
    const includeSignatureStamp =
        getStringValue(formData, "include_signature_stamp") === "yes";
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

    const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      invoice_type,
      invoice_number,
      include_signature_stamp,
      pdf_document_id
    `,
        )
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    if (invoiceError || !invoiceData) {
        throw new Error(
            `Rechnung konnte nicht geladen werden: ${
                invoiceError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    if (Boolean(invoiceData.include_signature_stamp) !== includeSignatureStamp) {
        const { error: invoiceUpdateError } = await supabase
            .from("invoices")
            .update({
                include_signature_stamp: includeSignatureStamp,
            })
            .eq("id", invoiceId)
            .eq("company_id", companyId);

        if (invoiceUpdateError) {
            throw new Error(
                `Rechnungsoption konnte nicht gespeichert werden: ${invoiceUpdateError.message}`,
            );
        }
    }

    const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .select(
            `
      invoice_notes,
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

    const sale = saleData as Pick<SaleInvoiceSourceRow, "invoice_notes" | "vehicles">;
    const saleVehicle = getSingleRelation(sale.vehicles);
    const includeDamageNotesOnInvoice =
        requestedIncludeDamageNotesOnInvoice &&
        canIncludeVehicleDamageNotes(saleVehicle);
    const nextInvoiceNotes = removePlannedNetSalePriceNote(sale.invoice_notes);

    if ((nextInvoiceNotes ?? null) !== (sale.invoice_notes ?? null)) {
        const { error: saleNotesUpdateError } = await supabase
            .from("sales")
            .update({
                invoice_notes: nextInvoiceNotes,
            })
            .eq("id", saleId)
            .eq("company_id", companyId);

        if (saleNotesUpdateError) {
            throw new Error(
                `Rechnungsnotiz konnte nicht gespeichert werden: ${saleNotesUpdateError.message}`,
            );
        }
    }

    const { error: saleOptionUpdateError } = await supabase
        .from("sales")
        .update({
            include_damage_notes_on_invoice: includeDamageNotesOnInvoice,
        })
        .eq("id", saleId)
        .eq("company_id", companyId);

    if (saleOptionUpdateError) {
        throw new Error(
            `Rechnungsoption konnte nicht gespeichert werden: ${saleOptionUpdateError.message}`,
        );
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

export async function sendSaleInvoiceEmailAction(formData: FormData) {
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
      ),
      documents:pdf_document_id (
        id,
        file_name,
        file_path,
        mime_type
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
    const document = getSingleRelation(invoice.documents);

    if (!customer?.email) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "missingEmail"));
    }

    if (!invoice.pdf_document_id || !document?.file_path) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "missingPdf"));
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
            toRecipients: [{ email: customer.email, name: getCustomerNameForEmail(customer) }],
            subject: template.subject,
            bodyText: template.text,
            bodyHtml: template.html,
            documentAttachments: [
                {
                    documentId: invoice.pdf_document_id,
                    attachmentType: "invoice_pdf",
                },
            ],
            relations: [
                { relationType: "INVOICE", relationId: invoiceId },
                { relationType: "SALE", relationId: saleId },
            ],
            idempotencyKey: `invoice-email:${companyId}:${invoiceId}:${invoice.email_send_count ?? 0}`,
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
                : "sendFailed";

        if (!(sendError instanceof EmailConfigurationError)) {
            console.error("[email] invoice delivery failed", sendError);
        }
    }

    if (deliveryErrorCode) {
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, deliveryErrorCode));
    }

    const { error: updateError } = await supabase
        .from("invoices")
        .update({
            email_sent_at: new Date().toISOString(),
            email_sent_to: customer.email,
            email_sent_language: language,
            email_send_count: (invoice.email_send_count ?? 0) + 1,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (updateError) {
        console.error("[email] invoice email status update failed", updateError);
        redirect(getInvoiceEmailErrorRedirect(saleId, invoiceId, "sendFailed"));
    }

    await logActivity({
        action: `Rechnung ${invoice.invoice_number} per E-Mail an ${customer.email} gesendet`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    revalidateInvoiceEmailPaths(saleId);

    redirect(getInvoiceEmailSuccessRedirect(saleId, invoiceId, customer.email));
}

export async function createZugferdInvoiceAction(formData: FormData) {
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
        .select("id, invoice_type, invoice_number, customer_id, vehicle_id")
        .eq("id", invoiceId)
        .eq("sale_id", saleId)
        .eq("company_id", companyId)
        .single();

    if (invoiceError || !invoiceData) {
        console.error("[zugferd] invoice lookup failed", invoiceError);
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    const { error: pendingUpdateError } = await supabase
        .from("invoices")
        .update({
            zugferd_validation_status: "pending",
            zugferd_validation_summary: null,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (pendingUpdateError) {
        console.error("[zugferd] pending status update failed", pendingUpdateError);
    }

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
        const [pdfData, termsPdf] = await Promise.all([
            getInvoicePdfData(invoiceId),
            getCompanyTermsPdf(),
        ]);
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
            saleReference: pdfData.saleNumber ?? pdfData.invoiceNumber,
            documentType: "zugferd_invoice",
            mimeType: "application/pdf",
        });
        const filePath = `invoices/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(filePath, pdfBytes, {
                contentType: "application/pdf",
                upsert: true,
            });

        if (uploadError) {
            throw new Error(
                `ZUGFeRD-Rechnung konnte nicht gespeichert werden: ${uploadError.message}`,
            );
        }

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
        redirect(getZugferdErrorRedirect(saleId, invoiceId, "createFailed"));
    }

    const { data: existingDocument, error: existingDocumentError } = await supabase
        .from("documents")
        .select("id")
        .eq("company_id", companyId)
        .eq("invoice_id", invoiceId)
        .eq("document_type", "zugferd_invoice")
        .maybeSingle();

    if (existingDocumentError) {
        console.error("[zugferd] document lookup failed", existingDocumentError);
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
            console.error("[zugferd] document update failed", documentUpdateError);
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
            console.error("[zugferd] document insert failed", documentInsertError);
        }
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
      sales:sale_id (sale_number),
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
    const saleRelation = Array.isArray(invoice.sales) ? invoice.sales[0] : invoice.sales;
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
                        saleReference: saleRelation?.sale_number ?? invoice.invoice_number,
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

export async function markInvoicePaidAction(formData: FormData) {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const saleId = getStringValue(formData, "sale_id");
    const invoiceId = getStringValue(formData, "invoice_id");
    const paymentMethod = getStringValue(formData, "payment_method") ?? "bank";

    if (!saleId) {
        throw new Error("Verkauf fehlt.");
    }

    if (!invoiceId) {
        throw new Error("Rechnung fehlt.");
    }

    if (paymentMethod !== "bank" && paymentMethod !== "cash") {
        throw new Error("Ungültige Zahlungsart.");
    }

    const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .select(
            `
      id,
      sale_id,
      customer_id,
      vehicle_id,
      invoice_type,
      invoice_number,
      gross_amount,
      payment_status,
      pdf_document_id
    `,
        )
        .eq("id", invoiceId)
        .eq("company_id", companyId)
        .single();

    if (invoiceError || !invoiceData) {
        throw new Error(
            `Rechnung konnte nicht geladen werden: ${
                invoiceError?.message ?? "Nicht gefunden"
            }`,
        );
    }

    const invoiceType = invoiceData.invoice_type as InvoiceType;
    const invoiceLabel = getInvoiceActivityLabel(invoiceType);
    const paymentMethodLabel = getPaymentMethodLabel(paymentMethod);

    if (invoiceType === "proforma") {
        throw new Error("Proforma-Rechnungen werden nicht als bezahlt markiert.");
    }

    if (invoiceData.payment_status === "paid") {
        revalidatePaths([
            `/dashboard/sales/${saleId}`,
            "/dashboard/invoices",
            "/dashboard/cashbook",
        ]);

        redirect(`/dashboard/sales/${saleId}`);
    }

    const paidAt = new Date().toISOString();

    const { error: invoiceUpdateError } = await supabase
        .from("invoices")
        .update({
            status: "paid",
            payment_status: "paid",
            paid_at: paidAt,
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (invoiceUpdateError) {
        throw new Error(
            `Rechnung konnte nicht als bezahlt markiert werden: ${invoiceUpdateError.message}`,
        );
    }

    await logActivity({
        action: `${invoiceLabel} ${invoiceData.invoice_number} als bezahlt markiert (${paymentMethodLabel})`,
        entityType: "invoice",
        entityId: invoiceId,
    });

    const salePaymentStatus = invoiceType === "down_payment" ? "partial" : "paid";

    const { error: saleUpdateError } = await supabase
        .from("sales")
        .update({
            payment_status: salePaymentStatus,
        })
        .eq("id", saleId)
        .eq("company_id", companyId);

    if (saleUpdateError) {
        throw new Error(
            `Verkauf wurde nicht aktualisiert: ${saleUpdateError.message}`,
        );
    }

    const { data: existingCashbookEntry, error: cashbookCheckError } =
        await supabase
            .from("cashbook_entries")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_id", invoiceId)
            .maybeSingle();

    if (cashbookCheckError) {
        throw new Error(
            `Kassenbuch konnte nicht geprüft werden: ${cashbookCheckError.message}`,
        );
    }

    if (!existingCashbookEntry) {
        const description =
            invoiceType === "down_payment"
                ? `Zahlung Anzahlungsrechnung ${invoiceData.invoice_number}`
                : `Zahlung Rechnung ${invoiceData.invoice_number}`;

        const { data: cashbookEntry, error: cashbookInsertError } = await supabase
            .from("cashbook_entries")
            .insert({
                company_id: companyId,
                entry_type: "income",
                category: "vehicle_sale",
                payment_method: paymentMethod,
                amount: Number(invoiceData.gross_amount),
                booking_date: getTodayDateOnly(),
                description,
                customer_id: invoiceData.customer_id,
                vehicle_id: invoiceData.vehicle_id,
                sale_id: saleId,
                invoice_id: invoiceId,
                document_id: invoiceData.pdf_document_id,
            })
            .select("id")
            .single();

        if (cashbookInsertError || !cashbookEntry) {
            throw new Error(
                `Kassenbuch-Eintrag konnte nicht erstellt werden: ${
                    cashbookInsertError?.message ?? "Keine Kassenbuch-ID erhalten"
                }`,
            );
        }

        await logActivity({
            action: `Kassenbuch-Eintrag für ${invoiceLabel} ${invoiceData.invoice_number} erstellt (${paymentMethodLabel})`,
            entityType: "cashbook",
            entityId: cashbookEntry.id as string,
        });
    }

    revalidateInvoicePaymentPaths(saleId);

    redirect(`/dashboard/sales/${saleId}`);
}
