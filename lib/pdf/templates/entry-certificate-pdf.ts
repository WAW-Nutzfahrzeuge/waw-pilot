import {
    StandardFonts,
    rgb,
    type PDFFont,
    type PDFPage,
} from "pdf-lib";

import { createPdfLayout } from "@/lib/pdf/core/pdf-layout";
import { formatPdfDate } from "@/lib/pdf/core/pdf-format";
import { drawCompanyDocumentHeader } from "@/lib/pdf/core/company-document-header";
import type { SaleGeneratedDocumentData } from "@/lib/pdf/generated-documents/sale-document-data";

function requireValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "—";

    const stringValue = String(value).trim();

    return stringValue.length > 0 ? stringValue : "—";
}

function getArrivalMonthLabel(month: string | null | undefined): string {
    const labels: Record<string, string> = {
        "01": "Januar",
        "02": "Februar",
        "03": "März",
        "04": "April",
        "05": "Mai",
        "06": "Juni",
        "07": "Juli",
        "08": "August",
        "09": "September",
        "10": "Oktober",
        "11": "November",
        "12": "Dezember",
    };

    if (!month) return "—";

    return labels[month] ?? month;
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

function getCustomerLine(data: SaleGeneratedDocumentData): string {
    return [
        requireValue(data.customer?.name),
        getCustomerAddress(data),
        data.customer?.email ? `E-Mail: ${data.customer.email}` : null,
    ]
        .filter(Boolean)
        .join(", ");
}

function getVehicleDescription(data: SaleGeneratedDocumentData): string {
    if (!data.vehicle) return "—";

    return [
        data.vehicle.manufacturer,
        data.vehicle.model,
        data.vehicle.vehicleType,
        data.vehicle.vin ? `Fahrzeug-Identifikationsnummer: ${data.vehicle.vin}` : null,
    ]
        .filter(Boolean)
        .join(", ")
        .trim() || "—";
}

function getArrivalPeriod(data: SaleGeneratedDocumentData): string {
    if (data.documentDate?.usedDate) {
        const [, month, year] = formatPdfDate(data.documentDate.usedDate).split(".");
        return `${getArrivalMonthLabel(month)} ${year}`;
    }

    const month = getArrivalMonthLabel(data.export?.arrivalMonth);
    const year = requireValue(data.export?.arrivalYear);

    if (month === "—" && year === "—") return "—";

    return `${month} ${year}`.trim();
}

function getDestination(data: SaleGeneratedDocumentData): string {
    return [
        data.export?.destinationCountry,
        data.export?.destinationCity,
    ]
        .filter(Boolean)
        .join(", ") || "—";
}

function getIssuerDate(data: SaleGeneratedDocumentData): string {
    return formatPdfDate(data.documentDate?.usedDate ?? data.sale?.invoiceDate ?? null);
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

function drawTextLine(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    options: {
        font: PDFFont;
        size: number;
        maxWidth?: number;
        lineHeight?: number;
        color?: ReturnType<typeof rgb>;
        maxLines?: number;
    },
): number {
    const lines = options.maxWidth
        ? wrapText(text, options.font, options.size, options.maxWidth)
        : [text];

    const visibleLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;
    const lineHeight = options.lineHeight ?? options.size + 2;

    visibleLines.forEach((line, index) => {
        page.drawText(line, {
            x,
            y: y - index * lineHeight,
            size: options.size,
            font: options.font,
            color: options.color ?? rgb(0, 0, 0),
        });
    });

    return y - visibleLines.length * lineHeight;
}

function drawCenteredText(
    page: PDFPage,
    text: string,
    centerX: number,
    y: number,
    options: {
        font: PDFFont;
        size: number;
        maxWidth: number;
        lineHeight?: number;
        color?: ReturnType<typeof rgb>;
    },
): number {
    const lines = wrapText(text, options.font, options.size, options.maxWidth);
    const lineHeight = options.lineHeight ?? options.size + 3;

    lines.forEach((line, index) => {
        const textWidth = options.font.widthOfTextAtSize(line, options.size);

        page.drawText(line, {
            x: centerX - textWidth / 2,
            y: y - index * lineHeight,
            size: options.size,
            font: options.font,
            color: options.color ?? rgb(0, 0, 0),
        });
    });

    return y - lines.length * lineHeight;
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
        thickness: 0.7,
        color: rgb(0, 0, 0),
    });
}

function drawValueAboveLine(
    page: PDFPage,
    params: {
        value: string;
        hint: string;
        x: number;
        lineY: number;
        width: number;
        valueFont: PDFFont;
        hintFont: PDFFont;
        valueSize?: number;
        hintSize?: number;
        valueMaxLines?: number;
        hintMaxLines?: number;
    },
) {
    const valueSize = params.valueSize ?? 9;
    const hintSize = params.hintSize ?? 6.2;
    const valueLines = wrapText(params.value, params.valueFont, valueSize, params.width);
    const visibleValueLines = valueLines.slice(0, params.valueMaxLines ?? 2);
    const valueLineHeight = valueSize + 2;
    const valueStartY = params.lineY + 6 + (visibleValueLines.length - 1) * valueLineHeight;

    visibleValueLines.forEach((line, index) => {
        page.drawText(line, {
            x: params.x + 2,
            y: valueStartY - index * valueLineHeight,
            size: valueSize,
            font: params.valueFont,
            color: rgb(0, 0, 0),
        });
    });

    drawLine(page, params.x, params.lineY, params.x + params.width, params.lineY);

    const hintLines = wrapText(params.hint, params.hintFont, hintSize, params.width);
    const visibleHintLines = hintLines.slice(0, params.hintMaxLines ?? 3);
    const hintLineHeight = hintSize + 1.4;

    visibleHintLines.forEach((line, index) => {
        page.drawText(line, {
            x: params.x + 2,
            y: params.lineY - 11 - index * hintLineHeight,
            size: hintSize,
            font: params.hintFont,
            color: rgb(0, 0, 0),
        });
    });
}

export async function generateEntryCertificatePdf(
    data: SaleGeneratedDocumentData,
): Promise<Uint8Array> {
    if (!data.company || !data.customer || !data.vehicle || !data.sale || !data.export) {
        throw new Error(
            "Gelangensbestätigung konnte nicht erzeugt werden: Verkaufsdaten sind unvollständig.",
        );
    }

    const ctx = await createPdfLayout();
    const page = ctx.page;

    const timesRoman = await ctx.pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await ctx.pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const contentX = 82;
    const contentWidth = ctx.width - contentX * 2;
    const centerX = ctx.width / 2;

    // Keep the legal title block below the company header and derive the
    // customer field position from the rendered number of title lines.
    let y = (await drawCompanyDocumentHeader(ctx, data)) + 16;

    drawCenteredText(
        page,
        "Anlage 1 zum Umsatzsteuer-Anwendungserlass (zu Abschnitt 6a.4)",
        centerX,
        y,
        {
            font: timesBold,
            size: 11,
            maxWidth: contentWidth,
        },
    );

    y -= 10;

    y = drawCenteredText(
        page,
        "- Muster einer Gelangensbestätigung im Sinne des § 17a Abs. 2 Nr. 2 UStDV -",
        centerX,
        y,
        {
            font: timesRoman,
            size: 9,
            maxWidth: contentWidth,
        },
    );

    y -= 16;

    y = drawCenteredText(
        page,
        "Bestätigung über das Gelangen des Gegenstands einer innergemeinschaftlichen Lieferung in einen anderen EU-Mitgliedstaat (Gelangensbestätigung)",
        centerX,
        y,
        {
            font: timesBold,
            size: 10,
            maxWidth: contentWidth,
            lineHeight: 13,
        },
    );

    /**
     * Name und Anschrift Abnehmer
     */
    const customerLineY = y - 18;

    drawValueAboveLine(page, {
        value: getCustomerLine(data),
        hint: "(Name und Anschrift des Abnehmers der innergemeinschaftlichen Lieferung, ggf. E-Mail-Adresse)",
        x: contentX,
        lineY: customerLineY,
        width: contentWidth,
        valueFont: timesRoman,
        hintFont: timesRoman,
        valueSize: 9,
        hintSize: 6.2,
        valueMaxLines: 2,
        hintMaxLines: 2,
    });

    /**
     * Bestätigungssatz
     */
    drawTextLine(
        page,
        "Hiermit bestätige ich als Abnehmer, dass ich folgenden Gegenstand¹) / dass folgender Gegenstand¹) einer innergemeinschaftlichen Lieferung",
        contentX,
        560,
        {
            font: timesRoman,
            size: 11,
            maxWidth: contentWidth,
            lineHeight: 15,
            maxLines: 2,
        },
    );

    /**
     * Menge
     */
    drawValueAboveLine(page, {
        value: "1 Fahrzeug",
        hint: "(Menge des Gegenstands der Lieferung)",
        x: contentX,
        lineY: 490,
        width: contentWidth,
        valueFont: timesRoman,
        hintFont: timesRoman,
        valueSize: 9,
        hintSize: 6.2,
        valueMaxLines: 1,
        hintMaxLines: 1,
    });

    /**
     * Bezeichnung
     */
    drawValueAboveLine(page, {
        value: getVehicleDescription(data),
        hint: "(handelsübliche Bezeichnung, bei Fahrzeugen zusätzlich die Fahrzeug-Identifikationsnummer)",
        x: contentX,
        lineY: 430,
        width: contentWidth,
        valueFont: timesRoman,
        hintFont: timesRoman,
        valueSize: 9,
        hintSize: 6.2,
        valueMaxLines: 2,
        hintMaxLines: 1,
    });

    page.drawText("im", {
        x: contentX,
        y: 386,
        size: 11,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    /**
     * Monat/Jahr Erhalt
     */
    drawValueAboveLine(page, {
        value: getArrivalPeriod(data),
        hint: "(Monat und Jahr des Erhalts des Liefergegenstands im Mitgliedstaat, in den der Liefergegenstand gelangt ist, wenn der liefernde Unternehmer den Liefergegenstand befördert oder versendet hat oder wenn der Abnehmer den Liefergegenstand versendet hat)",
        x: contentX,
        lineY: 338,
        width: contentWidth,
        valueFont: timesRoman,
        hintFont: timesRoman,
        valueSize: 9,
        hintSize: 6.2,
        valueMaxLines: 1,
        hintMaxLines: 3,
    });

    /**
     * Monat/Jahr Ende Beförderung
     */
    drawValueAboveLine(page, {
        value: getArrivalPeriod(data),
        hint: "(Monat und Jahr des Endes der Beförderung, wenn der Abnehmer den Liefergegenstand selbst befördert hat)",
        x: contentX,
        lineY: 264,
        width: contentWidth,
        valueFont: timesRoman,
        hintFont: timesRoman,
        valueSize: 9,
        hintSize: 6.2,
        valueMaxLines: 1,
        hintMaxLines: 2,
    });

    page.drawText("in / nach¹)", {
        x: contentX,
        y: 224,
        size: 11,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    /**
     * Mitgliedstaat und Ort
     */
    drawValueAboveLine(page, {
        value: getDestination(data),
        hint: "(Mitgliedstaat und Ort, wohin der Liefergegenstand im Rahmen einer Beförderung oder Versendung gelangt ist)",
        x: contentX,
        lineY: 176,
        width: contentWidth,
        valueFont: timesRoman,
        hintFont: timesRoman,
        valueSize: 9,
        hintSize: 6.2,
        valueMaxLines: 1,
        hintMaxLines: 2,
    });

    page.drawText("erhalten habe / gelangt ist¹).", {
        x: contentX,
        y: 132,
        size: 11,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    /**
     * Datum und Unterschrift
     */
    const signatureLineY = 84;
    const signatureWidth = contentWidth;

    page.drawText(getIssuerDate(data), {
        x: contentX + 2,
        y: signatureLineY + 9,
        size: 9,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    drawLine(page, contentX, signatureLineY, contentX + signatureWidth, signatureLineY);

    drawTextLine(
        page,
        "(Datum der Ausstellung der Bestätigung)",
        contentX + 2,
        signatureLineY - 12,
        {
            font: timesRoman,
            size: 6.2,
            maxWidth: 190,
            lineHeight: 7,
        },
    );

    drawTextLine(
        page,
        "(Unterschrift des Abnehmers oder seines Vertretungsberechtigten sowie Name des Unterzeichnenden in Druckschrift)",
        contentX + 230,
        signatureLineY - 12,
        {
            font: timesRoman,
            size: 6.2,
            maxWidth: contentWidth - 230,
            lineHeight: 7,
            maxLines: 2,
        },
    );

    page.drawText("¹) Nichtzutreffendes streichen.", {
        x: contentX + 2,
        y: 34,
        size: 7,
        font: timesRoman,
        color: rgb(0, 0, 0),
    });

    return ctx.pdfDoc.save();
}
