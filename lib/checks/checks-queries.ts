import { getDocumentsToCheckSummary } from "@/lib/documents/document-queries";
import { getLicensePlateCases } from "@/lib/license-plates/license-plate-queries";
import { getSalesToCheckSummary } from "@/lib/sales/sale-queries";
import { getPurchaseCasesToCheckSummary } from "@/lib/purchases/purchase-queries";

export type ChecksData = {
    documentsToCheckCount: number;
    openLicensePlateCasesCount: number;
    salesToCheckCount: number;
    purchaseCasesToCheckCount: number;

    documentsToCheck: {
        id: string;
        document_type: string;
        file_name: string;
        status: string;
        customer_name: string | null;
        vehicle_name: string | null;
        invoice_number: string | null;
        created_at: string;
    }[];

    openLicensePlateCases: {
        id: string;
        plate_type: string;
        status: string;
        customer_name: string | null;
        vehicle_name: string | null;
        license_plate_number: string | null;
        valid_until: string | null;
    }[];

    salesToCheck: {
        id: string;
        customer_name: string;
        vehicle_name: string;
        invoice_number: string | null;
        sale_date: string;
        document_check_status: string;
    }[];

    purchaseCasesToCheck: {
        id: string;
        purchase_number: string | null;
        seller_name: string | null;
        vehicle_name: string | null;
        purchase_date: string;
        document_check_status: string;
    }[];
};

export async function getChecksData(): Promise<ChecksData> {
    const [documentCheckSummary, licensePlateCases, salesCheckSummary, purchaseCheckSummary] =
        await Promise.all([
            getDocumentsToCheckSummary(),
            getLicensePlateCases(),
            getSalesToCheckSummary(),
            getPurchaseCasesToCheckSummary(),
        ]);

    const documentsToCheck: ChecksData["documentsToCheck"] =
        documentCheckSummary.documents.map((document) => ({
            id: document.id,
            document_type: document.document_type,
            file_name: document.file_name,
            status: document.status,
            customer_name: document.customer_name,
            vehicle_name: document.vehicle_name,
            invoice_number: document.invoice_number,
            created_at: document.created_at,
        }));

    const openLicensePlateCases: ChecksData["openLicensePlateCases"] = [];
    let openLicensePlateCasesCount = 0;

    for (const item of licensePlateCases) {
        if (item.status !== "open" && item.status !== "requested") continue;

        openLicensePlateCasesCount += 1;
        if (openLicensePlateCases.length >= 8) continue;

        openLicensePlateCases.push({
            id: item.id,
            plate_type: item.plate_type,
            status: item.status,
            customer_name: item.customer_name,
            vehicle_name: item.vehicle_name,
            license_plate_number: item.license_plate_number,
            valid_until: item.valid_until,
        });
    }

    return {
        documentsToCheckCount: documentCheckSummary.count,
        openLicensePlateCasesCount,
        salesToCheckCount: salesCheckSummary.count,
        purchaseCasesToCheckCount: purchaseCheckSummary.count,

        purchaseCasesToCheck: purchaseCheckSummary.purchaseCases,
        documentsToCheck,
        openLicensePlateCases,
        salesToCheck: salesCheckSummary.sales,
    };
}
