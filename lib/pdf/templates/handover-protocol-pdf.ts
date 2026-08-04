import { rgb } from "pdf-lib";

import {
    createPdfLayout,
    drawText,
} from "@/lib/pdf/core/pdf-layout";
import { pdfTheme } from "@/lib/pdf/core/pdf-theme";
import { formatPdfDate } from "@/lib/pdf/core/pdf-format";
import { drawCompanyDocumentHeader } from "@/lib/pdf/core/company-document-header";
import type { SaleGeneratedDocumentData } from "@/lib/pdf/generated-documents/sale-document-data";
import {
    embedCompanyPdfImage,
    type CompanySignatureStampAssets,
} from "@/lib/pdf/company-signature-assets";

function requireValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "—";

    const stringValue = String(value).trim();

    return stringValue.length > 0 ? stringValue : "—";
}

function getCustomerAddress(data: SaleGeneratedDocumentData): string {
    if (!data.customer) return "—";

    return [
        data.customer.street,
        [data.customer.postalCode, data.customer.city].filter(Boolean).join(" "),
        data.customer.country,
    ]
        .filter(Boolean)
        .join(", ");
}

function getVehicleType(data: SaleGeneratedDocumentData): string {
    if (!data.vehicle) return "—";

    return [
        data.vehicle.manufacturer,
        data.vehicle.model,
        data.vehicle.vehicleType ? `(${data.vehicle.vehicleType})` : null,
    ]
        .filter(Boolean)
        .join(" ")
        .trim() || "—";
}

function getVehicleNumber(data: SaleGeneratedDocumentData): string {
    if (!data.vehicle) return "—";

    return [
        data.vehicle.vin,
        data.vehicle.internalNumber,
    ]
        .filter(Boolean)
        .join(" / ") || "—";
}

function getConstructionYearLabel(data: SaleGeneratedDocumentData): string {
    if (!data.vehicle) return "—";

    return data.vehicle.constructionYear
        ? String(data.vehicle.constructionYear)
        : "—";
}

function getSaleReference(data: SaleGeneratedDocumentData): string {
    return requireValue(data.sale?.saleNumber ?? data.sale?.invoiceNumber);
}

function getDocumentDate(data: SaleGeneratedDocumentData): string {
    return formatPdfDate(data.documentDate?.usedDate ?? data.sale?.invoiceDate ?? null);
}

async function drawSignatureStampImages(
    ctx: Awaited<ReturnType<typeof createPdfLayout>>,
    signatureY: number,
    assets?: CompanySignatureStampAssets & { include: boolean },
) {
    if (!assets?.include) return;

    const signatureImage = assets.signatureImage
        ? await embedCompanyPdfImage(ctx.pdfDoc, assets.signatureImage)
        : null;
    const stampImage = assets.stampImage
        ? await embedCompanyPdfImage(ctx.pdfDoc, assets.stampImage)
        : null;

    if (signatureImage) {
        const width = 165;
        const height = Math.min(
            58,
            (signatureImage.height / signatureImage.width) * width,
        );

        ctx.page.drawImage(signatureImage, {
            x: ctx.margin + 8,
            y: signatureY + 4,
            width,
            height,
        });
    }

    if (stampImage) {
        const width = 105;
        const height = Math.min(76, (stampImage.height / stampImage.width) * width);

        ctx.page.drawImage(stampImage, {
            x: ctx.margin + 190,
            y: signatureY + 2,
            width,
            height,
        });
    }
}

function drawFormRow(
    ctx: Awaited<ReturnType<typeof createPdfLayout>>,
    params: {
        label: string;
        value: string;
        x: number;
        y: number;
        rowHeight?: number;
    },
): number {
    const valueX = params.x + 220;
    const valueWidth = ctx.width - ctx.margin - valueX;
    const rowHeight = params.rowHeight ?? 36;

    drawText(ctx, params.label, params.x, params.y, {
        size: 10,
        bold: true,
        color: pdfTheme.colors.text,
        maxWidth: 205,
        lineHeight: 12,
    });

    drawText(ctx, params.value, valueX, params.y, {
        size: 10,
        color: pdfTheme.colors.text,
        maxWidth: valueWidth,
        lineHeight: 13,
    });

    return params.y - rowHeight;
}

function drawSimpleLine(
    ctx: Awaited<ReturnType<typeof createPdfLayout>>,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
) {
    ctx.page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 1,
        color: rgb(0.08, 0.08, 0.08),
    });
}

export async function generateHandoverProtocolPdf(
    data: SaleGeneratedDocumentData,
    options: {
        signatureStamp?: CompanySignatureStampAssets & { include: boolean };
    } = {},
): Promise<Uint8Array> {
    if (!data.company || !data.customer || !data.vehicle || !data.sale) {
        throw new Error(
            "Übergabeprotokoll konnte nicht erzeugt werden: Verkaufsdaten sind unvollständig.",
        );
    }

    const ctx = await createPdfLayout();

    let y = await drawCompanyDocumentHeader(ctx, data);

    drawText(
        ctx,
        `Übergabeprotokoll zur Verkaufsnummer: ${getSaleReference(data)}`,
        ctx.margin,
        y,
        {
            size: 18,
            bold: true,
            color: pdfTheme.colors.text,
            maxWidth: 360,
            lineHeight: 22,
        },
    );

    y -= 58;

    drawText(ctx, "Sehr geehrte Kundin, sehr geehrter Kunde", ctx.margin, y, {
        size: 11,
        bold: true,
        color: pdfTheme.colors.text,
    });

    y -= 24;

    drawText(
        ctx,
        "wir bedanken uns für Ihr Vertrauen, dass Sie uns mit dem Kauf eines Fahrzeugs entgegengebracht haben. Folgende Dokumente und Zubehör haben wir Ihnen verbunden mit dem Fahrzeug ausgehändigt.",
        ctx.margin,
        y,
        {
            size: 10,
            color: pdfTheme.colors.text,
            maxWidth: ctx.width - ctx.margin * 2,
            lineHeight: 14,
        },
    );

    y -= 76;

    y = drawFormRow(ctx, {
        label: "Firma/Käufer:",
        value:
            [
                requireValue(data.customer.name),
                getCustomerAddress(data),
            ]
                .filter((item) => item !== "—")
                .join(", ") || "—",
        x: ctx.margin,
        y,
        rowHeight: 40,
    });

    y = drawFormRow(ctx, {
        label: "Fahrzeugtyp:",
        value: getVehicleType(data),
        x: ctx.margin,
        y,
        rowHeight: 36,
    });

    y = drawFormRow(ctx, {
        label: "Fahrgestellnummer/Fahrzeug-Nr.:",
        value: getVehicleNumber(data),
        x: ctx.margin,
        y,
        rowHeight: 42,
    });

    y = drawFormRow(ctx, {
        label: "Baujahr:",
        value: getConstructionYearLabel(data),
        x: ctx.margin,
        y,
        rowHeight: 38,
    });

    y -= 10;

    const checklistItems = [
        "Fahrzeugschein & Brief",
        "Fahrzeugschlüssel",
        "Fahrzeug",
    ];

    for (const item of checklistItems) {
        drawText(ctx, `- ${item}`, ctx.margin + 18, y, {
            size: 10,
            bold: true,
            color: pdfTheme.colors.text,
        });

        y -= 22;
    }

    y -= 8;

    drawText(ctx, "wurden Ihnen übergeben.", ctx.margin, y, {
        size: 10,
        color: pdfTheme.colors.text,
    });

    y -= 72;

    const signatureY = y - 18;
    const signatureLineWidth = 230;
    const includeSignatureStamp = Boolean(options.signatureStamp?.include);

    if (!includeSignatureStamp) {
        drawText(ctx, "Unterschrift und Stempel", ctx.margin, signatureY + 28, {
            size: 10,
            bold: true,
            color: pdfTheme.colors.text,
        });
    }

    drawSimpleLine(
        ctx,
        ctx.margin,
        signatureY,
        ctx.margin + signatureLineWidth,
        signatureY,
    );

    await drawSignatureStampImages(ctx, signatureY, options.signatureStamp);

    const dateX = ctx.margin + 310;

    drawText(ctx, `Datum: ${getDocumentDate(data)}`, dateX, signatureY + 48, {
        size: 10,
        bold: true,
        color: pdfTheme.colors.text,
    });

    drawSimpleLine(
        ctx,
        dateX,
        signatureY,
        ctx.width - ctx.margin,
        signatureY,
    );

    return ctx.pdfDoc.save();
}
