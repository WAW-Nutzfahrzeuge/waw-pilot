import { getCurrentCompanyId } from "@/lib/company";
import { getLicensePlateCaseDetail } from "@/lib/license-plates/license-plate-detail-queries";
import { generateLicensePlateConsentPdf } from "@/lib/pdf/templates/license-plate-consent-pdf";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type GenerateLicensePlateDocumentResult = {
    documentId: string;
    fileName: string;
    filePath: string;
};

function getSafeFilePart(value: string | null | undefined): string {
    if (!value) return "ohne-nummer";

    return value
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

export async function generateAndStoreLicensePlateConsentDocument(params: {
    plateCaseId: string;
}): Promise<GenerateLicensePlateDocumentResult> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const plateCase = await getLicensePlateCaseDetail(params.plateCaseId);

    if (!plateCase.customer) {
        throw new Error("Einverständniserklärung kann nicht erzeugt werden: Kunde fehlt.");
    }

    if (!plateCase.vehicle) {
        throw new Error("Einverständniserklärung kann nicht erzeugt werden: Fahrzeug fehlt.");
    }

    const pdfBytes = await generateLicensePlateConsentPdf(plateCase);

    const numberPart = getSafeFilePart(
        plateCase.license_plate_number ?? plateCase.vehicle.vin ?? params.plateCaseId,
    );

    const fileName = `einverstaendniserklaerung-kennzeichen-${numberPart}.pdf`;
    const filePath = `generated-documents/license-plates/${params.plateCaseId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
        });

    if (uploadError) {
        throw new Error(
            `Einverständniserklärung konnte nicht gespeichert werden: ${uploadError.message}`,
        );
    }

    const { data: existingDocument, error: existingDocumentError } = await supabase
        .from("documents")
        .select("id")
        .eq("company_id", companyId)
        .eq("license_plate_case_id", params.plateCaseId)
        .eq("document_type", "license_plate_consent")
        .eq("source", "generated")
        .maybeSingle();

    if (existingDocumentError) {
        throw new Error(
            `Vorhandenes Kennzeichen-Dokument konnte nicht geprüft werden: ${existingDocumentError.message}`,
        );
    }

    if (existingDocument?.id) {
        const { error: updateError } = await supabase
            .from("documents")
            .update({
                status: "needs_review",
                file_name: fileName,
                file_path: filePath,
                mime_type: "application/pdf",
                file_size: pdfBytes.byteLength,
                customer_id: plateCase.customer_id,
                vehicle_id: plateCase.vehicle_id,
                license_plate_case_id: params.plateCaseId,
                generated_by_system: true,
            })
            .eq("id", existingDocument.id)
            .eq("company_id", companyId);

        if (updateError) {
            throw new Error(
                `Kennzeichen-Dokument konnte nicht aktualisiert werden: ${updateError.message}`,
            );
        }

        return {
            documentId: existingDocument.id,
            fileName,
            filePath,
        };
    }

    const { data: insertedDocument, error: insertError } = await supabase
        .from("documents")
        .insert({
            company_id: companyId,
            document_type: "license_plate_consent",
            source: "generated",
            status: "needs_review",
            file_name: fileName,
            file_path: filePath,
            mime_type: "application/pdf",
            file_size: pdfBytes.byteLength,
            customer_id: plateCase.customer_id,
            vehicle_id: plateCase.vehicle_id,
            license_plate_case_id: params.plateCaseId,
            generated_by_system: true,
        })
        .select("id")
        .single();

    if (insertError || !insertedDocument) {
        throw new Error(
            `Kennzeichen-Dokument konnte nicht angelegt werden: ${
                insertError?.message ?? "Keine Dokument-ID erhalten"
            }`,
        );
    }

    return {
        documentId: insertedDocument.id as string,
        fileName,
        filePath,
    };
}
