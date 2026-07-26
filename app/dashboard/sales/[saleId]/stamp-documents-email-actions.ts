"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCompanyId } from "@/lib/company";
import {
    normalizeEmailLanguage,
} from "@/lib/customers/email-languages";
import {
    EmailConfigurationError,
} from "@/lib/email/resend";
import { getInvoiceMailSender } from "@/lib/email/company-mail-sender";
import {
    getAvailableStampDocuments,
    getStampDocumentType,
} from "@/lib/sales/stamp-documents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";
import { createSendEmailUseCase } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";

export type SendStampDocumentsEmailState = {
    success: boolean;
    message: string;
};

const initialErrorMessage =
    "Dokumente zum Stempeln konnten nicht per E-Mail gesendet werden. Bitte versuche es erneut.";
const maxAttachmentBytes = 20 * 1024 * 1024;

type SupabaseRelation<T> = T | T[] | null;

type SaleEmailDocumentRow = {
    id: string;
    document_type: string;
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    status: "available" | "missing" | "needs_review";
};

type SaleEmailQueryRow = {
    id: string;
    buyer_customer_id: string;
    customers: SupabaseRelation<{
        id: string;
        type: "company" | "private";
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        preferred_language: string | null;
        country: string | null;
    }>;
    vehicles: SupabaseRelation<{
        internal_number: string;
        manufacturer: string;
        model: string;
    }>;
    documents: SupabaseRelation<SaleEmailDocumentRow>;
};

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getStringValues(formData: FormData, key: string): string[] {
    return formData
        .getAll(key)
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;

    return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function getManyRelation<T>(relation: SupabaseRelation<T>): T[] {
    if (!relation) return [];

    return Array.isArray(relation) ? relation : [relation];
}

function toHtml(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .split("\n\n")
        .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`)
        .join("");
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getCurrentAuthUserId(): Promise<string | null> {
    const authSupabase = await createAuthServerSupabaseClient();
    const {
        data: { user },
    } = await authSupabase.auth.getUser();

    return user?.id ?? null;
}

export async function sendStampDocumentsEmailAction(
    _previousState: SendStampDocumentsEmailState,
    formData: FormData,
): Promise<SendStampDocumentsEmailState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const saleId = getStringValue(formData, "sale_id");
    const recipientEmail = getStringValue(formData, "recipient_email");
    const subject = getStringValue(formData, "subject");
    const body = getStringValue(formData, "body");
    const selectedDocumentIds = new Set(getStringValues(formData, "document_ids"));
    const language = normalizeEmailLanguage(
        getStringValue(formData, "language"),
        "en",
    );

    if (!saleId) {
        return { success: false, message: "Verkaufsakte fehlt." };
    }

    if (!recipientEmail || !isValidEmail(recipientEmail)) {
        return {
            success: false,
            message: "Bitte gib eine gültige Empfänger-E-Mail-Adresse ein.",
        };
    }

    if (!subject || !body) {
        return {
            success: false,
            message: "Bitte prüfe Betreff und E-Mail-Text.",
        };
    }

    if (selectedDocumentIds.size === 0) {
        return {
            success: false,
            message: "Bitte wähle mindestens ein vorhandenes Dokument aus.",
        };
    }

    const { data, error } = await supabase
        .from("sales")
        .select(
            `
            id,
            buyer_customer_id,
            customers:buyer_customer_id (
                id,
                type,
                company_name,
                first_name,
                last_name,
                email,
                preferred_language,
                country
            ),
            vehicles (
                internal_number,
                manufacturer,
                model
            ),
            documents (
                id,
                document_type,
                file_name,
                file_path,
                mime_type,
                file_size,
                status
            )
        `,
        )
        .eq("id", saleId)
        .eq("company_id", companyId)
        .single();

    if (error || !data) {
        console.error("[stamp-doc-email] sale lookup failed", error);
        return { success: false, message: "Verkaufsakte konnte nicht geladen werden." };
    }

    const sale = data as unknown as SaleEmailQueryRow;
    const customer = getSingleRelation(sale.customers);
    const vehicle = getSingleRelation(sale.vehicles);

    if (!customer || !vehicle) {
        return {
            success: false,
            message: "Für diesen Verkauf fehlen Kunde oder Fahrzeug.",
        };
    }

    const availableStampDocuments = getAvailableStampDocuments(
        getManyRelation(sale.documents),
    ).filter((document) => selectedDocumentIds.has(document.id));

    if (availableStampDocuments.length === 0) {
        return {
            success: false,
            message: "Für diesen Verkauf sind noch keine Dokumente zum Stempeln vorhanden.",
        };
    }

    const selectedAttachments = availableStampDocuments
        .filter((document) => Boolean(document.file_path) && Boolean(getStampDocumentType(document)))
        .map((document) => ({
            documentId: document.id,
            attachmentType: "stamp_document",
            fileSize: document.file_size ?? 0,
        }));

    const totalAttachmentBytes = selectedAttachments.reduce(
        (sum, attachment) => sum + attachment.fileSize,
        0,
    );

    if (selectedAttachments.length === 0) {
        return {
            success: false,
            message: "Es konnte kein gültiger Anhang geladen werden.",
        };
    }

    if (totalAttachmentBytes > maxAttachmentBytes) {
        return {
            success: false,
            message:
                "Die ausgewählten Anhänge sind zu groß für den E-Mail-Versand. Bitte wähle weniger Dokumente aus.",
        };
    }

    try {
        const sender = await getInvoiceMailSender(companyId);
        const actorId = await getCurrentAuthUserId();
        const sendEmail = createSendEmailUseCase();

        await sendEmail.execute({
            companyId,
            actorId,
            contextType: "SALE",
            contextId: saleId,
            templateKey: "documents.free",
            senderName: sender.senderName,
            senderEmail: sender.senderEmail,
            toRecipients: [{ email: recipientEmail, name: null }],
            subject,
            bodyText: body,
            bodyHtml: toHtml(body),
            documentAttachments: selectedAttachments.map((attachment) => ({
                documentId: attachment.documentId,
                attachmentType: attachment.attachmentType,
            })),
            relations: [{ relationType: "SALE", relationId: saleId }],
            idempotencyKey: `stamp-documents-email:${companyId}:${saleId}:${Array.from(selectedDocumentIds)
                .sort()
                .join(",")}:${recipientEmail}:${subject}`,
            metadata: {
                language,
                vehicle: `${vehicle.internal_number} ${vehicle.manufacturer} ${vehicle.model}`,
                documentLabels: availableStampDocuments.map((document) => document.label),
            },
        });
    } catch (sendError) {
        if (sendError instanceof EmailConfigurationError) {
            return { success: false, message: sendError.message };
        }

        console.error("[stamp-doc-email] delivery failed", sendError);
        return { success: false, message: initialErrorMessage };
    }

    revalidatePath(`/dashboard/sales/${saleId}`);
    revalidatePath("/dashboard/activities");
    revalidatePath("/dashboard/emails");

    return {
        success: true,
        message: `Dokumente zum Stempeln wurden an ${recipientEmail} gesendet.`,
    };
}
