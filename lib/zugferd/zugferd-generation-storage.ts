import { randomUUID } from "node:crypto";

import { logActivity } from "@/lib/activity/activity-log";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ZugferdValidationIssue } from "@/lib/zugferd/canonical-invoice";
import type {
    ZugferdServiceResult,
    ZugferdServiceValidationSummary,
} from "@/lib/zugferd/zugferd-service-client";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";

type InvoiceReference = {
    id: string;
    invoiceNumber: string;
    saleId: string;
    customerId: string | null;
    vehicleId: string | null;
};

export function getZugferdValidationSummaryForStorage(
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

export async function markZugferdInvalid({
    invoiceId,
    companyId,
    issues,
}: {
    invoiceId: string;
    companyId: string;
    issues: ZugferdValidationIssue[];
}) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
        .from("invoices")
        .update({
            zugferd_validation_status: "invalid",
            zugferd_generation_started_at: null,
            zugferd_validation_summary: { status: "invalid", issues },
        })
        .eq("id", invoiceId)
        .eq("company_id", companyId);

    if (error) console.error("[zugferd] invalid status update failed", error);
}

export async function storeValidatedZugferdInvoice({
    companyId,
    invoice,
    result,
}: {
    companyId: string;
    invoice: InvoiceReference;
    result: ZugferdServiceResult;
}): Promise<void> {
    const supabase = createServerSupabaseClient();
    const fileName = new ExportFileNamePolicy().createDocumentFileName({
        saleReference: invoice.invoiceNumber,
        documentType: "zugferd_invoice",
        mimeType: "application/pdf",
    });
    const filePath = `companies/${companyId}/invoices/${invoice.id}/zugferd/${randomUUID()}/${fileName}`;
    const pdfBytes = Buffer.from(result.pdfBase64, "base64");
    let uploaded = false;

    try {
        const { error: uploadError } = await supabase.storage
            .from("documents")
            .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: false });

        if (uploadError) {
            throw new Error(`ZUGFeRD-Rechnung konnte nicht gespeichert werden: ${uploadError.message}`);
        }
        uploaded = true;

        const generatedAt = new Date().toISOString();
        const { error: invoiceUpdateError } = await supabase
            .from("invoices")
            .update({
                zugferd_file_path: filePath,
                zugferd_generated_at: generatedAt,
                zugferd_profile: result.profile,
                zugferd_standard_version: result.standardVersion,
                zugferd_validation_status: "valid",
                zugferd_generation_started_at: null,
                zugferd_validated_at: generatedAt,
                zugferd_validation_summary: getZugferdValidationSummaryForStorage(result.validation),
                zugferd_sha256: result.sha256,
            })
            .eq("id", invoice.id)
            .eq("company_id", companyId);

        if (invoiceUpdateError) {
            throw new Error(`Die E-Rechnung konnte nicht mit der Rechnung verknüpft werden: ${invoiceUpdateError.message}`);
        }

        const { data: existingDocument, error: documentLookupError } = await supabase
            .from("documents")
            .select("id")
            .eq("company_id", companyId)
            .eq("invoice_id", invoice.id)
            .eq("document_type", "zugferd_invoice")
            .maybeSingle();

        if (documentLookupError) {
            throw new Error(`ZUGFeRD-Dokument konnte nicht geprüft werden: ${documentLookupError.message}`);
        }

        const documentValues = {
            source: "generated",
            status: "available",
            file_name: fileName,
            file_path: filePath,
            mime_type: "application/pdf",
            file_size: pdfBytes.byteLength,
            generated_by_system: true,
        };
        const documentError = existingDocument?.id
            ? (await supabase.from("documents").update(documentValues).eq("id", existingDocument.id).eq("company_id", companyId)).error
            : (await supabase.from("documents").insert({
                  ...documentValues,
                  company_id: companyId,
                  document_type: "zugferd_invoice",
                  customer_id: invoice.customerId,
                  vehicle_id: invoice.vehicleId,
                  sale_id: invoice.saleId,
                  invoice_id: invoice.id,
              })).error;

        if (documentError) {
            throw new Error(`ZUGFeRD-Dokument konnte nicht angelegt werden: ${documentError.message}`);
        }

        await logActivity({
            action: `ZUGFeRD-Rechnung ${invoice.invoiceNumber} erstellt und validiert`,
            entityType: "invoice",
            entityId: invoice.id,
        });
        revalidatePaths([
            `/dashboard/sales/${invoice.saleId}`,
            "/dashboard/invoices",
            "/dashboard/documents",
            "/dashboard/activities",
        ]);
    } catch (error) {
        if (uploaded) {
            const { error: cleanupError } = await supabase.storage.from("documents").remove([filePath]);
            if (cleanupError) console.error("[zugferd] storage cleanup failed", cleanupError);
        }
        await markZugferdInvalid({
            invoiceId: invoice.id,
            companyId,
            issues: [{
                severity: "error",
                message: error instanceof Error
                    ? error.message
                    : "Die ZUGFeRD-Datei konnte nicht vollständig gespeichert werden.",
            }],
        });
        throw error;
    }
}
