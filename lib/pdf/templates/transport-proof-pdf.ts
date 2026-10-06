import {
    StandardFonts,
    rgb,
    type PDFFont,
    type PDFPage,
} from "pdf-lib";

import { createPdfLayout } from "@/lib/pdf/core/pdf-layout";
import { formatPdfDate } from "@/lib/pdf/core/pdf-format";
import { drawCompanyDocumentHeader } from "@/lib/pdf/core/company-document-header";
import { drawSaleIdentifierOnEveryPage } from "@/lib/pdf/core/sale-identifier-footer";
import type { SaleGeneratedDocumentData } from "@/lib/pdf/generated-documents/sale-document-data";

function requireValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "—";

    const stringValue = String(value).trim();

    return stringValue.length > 0 ? stringValue : "—";
}

function getTransportTypeLabel(type: string | null | undefined): string {
    const labels: Record<string, string> = {
        self_pickup: "Abnehmer befördert selbst",
        customer_forwarder: "Spedition / Beauftragter des Abnehmers",
        seller_transport: "Lieferung durch WAW Nutzfahrzeuge",
        other: "Sonstige Verbringung",
    };

    if (!type) return "—";

    return labels[type] ?? type;
}

function getVehicleType(data: SaleGeneratedDocumentData): string {
    if (!data.vehicle) return "—";

    return [
        data.vehicle.manufacturer,
        data.vehicle.model,
        data.vehicle.vehicleType,
    ]
        .filter(Boolean)
        .join(" ")
        .trim() || "—";
}

function getDestination(data: SaleGeneratedDocumentData): string {
    return [
        data.export?.destinationCountry,
        data.export?.destinationCity,
    ]
        .filter(Boolean)
        .join(", ") || "—";
}

function getTransportDate(data: SaleGeneratedDocumentData): string {
    return formatPdfDate(data.documentDate?.usedDate ?? data.export?.transportDate ?? data.sale?.invoiceDate ?? null);
}

function getIssuerDate(data: SaleGeneratedDocumentData): string {
    return getTransportDate(data);
}

function splitLongWord(
    word: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
): string[] {
    const parts: string[] = [];
    let current = "";

    for (const character of word) {
        const next = `${current}${character}`;

        if (font.widthOfTextAtSize(next, size) <= maxWidth || current.length === 0) {
            current = next;
            continue;
        }

        parts.push(current);
        current = character;
    }

    if (current.length > 0) {
        parts.push(current);
    }

    return parts;
}

function wrapText(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
): string[] {
    const normalizedText = requireValue(text).replace(/\s+/g, " ").trim();

    if (normalizedText === "—") return ["—"];

    const words = normalizedText.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine.length > 0 ? `${currentLine} ${word}` : word;

        if (font.widthOfTextAtSize(testLine, size) <= maxWidth) {
            currentLine = testLine;
            continue;
        }

        if (currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = "";
        }

        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
            currentLine = word;
            continue;
        }

        const splitParts = splitLongWord(word, font, size, maxWidth);

        for (const part of splitParts) {
            if (currentLine.length > 0) {
                lines.push(currentLine);
            }

            currentLine = part;
        }
    }

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}

function drawWrappedText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    options: {
        font: PDFFont;
        size: number;
        maxWidth: number;
        lineHeight: number;
        color?: ReturnType<typeof rgb>;
        maxLines?: number;
    },
): number {
    const lines = wrapText(text, options.font, options.size, options.maxWidth);
    const visibleLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;

    visibleLines.forEach((line, index) => {
        page.drawText(line, {
            x,
            y: y - index * options.lineHeight,
            size: options.size,
            font: options.font,
            color: options.color ?? rgb(0, 0, 0),
        });
    });

    return y - visibleLines.length * options.lineHeight;
}

function drawLine(
    page: PDFPage,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
) {
    page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.8,
        color: rgb(0, 0, 0),
    });
}

function drawValueLine(
    page: PDFPage,
    params: {
        label: string;
        value: string;
        x: number;
        y: number;
        labelFont: PDFFont;
        valueFont: PDFFont;
        labelSize?: number;
        valueSize?: number;
        valueX?: number;
        lineEndX: number;
        valueMaxWidth?: number;
    },
): number {
    const labelSize = params.labelSize ?? 10;
    const valueSize = params.valueSize ?? 10;
    const valueX = params.valueX ?? params.x + 110;
    const valueMaxWidth = params.valueMaxWidth ?? params.lineEndX - valueX - 4;

    page.drawText(params.label, {
        x: params.x,
        y: params.y,
        size: labelSize,
        font: params.labelFont,
        color: rgb(0, 0, 0),
    });

    drawWrappedText(page, params.value, valueX, params.y, {
        font: params.valueFont,
        size: valueSize,
        maxWidth: valueMaxWidth,
        lineHeight: valueSize + 2,
        maxLines: 2,
    });

    drawLine(page, valueX, params.y - 4, params.lineEndX, params.y - 4);

    return params.y - 32;
}

function drawBlankLine(page: PDFPage, x: number, y: number, width: number): number {
    drawLine(page, x, y, x + width, y);

    return y - 24;
}

function drawCommunityTransportLine(
    page: PDFPage,
    params: {
        x: number;
        y: number;
        lineEndX: number;
        labelFont: PDFFont;
        valueFont: PDFFont;
        value: string;
    },
): number {
    const label = "Das Fahrzeug in das übrige Gemeinschaftsgebiet wie folgt:";
    const labelSize = 11;
    const valueSize = 10;

    page.drawText(label, {
        x: params.x,
        y: params.y,
        size: labelSize,
        font: params.labelFont,
        color: rgb(0, 0, 0),
    });

    const labelWidth = params.labelFont.widthOfTextAtSize(label, labelSize);
    const firstLineX = params.x + labelWidth + 8;
    const firstLineWidth = params.lineEndX - firstLineX;

    const valueLines = wrapText(
        params.value,
        params.valueFont,
        valueSize,
        firstLineWidth,
    );

    const firstLineValue = valueLines[0] ?? "";
    const remainingValue = valueLines.slice(1).join(" ");

    page.drawText(firstLineValue, {
        x: firstLineX + 3,
        y: params.y,
        size: valueSize,
        font: params.valueFont,
        color: rgb(0, 0, 0),
    });

    drawLine(page, firstLineX, params.y - 4, params.lineEndX, params.y - 4);

    if (remainingValue.length > 0) {
        const secondLineY = params.y - 24;

        drawWrappedText(page, remainingValue, params.x + 3, secondLineY, {
            font: params.valueFont,
            size: valueSize,
            maxWidth: params.lineEndX - params.x,
            lineHeight: 12,
            maxLines: 2,
        });

        drawLine(page, params.x, secondLineY - 4, params.lineEndX, secondLineY - 4);

        return secondLineY - 32;
    }

    const secondLineY = params.y - 24;
    drawLine(page, params.x, secondLineY - 4, params.lineEndX, secondLineY - 4);

    return secondLineY - 32;
}

export async function generateTransportProofPdf(
    data: SaleGeneratedDocumentData,
): Promise<Uint8Array> {
    if (!data.company || !data.customer || !data.vehicle || !data.sale || !data.export) {
        throw new Error(
            "Verbringungsnachweis konnte nicht erzeugt werden: Verkaufsdaten sind unvollständig.",
        );
    }

    const ctx = await createPdfLayout();
    const page = ctx.page;

    const timesRoman = await ctx.pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await ctx.pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const contentX = 70;
    const contentWidth = ctx.width - contentX * 2;
    const lineEndX = contentX + contentWidth;

    let y = await drawCompanyDocumentHeader(ctx, data);

    drawWrappedText(
        page,
        "Verbringungsnachweis und Empfangsbestätigung des Abnehmers gem. § 17a Abs. 2 Nr. 4 UStDV",
        contentX,
        y,
        {
            font: timesBold,
            size: 13,
            maxWidth: contentWidth,
            lineHeight: 16,
            maxLines: 2,
        },
    );

    y -= 54;

    y = drawValueLine(page, {
        label: "Das Fahrzeug Typ:",
        value: getVehicleType(data),
        x: contentX,
        y,
        labelFont: timesRoman,
        valueFont: timesRoman,
        labelSize: 11,
        valueSize: 10,
        valueX: contentX + 112,
        lineEndX,
    });

    y = drawValueLine(page, {
        label: "Fahrgestellnummer:",
        value: requireValue(data.vehicle.vin),
        x: contentX,
        y,
        labelFont: timesRoman,
        valueFont: timesRoman,
        labelSize: 11,
        valueSize: 10,
        valueX: contentX + 128,
        lineEndX,
    });

    y = drawBlankLine(page, contentX, y, contentWidth);
    y = drawBlankLine(page, contentX, y, contentWidth);
    y = drawBlankLine(page, contentX, y, contentWidth);

    y -= 4;

    y = drawValueLine(page, {
        label: "Am:",
        value: getTransportDate(data),
        x: contentX,
        y,
        labelFont: timesRoman,
        valueFont: timesRoman,
        labelSize: 11,
        valueSize: 10,
        valueX: contentX + 34,
        lineEndX: contentX + 210,
    });

    page.drawText("In Hamburg übergeben.", {
        x: contentX,
        y,
        size: 11,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    y -= 32;

    y = drawCommunityTransportLine(page, {
        x: contentX,
        y,
        lineEndX,
        labelFont: timesRoman,
        valueFont: timesRoman,
        value: `${getTransportTypeLabel(data.export.transportType)} nach ${getDestination(data)}`,
    });

    y -= 6;

    const assuranceText =
        "Der Abnehmer versichert, vorliegendes Geschäft in einer Eigenschaft als Unternehmer zu tätigen, dass ein Unternehmen innerhalb der Europäischen Union unter der angegebenen USt-IdNr. für Mehrwertsteuerzwecke registriert ist den innergemeinschaftlichen Erwerb in dem EU-Mitgliedstaat zu besteuern, in dem die USt-IdNr. registriert ist bzw. die Steuerschuld für die anschließende Lieferung im Falle eines Dreieckgeschäfts auf den eigenen im Bestimmungsland steuerpflichtigen Abnehmer zu übertragen und dass dem Erwerb kein sog. (§ 25a Geschäft) (Differenzbesteuerung) zugrunde liegt. Sofern der Liefergegenstand weiter veräußert wird, dem nachfolgenden Kunden die Verfügungsmacht und das Eigentum erst nach Verlassen der BR Deutschland (Grenzübertritt) übertragen wird.";

    y = drawWrappedText(page, assuranceText, contentX, y, {
        font: timesRoman,
        size: 10,
        maxWidth: contentWidth,
        lineHeight: 14,
    });

    y -= 30;

    y = drawValueLine(page, {
        label: "Hamburg den:",
        value: getIssuerDate(data),
        x: contentX,
        y,
        labelFont: timesRoman,
        valueFont: timesRoman,
        labelSize: 11,
        valueSize: 10,
        valueX: contentX + 90,
        lineEndX: contentX + 330,
    });

    y -= 28;

    y = drawBlankLine(page, contentX, y, 285);
    y = drawBlankLine(page, contentX, y, 285);
    y = drawBlankLine(page, contentX, y, 285);

    page.drawText("Unterschrift und Stempel vom Abnehmer/Beauftragter", {
        x: contentX,
        y: y + 8,
        size: 10,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    y -= 42;

    drawBlankLine(page, contentX, y, 315);

    await drawSaleIdentifierOnEveryPage(
        ctx.pdfDoc,
        requireValue(data.sale.saleIdentifier),
    );

    return ctx.pdfDoc.save();
}
