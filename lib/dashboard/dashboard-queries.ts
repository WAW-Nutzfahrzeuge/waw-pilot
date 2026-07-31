import { getCashbookSummary } from "@/lib/cashbook/cashbook-queries";
import { getCustomersCount } from "@/lib/customers/customer-queries";
import { getDocumentDashboardSummary } from "@/lib/documents/document-queries";
import { getInvoiceDashboardSummary } from "@/lib/invoices/invoice-queries";
import { getLicensePlateDashboardSummary } from "@/lib/license-plates/license-plate-queries";
import {
    getLicensePlateStatusLabel,
    getLicensePlateTypeLabel,
} from "@/lib/license-plates/license-plate-helpers";
import { getSalesDashboardSummary } from "@/lib/sales/sale-queries";
import { getVehicleDashboardSummary } from "@/lib/vehicles/vehicle-queries";
import { getPurchaseDashboardSummary } from "@/lib/purchases/purchase-queries";
import {
    getMonthFilterDateRange,
    normalizeMonthFilter,
} from "@/utils/month-filter";

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
    const dateRange = getMonthFilterDateRange(monthFilter);
    const [
        customersCount,
        vehicleSummary,
        salesSummary,
        invoiceSummary,
        documentSummary,
        cashbookSummary,
        licensePlateSummary,
        purchaseSummary,
    ] = await Promise.all([
        getCustomersCount(),
        getVehicleDashboardSummary(),
        getSalesDashboardSummary(monthFilter),
        getInvoiceDashboardSummary(monthFilter),
        getDocumentDashboardSummary(),
        getCashbookSummary({
            from: dateRange?.from ?? null,
            to: dateRange?.to ?? null,
        }),
        getLicensePlateDashboardSummary(),
        getPurchaseDashboardSummary(),
    ]);

    const openActions: DashboardData["openActions"] = [];

    if (salesSummary.openInvoicesCount > 0) {
        openActions.push({
            label: `${salesSummary.openInvoicesCount} offene Zahlung(en)`,
            description: "Offene Verkaufszahlungen prüfen oder Kassenbuch aktualisieren.",
            href: "/dashboard/sales?paymentStatus=open",
            tone: "warning",
        });
    }

    if (licensePlateSummary.activeCount > 0) {
        openActions.push({
            label: `${licensePlateSummary.activeCount} offene Kennzeichen-Vorgänge`,
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

    if (vehicleSummary.vehiclesWithOpenDocumentsCount > 0) {
        openActions.push({
            label: `${vehicleSummary.vehiclesWithOpenDocumentsCount} Fahrzeugakte(n) prüfen`,
            description: "Pflichtdokumente im Fahrzeugbestand ergänzen.",
            href: "/dashboard/vehicles",
            tone: "danger",
        });
    }

    if (documentSummary.incompleteDocumentsCount > 0) {
        openActions.push({
            label: `${documentSummary.incompleteDocumentsCount} Dokument(e) prüfen`,
            description: "Dokumentenarchiv auf fehlende oder zu prüfende Dateien kontrollieren.",
            href: "/dashboard/documents?status=open",
            tone: "info",
        });
    }

    return {
        customersCount,
        vehiclesCount: vehicleSummary.vehiclesCount,
        currentVehiclesCount: vehicleSummary.currentVehiclesCount,
        soldVehiclesCount: vehicleSummary.soldVehiclesCount,
        salesCount: salesSummary.salesCount,
        invoicesCount: invoiceSummary.invoicesCount,
        documentsCount: documentSummary.documentsCount,

        licensePlateCasesCount: licensePlateSummary.totalCount,
        openLicensePlateCasesCount: licensePlateSummary.openCount,
        requestedLicensePlateCasesCount: licensePlateSummary.requestedCount,
        completedLicensePlateCasesCount: licensePlateSummary.completedCount,

        purchaseCasesCount: purchaseSummary.purchaseCasesCount,
        openPurchasePaymentsCount: purchaseSummary.openPurchasePaymentsCount,
        incompletePurchaseDocumentsCount: purchaseSummary.incompletePurchaseDocumentsCount,
        completedPurchaseCasesCount: purchaseSummary.completedPurchaseCasesCount,

        openInvoicesCount: salesSummary.openInvoicesCount,
        incompleteDocumentsCount: documentSummary.incompleteDocumentsCount,
        totalRevenueNet: salesSummary.totalRevenueNet,
        totalProfitNet: salesSummary.totalProfitNet,
        cashbookBalance: cashbookSummary.balance,

        recentVehicles: vehicleSummary.recentVehicles,

        recentSales: salesSummary.recentSales,

        recentLicensePlateCases: licensePlateSummary.recentCases.map((item) => ({
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
