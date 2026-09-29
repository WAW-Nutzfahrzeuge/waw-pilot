import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { getDocumentDownloadFileName } from "@/lib/documents/visible-file-names";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createDocumentUseCases } from "@/src/modules/documents/infrastructure/factories/document-use-case.factory";

export const runtime = "nodejs";

const invoiceDocumentTypes = new Set([
    "invoice",
    "invoice_pdf",
    "proforma_invoice",
    "down_payment_invoice",
    "cancellation_invoice",
    "credit_note",
]);

type RouteContext = {
    params: Promise<{
        documentId: string;
    }>;
};

type VehicleRegistrationDownloadContext = {
    manufacturer: string | null;
    vehicleType: string | null;
    model: string | null;
    vin: string | null;
    purchaseCustomerName: string | null;
};

function getCustomerName(customer: {
    type: "company" | "private" | null;
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
} | null): string | null {
    if (!customer) return null;

    if (customer.type === "company") {
        return customer.company_name?.trim() || null;
    }

    const name = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return name || null;
}

async function getVehicleRegistrationDownloadContext({
    companyId,
    documentId,
}: {
    companyId: string;
    documentId: string;
}): Promise<VehicleRegistrationDownloadContext | null> {
    const supabase = createServerSupabaseClient();
    const { data: document } = await supabase
        .from("documents")
        .select("vehicle_id, customer_id")
        .eq("company_id", companyId)
        .eq("id", documentId)
        .maybeSingle();

    if (!document?.vehicle_id) return null;

    const { data: vehicle } = await supabase
        .from("vehicles")
        .select("manufacturer, vehicle_type, model, vin, seller_customer_id")
        .eq("company_id", companyId)
        .eq("id", document.vehicle_id)
        .maybeSingle();

    if (!vehicle) return null;

    const purchaseCustomerId =
        (document.customer_id as string | null) ??
        (vehicle.seller_customer_id as string | null) ??
        null;
    let purchaseCustomerName: string | null = null;

    if (purchaseCustomerId) {
        const { data: customer } = await supabase
            .from("customers")
            .select("type, company_name, first_name, last_name")
            .eq("company_id", companyId)
            .eq("id", purchaseCustomerId)
            .maybeSingle();

        purchaseCustomerName = getCustomerName(customer);
    }

    return {
        manufacturer: (vehicle.manufacturer as string | null) ?? null,
        vehicleType: (vehicle.vehicle_type as string | null) ?? null,
        model: (vehicle.model as string | null) ?? null,
        vin: (vehicle.vin as string | null) ?? null,
        purchaseCustomerName,
    };
}

function createContentDisposition(disposition: "attachment" | "inline", fileName: string): string {
    const asciiFallback = fileName
        .replace(/[^\x20-\x7e]/g, "_")
        .replace(/"/g, "")
        .trim() || "Dokument";

    return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request, context: RouteContext) {
    const { documentId } = await context.params;

    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";
    const versionId = url.searchParams.get("versionId") ?? undefined;
    const companyId = getCurrentCompanyId();
    const { getDocumentDetail, generateDocumentAccessUrl } = createDocumentUseCases();

    let file;
    try {
        await getDocumentDetail.execute({ companyId, documentId });
        file = await generateDocumentAccessUrl.execute({
            companyId,
            documentId,
            versionId,
            expiresInSeconds: 60,
        });
    } catch (error) {
        return NextResponse.json(
            {
                message:
                    error instanceof Error
                        ? error.message
                        : "Dokument konnte nicht geladen werden.",
            },
            { status: 404 },
        );
    }

    if (!versionId && file.invoiceId && invoiceDocumentTypes.has(file.documentType)) {
        const invoiceUrl = new URL(`/api/invoices/${file.invoiceId}/pdf`, request.url);

        if (shouldDownload) {
            invoiceUrl.searchParams.set("download", "1");
        }

        return NextResponse.redirect(invoiceUrl);
    }

    const response = await fetch(file.signedUrl, { cache: "no-store" });

    if (!response.ok) {
        return NextResponse.json(
            {
                message: "Datei konnte nicht aus Storage geladen werden.",
            },
            { status: 404 },
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    const vehicleRegistration =
        file.documentType === "vehicle_registration"
            ? await getVehicleRegistrationDownloadContext({
                  companyId,
                  documentId,
              })
            : null;
    const fileName = getDocumentDownloadFileName({
        storedFileName: file.fileName,
        documentType: file.documentType,
        mimeType: file.mimeType,
        invoiceNumber: file.invoiceNumber,
        storagePath: file.storagePath,
        versionNumber: file.versionNumber,
        vehicleRegistration,
    });
    const contentType = file.mimeType || "application/octet-stream";
    const disposition = shouldDownload ? "attachment" : "inline";

    return new NextResponse(Buffer.from(arrayBuffer), {
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": createContentDisposition(disposition, fileName),
            "Cache-Control": "no-store",
        },
    });
}
