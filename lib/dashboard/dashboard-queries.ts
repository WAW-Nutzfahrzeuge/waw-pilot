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

    const currentVehicles = vehicles.filter(
        (vehicle) => vehicle.status === "in_stock" || vehicle.status === "reserved",
    );

    const soldVehicles = vehicles.filter((vehicle) => vehicle.status === "sold");

    const filteredSales = sales.filter((sale) =>
        matchesMonthFilter(sale.sale_date, monthFilter),
    );

    const filteredInvoices = invoices.filter((invoice) =>
        matchesMonthFilter(invoice.invoice_date, monthFilter),
    );

    const filteredCashbookEntries = cashbookEntries.filter((entry) =>
        matchesMonthFilter(entry.booking_date, monthFilter),
    );

    const totalRevenueNet = filteredSales.reduce((sum, sale) => sum + sale.net_amount, 0);

    const totalProfitNet = filteredSales.reduce(
        (sum, sale) => sum + getSaleProfitNet(sale),
        0,
    );

    const openInvoices = filteredSales.filter(
        (sale) => sale.payment_status !== "paid",
    );

    const incompleteDocuments = documents.filter(
        (document) => document.status !== "available",
    );

    const vehiclesWithOpenDocuments = vehicles.filter(
        (vehicle) => vehicle.document_status !== "complete",
    );

    const openLicensePlateCases = licensePlateCases.filter(
        (item) => item.status === "open",
    );

    const requestedLicensePlateCases = licensePlateCases.filter(
        (item) => item.status === "requested",
    );

    const completedLicensePlateCases = licensePlateCases.filter(
        (item) => item.status === "completed",
    );

    const activeLicensePlateCases = licensePlateCases.filter(
        (item) => item.status === "open" || item.status === "requested",
    );

    const openPurchasePayments = purchaseCases.filter(
        (purchase) => purchase.payment_status !== "paid",
    );

    const incompletePurchaseDocuments = purchaseCases.filter(
        (purchase) => purchase.document_check_status !== "complete",
    );

    const completedPurchaseCases = purchaseCases.filter(
        (purchase) => purchase.status === "completed",
    );

    const openActions: DashboardData["openActions"] = [];

    if (openInvoices.length > 0) {
        openActions.push({
            label: `${openInvoices.length} offene Zahlung(en)`,
            description: "Offene Verkaufszahlungen prüfen oder Kassenbuch aktualisieren.",
            href: "/dashboard/sales?paymentStatus=open",
            tone: "warning",
        });
    }

    if (activeLicensePlateCases.length > 0) {
        openActions.push({
            label: `${activeLicensePlateCases.length} offene Kennzeichen-Vorgänge`,
            description: "Kurzzeit-, Export- oder Zollkennzeichen weiterbearbeiten.",
            href: "/dashboard/plates",
            tone: "warning",
        });
    }

    if (openPurchasePayments.length > 0) {
        openActions.push({
            label: `${openPurchasePayments.length} offene Ankaufszahlung(en)`,
            description: "Zahlungsstatus der Ankaufsakten prüfen.",
            href: "/dashboard/ankauf",
            tone: "warning",
        });
    }

    if (incompletePurchaseDocuments.length > 0) {
        openActions.push({
            label: `${incompletePurchaseDocuments.length} Ankaufsakte(n) mit fehlenden Dokumenten`,
            description: "Einkaufsrechnung, Ankaufsvertrag oder Verkäufer-Ausweis ergänzen.",
            href: "/dashboard/ankauf",
            tone: "danger",
        });
    }

    if (vehiclesWithOpenDocuments.length > 0) {
        openActions.push({
            label: `${vehiclesWithOpenDocuments.length} Fahrzeugakte(n) prüfen`,
            description: "Pflichtdokumente im Fahrzeugbestand ergänzen.",
            href: "/dashboard/vehicles",
            tone: "danger",
        });
    }

    if (incompleteDocuments.length > 0) {
        openActions.push({
            label: `${incompleteDocuments.length} Dokument(e) prüfen`,
            description: "Dokumentenarchiv auf fehlende oder zu prüfende Dateien kontrollieren.",
            href: "/dashboard/documents?status=open",
            tone: "info",
        });
    }

    return {
        customersCount: customers.length,
        vehiclesCount: vehicles.length,
        currentVehiclesCount: currentVehicles.length,
        soldVehiclesCount: soldVehicles.length,
        salesCount: filteredSales.length,
        invoicesCount: filteredInvoices.length,
        documentsCount: documents.length,

        licensePlateCasesCount: licensePlateCases.length,
        openLicensePlateCasesCount: openLicensePlateCases.length,
        requestedLicensePlateCasesCount: requestedLicensePlateCases.length,
        completedLicensePlateCasesCount: completedLicensePlateCases.length,

        purchaseCasesCount: purchaseCases.length,
        openPurchasePaymentsCount: openPurchasePayments.length,
        incompletePurchaseDocumentsCount: incompletePurchaseDocuments.length,
        completedPurchaseCasesCount: completedPurchaseCases.length,

        openInvoicesCount: openInvoices.length,
        incompleteDocumentsCount: incompleteDocuments.length,
        totalRevenueNet,
        totalProfitNet,
        cashbookBalance: calculateBalance(filteredCashbookEntries),

        recentVehicles: vehicles.slice(0, 4).map((vehicle) => ({
            id: vehicle.id,
            internalNumber: vehicle.internal_number,
            name: `${vehicle.manufacturer} ${vehicle.model}`,
            status: vehicle.status,
            createdAt: vehicle.created_at,
        })),

        recentSales: filteredSales.slice(0, 4).map((sale) => ({
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
