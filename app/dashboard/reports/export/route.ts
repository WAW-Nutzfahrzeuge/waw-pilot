import {
    getReportsData,
    parseReportsFilters,
} from "@/lib/reports/report-queries";
import { getTodayDateOnly } from "@/lib/format/date";

type ReportsData = Awaited<ReturnType<typeof getReportsData>>;

function escapeCsvValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";

    const stringValue = String(value);

    if (
        stringValue.includes(";") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
    ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
}

function createCsvRow(values: (string | number | null | undefined)[]): string {
    return values.map(escapeCsvValue).join(";");
}

function formatStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        open: "Offen",
        partial: "Teilweise bezahlt",
        paid: "Bezahlt",
        draft: "Entwurf",
        active: "Aktiv",
        completed: "Abgeschlossen",
        cancelled: "Storniert",
    };

    return labels[status] ?? status;
}

function addEmptyDataHint(rows: string[], columnCount: number) {
    rows.push(
        createCsvRow([
            "Keine Daten vorhanden",
            ...Array.from({ length: Math.max(columnCount - 1, 0) }, () => ""),
        ]),
    );
}

function addSectionTitle(rows: string[], title: string) {
    rows.push("");
    rows.push(createCsvRow([title]));
}

function createReportsCsv(data: ReportsData): string {
    const rows: string[] = [];

    rows.push(createCsvRow(["WAW Bericht"]));
    rows.push(createCsvRow(["Exportiert am", getTodayDateOnly()]));
    rows.push(createCsvRow(["Zeitraum", data.periodLabel]));
    rows.push(createCsvRow(["Von", data.dateFrom ?? ""]));
    rows.push(createCsvRow(["Bis", data.dateTo ?? ""]));

    addSectionTitle(rows, "Kennzahlen");
    rows.push(createCsvRow(["Kennzahl", "Wert"]));
    rows.push(createCsvRow(["Umsatz netto", data.totalRevenueNet]));
    rows.push(createCsvRow(["Umsatz brutto", data.totalSalesGross]));
    rows.push(createCsvRow(["Rohgewinn netto", data.totalProfitNet]));
    rows.push(createCsvRow(["Durchschnittlicher Rohgewinn netto", data.averageProfitNet]));
    rows.push(createCsvRow(["Einkauf netto", data.totalPurchaseNet]));
    rows.push(createCsvRow(["Einkauf brutto", data.totalPurchaseGross]));
    rows.push(createCsvRow(["Offene Rechnungen brutto", data.openInvoicesGross]));
    rows.push(createCsvRow(["Offene Rechnungen Anzahl", data.openInvoicesCount]));
    rows.push(createCsvRow(["Offene Ankaufszahlungen brutto", data.openPurchasePaymentsGross]));
    rows.push(createCsvRow(["Kassenbuch Einnahmen", data.cashbookIncome]));
    rows.push(createCsvRow(["Kassenbuch Ausgaben", data.cashbookExpenses]));
    rows.push(createCsvRow(["Kassenbuch Saldo", data.cashbookBalance]));
    rows.push(createCsvRow(["Fahrzeuge gesamt", data.vehiclesCount]));
    rows.push(createCsvRow(["Fahrzeuge im Bestand", data.currentVehiclesCount]));
    rows.push(createCsvRow(["Fahrzeuge verkauft", data.soldVehiclesCount]));
    rows.push(createCsvRow(["Bestandswert netto", data.inventoryValueNet]));

    addSectionTitle(rows, "Top Verkäufe nach Umsatz");
    rows.push(
        createCsvRow([
            "Rechnung",
            "Kunde",
            "Fahrzeug",
            "Datum",
            "Umsatz netto",
            "Rohgewinn netto",
        ]),
    );

    if (data.topSalesByRevenue.length > 0) {
        data.topSalesByRevenue.forEach((sale) => {
            rows.push(
                createCsvRow([
                    sale.invoiceNumber ?? "",
                    sale.customerName,
                    sale.vehicleName,
                    sale.saleDate,
                    sale.revenueNet,
                    sale.profitNet,
                ]),
            );
        });
    } else {
        addEmptyDataHint(rows, 6);
    }

    addSectionTitle(rows, "Top Verkäufe nach Rohgewinn");
    rows.push(
        createCsvRow([
            "Rechnung",
            "Kunde",
            "Fahrzeug",
            "Datum",
            "Umsatz netto",
            "Rohgewinn netto",
        ]),
    );

    if (data.topSalesByProfit.length > 0) {
        data.topSalesByProfit.forEach((sale) => {
            rows.push(
                createCsvRow([
                    sale.invoiceNumber ?? "",
                    sale.customerName,
                    sale.vehicleName,
                    sale.saleDate,
                    sale.revenueNet,
                    sale.profitNet,
                ]),
            );
        });
    } else {
        addEmptyDataHint(rows, 6);
    }

    addSectionTitle(rows, "Teuerste Ankäufe");
    rows.push(
        createCsvRow([
            "Ankaufsnummer",
            "Verkäufer",
            "Fahrzeug",
            "Datum",
            "Brutto",
            "Zahlungsstatus",
        ]),
    );

    if (data.topPurchasesByAmount.length > 0) {
        data.topPurchasesByAmount.forEach((purchase) => {
            rows.push(
                createCsvRow([
                    purchase.purchaseNumber ?? "",
                    purchase.sellerName ?? "",
                    purchase.vehicleName ?? "",
                    purchase.purchaseDate,
                    purchase.grossAmount,
                    formatStatusLabel(purchase.paymentStatus),
                ]),
            );
        });
    } else {
        addEmptyDataHint(rows, 6);
    }

    addSectionTitle(rows, "Offene Rechnungen");
    rows.push(
        createCsvRow([
            "Rechnung",
            "Kunde",
            "Fahrzeug",
            "Datum",
            "Brutto offen",
        ]),
    );

    if (data.openInvoices.length > 0) {
        data.openInvoices.forEach((invoice) => {
            rows.push(
                createCsvRow([
                    invoice.invoiceNumber,
                    invoice.customerName,
                    invoice.vehicleName,
                    invoice.invoiceDate,
                    invoice.grossAmount,
                ]),
            );
        });
    } else {
        addEmptyDataHint(rows, 5);
    }

    addSectionTitle(rows, "Offene Ankäufe");
    rows.push(
        createCsvRow([
            "Ankaufsnummer",
            "Verkäufer",
            "Fahrzeug",
            "Datum",
            "Brutto offen",
        ]),
    );

    if (data.openPurchases.length > 0) {
        data.openPurchases.forEach((purchase) => {
            rows.push(
                createCsvRow([
                    purchase.purchaseNumber ?? "",
                    purchase.sellerName ?? "",
                    purchase.vehicleName ?? "",
                    purchase.purchaseDate,
                    purchase.grossAmount,
                ]),
            );
        });
    } else {
        addEmptyDataHint(rows, 5);
    }

    return rows.join("\n");
}

function createExportFileName(data: ReportsData): string {
    const today = getTodayDateOnly();

    if (data.dateFrom || data.dateTo) {
        return `waw-bericht-${data.dateFrom ?? "start"}-bis-${
            data.dateTo ?? today
        }.csv`;
    }

    return `waw-bericht-insgesamt-${today}.csv`;
}

export async function GET(request: Request) {
    const url = new URL(request.url);

    const filters = parseReportsFilters({
        period: url.searchParams.get("period") ?? undefined,
        date_from: url.searchParams.get("date_from") ?? undefined,
        date_to: url.searchParams.get("date_to") ?? undefined,
    });

    const data = await getReportsData(filters);
    const csv = createReportsCsv(data);
    const fileName = createExportFileName(data);

    return new Response(`\uFEFF${csv}`, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fileName}"`,
        },
    });
}
