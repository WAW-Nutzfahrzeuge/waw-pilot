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

    let currentVehiclesCount = 0;
    let soldVehiclesCount = 0;
    let vehiclesWithOpenDocumentsCount = 0;

    for (const vehicle of vehicles) {
        if (vehicle.status === "in_stock" || vehicle.status === "reserved") {
            currentVehiclesCount += 1;
        }

        if (vehicle.status === "sold") {
            soldVehiclesCount += 1;
        }

        if (vehicle.document_status !== "complete") {
            vehiclesWithOpenDocumentsCount += 1;
        }
    }

    const recentFilteredSales: typeof sales = [];
    let salesCount = 0;
    let openInvoicesCount = 0;
    let totalRevenueNet = 0;
    let totalProfitNet = 0;

    for (const sale of sales) {
        if (!matchesMonthFilter(sale.sale_date, monthFilter)) continue;

        if (recentFilteredSales.length < 4) {
            recentFilteredSales.push(sale);
        }

        salesCount += 1;
        if (sale.payment_status !== "paid") {
            openInvoicesCount += 1;
        }
        totalRevenueNet += sale.net_amount;
        totalProfitNet += getSaleProfitNet(sale);
    }

    let filteredInvoicesCount = 0;
    for (const invoice of invoices) {
        if (matchesMonthFilter(invoice.invoice_date, monthFilter)) {
            filteredInvoicesCount += 1;
        }
    }

    const filteredCashbookEntries: typeof cashbookEntries = [];
    for (const entry of cashbookEntries) {
        if (matchesMonthFilter(entry.booking_date, monthFilter)) {
            filteredCashbookEntries.push(entry);
        }
    }

    let incompleteDocumentsCount = 0;
    for (const document of documents) {
        if (document.status !== "available") {
            incompleteDocumentsCount += 1;
        }
    }

    let openLicensePlateCasesCount = 0;
    let requestedLicensePlateCasesCount = 0;
    let completedLicensePlateCasesCount = 0;
    let activeLicensePlateCasesCount = 0;

    for (const item of licensePlateCases) {
        if (item.status === "open") {
            openLicensePlateCasesCount += 1;
            activeLicensePlateCasesCount += 1;
        }

        if (item.status === "requested") {
            requestedLicensePlateCasesCount += 1;
            activeLicensePlateCasesCount += 1;
        }

        if (item.status === "completed") {
            completedLicensePlateCasesCount += 1;
        }
    }

    let openPurchasePaymentsCount = 0;
    let incompletePurchaseDocumentsCount = 0;
    let completedPurchaseCasesCount = 0;

    for (const purchase of purchaseCases) {
        if (purchase.payment_status !== "paid") {
            openPurchasePaymentsCount += 1;
        }

        if (purchase.document_check_status !== "complete") {
            incompletePurchaseDocumentsCount += 1;
        }

        if (purchase.status === "completed") {
            completedPurchaseCasesCount += 1;
        }
    }

    const openActions: DashboardData["openActions"] = [];

    if (openInvoicesCount > 0) {
        openActions.push({
            label: `${openInvoicesCount} offene Zahlung(en)`,
            description: "Offene Verkaufszahlungen prüfen oder Kassenbuch aktualisieren.",
            href: "/dashboard/sales?paymentStatus=open",
            tone: "warning",
        });
    }

    if (activeLicensePlateCasesCount > 0) {
        openActions.push({
            label: `${activeLicensePlateCasesCount} offene Kennzeichen-Vorgänge`,
            description: "Kurzzeit-, Export- oder Zollkennzeichen weiterbearbeiten.",
            href: "/dashboard/plates",
            tone: "warning",
        });
    }

    if (openPurchasePaymentsCount > 0) {
        openActions.push({
            label: `${openPurchasePaymentsCount} offene Ankaufszahlung(en)`,
            description: "Zahlungsstatus der Ankaufsakten prüfen.",
            href: "/dashboard/ankauf",
            tone: "warning",
        });
    }

    if (incompletePurchaseDocumentsCount > 0) {
        openActions.push({
            label: `${incompletePurchaseDocumentsCount} Ankaufsakte(n) mit fehlenden Dokumenten`,
            description: "Einkaufsrechnung, Ankaufsvertrag oder Verkäufer-Ausweis ergänzen.",
            href: "/dashboard/ankauf",
            tone: "danger",
        });
    }

    if (vehiclesWithOpenDocumentsCount > 0) {
        openActions.push({
            label: `${vehiclesWithOpenDocumentsCount} Fahrzeugakte(n) prüfen`,
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
        currentVehiclesCount,
        soldVehiclesCount,
        salesCount,
        invoicesCount: filteredInvoicesCount,
        documentsCount: documents.length,

        licensePlateCasesCount: licensePlateCases.length,
        openLicensePlateCasesCount,
        requestedLicensePlateCasesCount,
        completedLicensePlateCasesCount,

        purchaseCasesCount: purchaseCases.length,
        openPurchasePaymentsCount,
        incompletePurchaseDocumentsCount,
        completedPurchaseCasesCount,

        openInvoicesCount,
        incompleteDocumentsCount,
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

        recentSales: recentFilteredSales.map((sale) => ({
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
