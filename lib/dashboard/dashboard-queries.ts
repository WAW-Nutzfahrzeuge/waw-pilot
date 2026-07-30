import { getCashbookEntries } from "@/lib/cashbook/cashbook-queries";
import { calculateBalance } from "@/lib/cashbook/cashbook-helpers";
import { getCustomers } from "@/lib/customers/customer-queries";
import { getDocuments } from "@/lib/documents/document-queries";
import { getInvoices } from "@/lib/invoices/invoice-queries";
import { getLicensePlateCases } from "@/lib/license-plates/license-plate-queries";
import {
    getLicensePlateStatusLabel,
    getLicensePlateTypeLabel,
} from "@/lib/license-plates/license-plate-helpers";
import { getSales } from "@/lib/sales/sale-queries";
import { getSaleProfitNet } from "@/lib/sales/sale-helpers";
import { getVehicles } from "@/lib/vehicles/vehicle-queries";
import { getPurchaseCases } from "@/lib/purchases/purchase-queries";
import { matchesMonthFilter, normalizeMonthFilter } from "@/utils/month-filter";

export type DashboardData = {
    customersCount: number;
    vehiclesCount: number;
    currentVehiclesCount: number;
    soldVehiclesCount: number;
    salesCount: number;
    invoicesCount: number;
    documentsCount: number;

    licensePlateCasesCount: number;
    openLicensePlateCasesCount: number;
    requestedLicensePlateCasesCount: number;
    completedLicensePlateCasesCount: number;

    purchaseCasesCount: number;
    openPurchasePaymentsCount: number;
    incompletePurchaseDocumentsCount: number;
    completedPurchaseCasesCount: number;

    openInvoicesCount: number;
    incompleteDocumentsCount: number;
    totalRevenueNet: number;
    totalProfitNet: number;
    cashbookBalance: number;

    recentVehicles: {
        id: string;
        internalNumber: string;
        name: string;
        status: string;
        createdAt: string;
    }[];

    recentSales: {
        id: string;
        invoiceNumber: string | null;
        customerName: string;
        vehicleName: string;
        amount: number;
        saleDate: string;
    }[];

    recentLicensePlateCases: {
        id: string;
        typeLabel: string;
        statusLabel: string;
        vehicleName: string;
        customerName: string;
        licensePlateNumber: string | null;
        validUntil: string | null;
    }[];

    openActions: {
        label: string;
        description: string;
        href: string;
        tone: "warning" | "danger" | "info";
    }[];
};

export async function getDashboardData(month?: string | null): Promise<DashboardData> {
    const monthFilter = normalizeMonthFilter(month);
    const [
        customers,
        vehicles,
        sales,
        invoices,
        documents,
        cashbookEntries,
        licensePlateCases,
        purchaseCases,
    ] = await Promise.all([
        getCustomers(),
        getVehicles(),
        getSales(),
        getInvoices(),
        getDocuments(),
        getCashbookEntries(),
        getLicensePlateCases(),
        getPurchaseCases(),
    ]);

    const dashboardVehicleSummary = vehicles.reduce(
        (summary, vehicle) => ({
            currentVehiclesCount:
                summary.currentVehiclesCount +
                (vehicle.status === "in_stock" || vehicle.status === "reserved" ? 1 : 0),
            soldVehiclesCount:
                summary.soldVehiclesCount + (vehicle.status === "sold" ? 1 : 0),
            vehiclesWithOpenDocumentsCount:
                summary.vehiclesWithOpenDocumentsCount +
                (vehicle.document_status !== "complete" ? 1 : 0),
        }),
        {
            currentVehiclesCount: 0,
            soldVehiclesCount: 0,
            vehiclesWithOpenDocumentsCount: 0,
        },
    );

    const dashboardSalesSummary = sales.reduce(
        (summary, sale) => {
            if (!matchesMonthFilter(sale.sale_date, monthFilter)) {
                return summary;
            }

            const filteredSales = summary.filteredSales.length < 4
                ? [...summary.filteredSales, sale]
                : summary.filteredSales;

            return {
                filteredSales,
                salesCount: summary.salesCount + 1,
                openInvoicesCount:
                    summary.openInvoicesCount + (sale.payment_status !== "paid" ? 1 : 0),
                totalRevenueNet: summary.totalRevenueNet + sale.net_amount,
                totalProfitNet: summary.totalProfitNet + getSaleProfitNet(sale),
            };
        },
        {
            filteredSales: [] as typeof sales,
            salesCount: 0,
            openInvoicesCount: 0,
            totalRevenueNet: 0,
            totalProfitNet: 0,
        },
    );

    const filteredInvoicesCount = invoices.reduce(
        (count, invoice) =>
            count + (matchesMonthFilter(invoice.invoice_date, monthFilter) ? 1 : 0),
        0,
    );

    const filteredCashbookEntries = cashbookEntries.filter((entry) =>
        matchesMonthFilter(entry.booking_date, monthFilter),
    );

    const incompleteDocumentsCount = documents.reduce(
        (count, document) => count + (document.status !== "available" ? 1 : 0),
        0,
    );

    const licensePlateSummary = licensePlateCases.reduce(
        (summary, item) => ({
            openLicensePlateCasesCount:
                summary.openLicensePlateCasesCount + (item.status === "open" ? 1 : 0),
            requestedLicensePlateCasesCount:
                summary.requestedLicensePlateCasesCount +
                (item.status === "requested" ? 1 : 0),
            completedLicensePlateCasesCount:
                summary.completedLicensePlateCasesCount +
                (item.status === "completed" ? 1 : 0),
            activeLicensePlateCasesCount:
                summary.activeLicensePlateCasesCount +
                (item.status === "open" || item.status === "requested" ? 1 : 0),
        }),
        {
            openLicensePlateCasesCount: 0,
            requestedLicensePlateCasesCount: 0,
            completedLicensePlateCasesCount: 0,
            activeLicensePlateCasesCount: 0,
        },
    );

    const purchaseSummary = purchaseCases.reduce(
        (summary, purchase) => ({
            openPurchasePaymentsCount:
                summary.openPurchasePaymentsCount +
                (purchase.payment_status !== "paid" ? 1 : 0),
            incompletePurchaseDocumentsCount:
                summary.incompletePurchaseDocumentsCount +
                (purchase.document_check_status !== "complete" ? 1 : 0),
            completedPurchaseCasesCount:
                summary.completedPurchaseCasesCount +
                (purchase.status === "completed" ? 1 : 0),
        }),
        {
            openPurchasePaymentsCount: 0,
            incompletePurchaseDocumentsCount: 0,
            completedPurchaseCasesCount: 0,
        },
    );

    const openActions: DashboardData["openActions"] = [];

    if (dashboardSalesSummary.openInvoicesCount > 0) {
        openActions.push({
            label: `${dashboardSalesSummary.openInvoicesCount} offene Zahlung(en)`,
            description: "Offene Verkaufszahlungen prüfen oder Kassenbuch aktualisieren.",
            href: "/dashboard/sales?paymentStatus=open",
            tone: "warning",
        });
    }

    if (licensePlateSummary.activeLicensePlateCasesCount > 0) {
        openActions.push({
            label: `${licensePlateSummary.activeLicensePlateCasesCount} offene Kennzeichen-Vorgänge`,
            description: "Kurzzeit-, Export- oder Zollkennzeichen weiterbearbeiten.",
            href: "/dashboard/plates",
            tone: "warning",
        });
    }

    if (purchaseSummary.openPurchasePaymentsCount > 0) {
        openActions.push({
            label: `${purchaseSummary.openPurchasePaymentsCount} offene Ankaufszahlung(en)`,
            description: "Zahlungsstatus der Ankaufsakten prüfen.",
            href: "/dashboard/ankauf",
            tone: "warning",
        });
    }

    if (purchaseSummary.incompletePurchaseDocumentsCount > 0) {
        openActions.push({
            label: `${purchaseSummary.incompletePurchaseDocumentsCount} Ankaufsakte(n) mit fehlenden Dokumenten`,
            description: "Einkaufsrechnung, Ankaufsvertrag oder Verkäufer-Ausweis ergänzen.",
            href: "/dashboard/ankauf",
            tone: "danger",
        });
    }

    if (dashboardVehicleSummary.vehiclesWithOpenDocumentsCount > 0) {
        openActions.push({
            label: `${dashboardVehicleSummary.vehiclesWithOpenDocumentsCount} Fahrzeugakte(n) prüfen`,
            description: "Pflichtdokumente im Fahrzeugbestand ergänzen.",
            href: "/dashboard/vehicles",
            tone: "danger",
        });
    }

    if (incompleteDocumentsCount > 0) {
        openActions.push({
            label: `${incompleteDocumentsCount} Dokument(e) prüfen`,
            description: "Dokumentenarchiv auf fehlende oder zu prüfende Dateien kontrollieren.",
            href: "/dashboard/documents?status=open",
            tone: "info",
        });
    }

    return {
        customersCount: customers.length,
        vehiclesCount: vehicles.length,
        currentVehiclesCount: dashboardVehicleSummary.currentVehiclesCount,
        soldVehiclesCount: dashboardVehicleSummary.soldVehiclesCount,
        salesCount: dashboardSalesSummary.salesCount,
        invoicesCount: filteredInvoicesCount,
        documentsCount: documents.length,

        licensePlateCasesCount: licensePlateCases.length,
        openLicensePlateCasesCount: licensePlateSummary.openLicensePlateCasesCount,
        requestedLicensePlateCasesCount: licensePlateSummary.requestedLicensePlateCasesCount,
        completedLicensePlateCasesCount: licensePlateSummary.completedLicensePlateCasesCount,

        purchaseCasesCount: purchaseCases.length,
        openPurchasePaymentsCount: purchaseSummary.openPurchasePaymentsCount,
        incompletePurchaseDocumentsCount: purchaseSummary.incompletePurchaseDocumentsCount,
        completedPurchaseCasesCount: purchaseSummary.completedPurchaseCasesCount,

        openInvoicesCount: dashboardSalesSummary.openInvoicesCount,
        incompleteDocumentsCount,
        totalRevenueNet: dashboardSalesSummary.totalRevenueNet,
        totalProfitNet: dashboardSalesSummary.totalProfitNet,
        cashbookBalance: calculateBalance(filteredCashbookEntries),

        recentVehicles: vehicles.slice(0, 4).map((vehicle) => ({
            id: vehicle.id,
            internalNumber: vehicle.internal_number,
            name: `${vehicle.manufacturer} ${vehicle.model}`,
            status: vehicle.status,
            createdAt: vehicle.created_at,
        })),

        recentSales: dashboardSalesSummary.filteredSales.map((sale) => ({
            id: sale.id,
            invoiceNumber: sale.invoice_number,
            customerName: sale.customer_name,
            vehicleName: sale.vehicle_name,
            amount: sale.net_amount,
            saleDate: sale.sale_date,
        })),

        recentLicensePlateCases: licensePlateCases.slice(0, 4).map((item) => ({
            id: item.id,
            typeLabel: getLicensePlateTypeLabel(item.plate_type),
            statusLabel: getLicensePlateStatusLabel(item.status),
            vehicleName: item.vehicle_name ?? "Kein Fahrzeug",
            customerName: item.customer_name ?? "Kein Kunde",
            licensePlateNumber: item.license_plate_number,
            validUntil: item.valid_until,
        })),

        openActions,
    };
}
