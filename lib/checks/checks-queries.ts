import { getDocuments } from "@/lib/documents/document-queries";
import { getLicensePlateCases } from "@/lib/license-plates/license-plate-queries";
import { getSales } from "@/lib/sales/sale-queries";
import { getPurchaseCases } from "@/lib/purchases/purchase-queries";

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
    const [documents, licensePlateCases, sales, purchaseCases] =
        await Promise.all([
            getDocuments(),
            getLicensePlateCases(),
            getSales(),
            getPurchaseCases(),
        ]);

    const documentCheckSummary = documents.reduce(
        (summary, document) => {
            if (document.status === "available") return summary;

            return {
                count: summary.count + 1,
                items:
                    summary.items.length < 10
                        ? [
                            ...summary.items,
                            {
                                id: document.id,
                                document_type: document.document_type,
                                file_name: document.file_name,
                                status: document.status,
                                customer_name: document.customer_name,
                                vehicle_name: document.vehicle_name,
                                invoice_number: document.invoice_number,
                                created_at: document.created_at,
                            },
                        ]
                        : summary.items,
            };
        },
        {
            count: 0,
            items: [] as ChecksData["documentsToCheck"],
        },
    );

    const licensePlateCheckSummary = licensePlateCases.reduce(
        (summary, item) => {
            if (item.status !== "open" && item.status !== "requested") {
                return summary;
            }

            return {
                count: summary.count + 1,
                items:
                    summary.items.length < 8
                        ? [
                            ...summary.items,
                            {
                                id: item.id,
                                plate_type: item.plate_type,
                                status: item.status,
                                customer_name: item.customer_name,
                                vehicle_name: item.vehicle_name,
                                license_plate_number: item.license_plate_number,
                                valid_until: item.valid_until,
                            },
                        ]
                        : summary.items,
            };
        },
        {
            count: 0,
            items: [] as ChecksData["openLicensePlateCases"],
        },
    );

    const saleCheckSummary = sales.reduce(
        (summary, sale) => {
            if (sale.document_check_status === "complete") return summary;

            return {
                count: summary.count + 1,
                items:
                    summary.items.length < 8
                        ? [
                            ...summary.items,
                            {
                                id: sale.id,
                                customer_name: sale.customer_name,
                                vehicle_name: sale.vehicle_name,
                                invoice_number: sale.invoice_number,
                                sale_date: sale.sale_date,
                                document_check_status: sale.document_check_status,
                            },
                        ]
                        : summary.items,
            };
        },
        {
            count: 0,
            items: [] as ChecksData["salesToCheck"],
        },
    );

    const purchaseCheckSummary = purchaseCases.reduce(
        (summary, purchase) => {
            if (purchase.document_check_status === "complete") return summary;

            return {
                count: summary.count + 1,
                items:
                    summary.items.length < 8
                        ? [
                            ...summary.items,
                            {
                                id: purchase.id,
                                purchase_number: purchase.purchase_number,
                                seller_name: purchase.seller_name,
                                vehicle_name: purchase.vehicle_name,
                                purchase_date: purchase.purchase_date,
                                document_check_status: purchase.document_check_status,
                            },
                        ]
                        : summary.items,
            };
        },
        {
            count: 0,
            items: [] as ChecksData["purchaseCasesToCheck"],
        },
    );

    return {
        documentsToCheckCount: documentCheckSummary.count,
        openLicensePlateCasesCount: licensePlateCheckSummary.count,
        salesToCheckCount: saleCheckSummary.count,
        purchaseCasesToCheckCount: purchaseCheckSummary.count,

        purchaseCasesToCheck: purchaseCheckSummary.items,
        documentsToCheck: documentCheckSummary.items,
        openLicensePlateCases: licensePlateCheckSummary.items,
        salesToCheck: saleCheckSummary.items,
    };
}
