import {
    StandardFonts,
    rgb,
    type PDFFont,
    type PDFPage,
} from "pdf-lib";

import { createPdfLayout } from "@/lib/pdf/core/pdf-layout";
import { formatPdfDate } from "@/lib/pdf/core/pdf-format";
import { getWawLogoBytes } from "@/lib/pdf/core/pdf-assets";

export type TravelExpensePdfData = {
    driverName: string;
    travelDate: string;
    visitedCustomer: string;
    location: string;
    vehicleOrPlate: string;
    purpose: string;
    startMileage: number | null;
    endMileage: number | null;
    notes: string | null;
};

const BLUE = rgb(0.08, 0.28, 0.55);
const BORDER = rgb(0.55, 0.62, 0.7);
const LIGHT_BORDER = rgb(0.78, 0.82, 0.88);
const TEXT = rgb(0.05, 0.08, 0.13);
const MUTED = rgb(0.33, 0.39, 0.48);
const VERY_LIGHT = rgb(0.97, 0.98, 1);

function requireValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "";

    const stringValue = String(value).trim();

    return stringValue.length > 0 ? stringValue : "";
}

function getMileageDistance(data: TravelExpensePdfData): string {
    if (data.startMileage === null || data.endMileage === null) return "";

    return `${Math.max(data.endMileage - data.startMileage, 0)} km`;
}

function getMileageValue(value: number | null): string {
    if (value === null) return "";

    return `${value} km`;
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

    if (normalizedText.length === 0) return [""];

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
            color: options.color ?? TEXT,
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
    color = BORDER,
) {
    page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.8,
        color,
    });
}

function drawBox(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: {
        borderColor?: ReturnType<typeof rgb>;
        fillColor?: ReturnType<typeof rgb>;
    },
) {
    page.drawRectangle({
        x,
        y,
        width,
        height,
        borderWidth: 0.9,
        borderColor: options?.borderColor ?? LIGHT_BORDER,
        color: options?.fillColor,
    });
}

function drawSectionHeader(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    options: {
        font: PDFFont;
        width?: number;
    },
) {
    page.drawText(text, {
        x,
        y,
        size: 8.6,
        font: options.font,
        color: BLUE,
    });

    drawLine(page, x, y - 9, x + (options.width ?? 250), y - 9, BORDER);
}

function drawFieldLine(
    page: PDFPage,
    params: {
        label: string;
        value: string;
        x: number;
        y: number;
        labelFont: PDFFont;
        valueFont: PDFFont;
        valueX: number;
        lineEndX: number;
    },
): number {
    page.drawText(params.label.toUpperCase(), {
        x: params.x,
        y: params.y,
        size: 7.1,
        font: params.labelFont,
        color: BLUE,
    });

    const valueMaxWidth = params.lineEndX - params.valueX - 4;

    drawWrappedText(page, params.value, params.valueX + 2, params.y, {
        font: params.valueFont,
        size: 8.2,
        maxWidth: valueMaxWidth,
        lineHeight: 10,
        maxLines: 2,
        color: TEXT,
    });

    drawLine(page, params.valueX, params.y - 8, params.lineEndX, params.y - 8, BORDER);

    return params.y - 39;
}

function drawCheckbox(
    page: PDFPage,
    params: {
        x: number;
        y: number;
        label: string;
        checked: boolean;
        font: PDFFont;
    },
): number {
    page.drawRectangle({
        x: params.x,
        y: params.y - 2,
        width: 9.5,
        height: 9.5,
        borderWidth: 0.8,
        borderColor: BORDER,
    });

    if (params.checked) {
        page.drawText("X", {
            x: params.x + 2,
            y: params.y - 0.2,
            size: 6.8,
            font: params.font,
            color: BLUE,
        });
    }

    page.drawText(params.label, {
        x: params.x + 17,
        y: params.y,
        size: 7.1,
        font: params.font,
        color: TEXT,
    });

    return params.y - 17;
}

function normalizePurpose(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isPurposeChecked(currentPurpose: string, purposeLabel: string): boolean {
    const current = normalizePurpose(currentPurpose);
    const label = normalizePurpose(purposeLabel);

    if (!current) return false;

    return current.includes(label) || label.includes(current);
}

async function drawLogo(
    page: PDFPage,
    pdfDoc: Awaited<ReturnType<typeof createPdfLayout>>["pdfDoc"],
    x: number,
    y: number,
) {
    try {
        const logoBytes = await getWawLogoBytes();
        const logoImage = await pdfDoc.embedPng(logoBytes);

        const logoWidth = 130;
        const logoHeight = (logoImage.height / logoImage.width) * logoWidth;

        page.drawImage(logoImage, {
            x,
            y: y - logoHeight,
            width: logoWidth,
            height: logoHeight,
        });
    } catch {
        // Logo ist optional. Wenn es fehlt, bleibt die Fläche leer.
    }
}

function drawMileageInput(
    page: PDFPage,
    params: {
        label: string;
        value: string;
        x: number;
        y: number;
        labelFont: PDFFont;
        valueFont: PDFFont;
        boxX: number;
        boxWidth: number;
    },
): number {
    page.drawText(params.label.toUpperCase(), {
        x: params.x,
        y: params.y + 9,
        size: 7,
        font: params.labelFont,
        color: MUTED,
    });

    drawBox(page, params.boxX, params.y, params.boxWidth, 24, {
        borderColor: LIGHT_BORDER,
        fillColor: rgb(1, 1, 1),
    });

    drawWrappedText(page, params.value, params.boxX + 6, params.y + 8, {
        font: params.valueFont,
        size: 8.1,
        maxWidth: params.boxWidth - 12,
        lineHeight: 10,
        maxLines: 1,
        color: TEXT,
    });

    return params.y - 39;
}

export async function generateTravelExpenseFormPdf(
    data: TravelExpensePdfData,
): Promise<Uint8Array> {
    const ctx = await createPdfLayout();
    const page = ctx.page;

    const helvetica = await ctx.pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await ctx.pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = ctx.width;
    const contentX = 38;
    const contentWidth = pageWidth - contentX * 2;

    page.drawRectangle({
        x: 0,
        y: 0,
        width: ctx.width,
        height: ctx.height,
        color: rgb(1, 1, 1),
    });

    page.drawText("REISEKOSTEN / KUNDENFAHRTEN", {
        x: contentX,
        y: 800,
        size: 20,
        font: helveticaBold,
        color: TEXT,
    });

    page.drawText("NUTZFAHRZEUGHANDEL", {
        x: contentX,
        y: 777,
        size: 14,
        font: helveticaBold,
        color: BLUE,
    });

    page.drawText(
        "Zur Abrechnung und Dokumentation von Kunden-, Händler- und Servicefahrten.",
        {
            x: contentX,
            y: 752,
            size: 8,
            font: helvetica,
            color: TEXT,
        },
    );

    await drawLogo(page, ctx.pdfDoc, pageWidth - contentX - 130, 828);

    drawLine(page, contentX, 730, contentX + 410, 730, BORDER);

    /**
     * Oberer Bereich: links Stammdaten, rechts Zweck.
     */
    const leftX = contentX + 28;
    const leftValueX = 205;
    const leftLineEndX = 350;
    const rightX = 395;

    let leftY = 697;

    leftY = drawFieldLine(page, {
        label: "Mitarbeiter / Fahrer",
        value: requireValue(data.driverName),
        x: leftX,
        y: leftY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        valueX: leftValueX,
        lineEndX: leftLineEndX,
    });

    leftY = drawFieldLine(page, {
        label: "Datum",
        value: formatPdfDate(data.travelDate),
        x: leftX,
        y: leftY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        valueX: leftValueX,
        lineEndX: leftLineEndX,
    });

    leftY = drawFieldLine(page, {
        label: "Besuchter Kunde / Firma",
        value: requireValue(data.visitedCustomer),
        x: leftX,
        y: leftY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        valueX: leftValueX,
        lineEndX: leftLineEndX,
    });

    leftY = drawFieldLine(page, {
        label: "Ort",
        value: requireValue(data.location),
        x: leftX,
        y: leftY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        valueX: leftValueX,
        lineEndX: leftLineEndX,
    });

    drawFieldLine(page, {
        label: "Fahrzeug / Kennzeichen",
        value: requireValue(data.vehicleOrPlate),
        x: leftX,
        y: leftY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        valueX: leftValueX,
        lineEndX: leftLineEndX,
    });

    drawLine(page, 372, 705, 372, 515, LIGHT_BORDER);

    page.drawText("ZWECK DER FAHRT", {
        x: rightX,
        y: 697,
        size: 8.2,
        font: helveticaBold,
        color: BLUE,
    });

    const purposes = [
        "Fahrzeugbesichtigung",
        "Fahrzeugauslieferung",
        "Fahrzeugabholung",
        "Verkaufsberatung",
        "Probefahrt mit Kunde",
        "Werkstatt / Service",
        "Ersatzteilbeschaffung",
        "Fahrzeugbewertung / Ankauf",
        "Messe / Händlertermin",
        "Sonstiges:",
    ];

    let purposeY = 674;

    for (const purpose of purposes) {
        purposeY = drawCheckbox(page, {
            x: rightX,
            y: purposeY,
            label: purpose,
            checked: isPurposeChecked(data.purpose, purpose.replace(":", "")),
            font: helvetica,
        });
    }

    drawLine(page, rightX + 38, purposeY + 4, pageWidth - contentX, purposeY + 4, BORDER);

    /**
     * Boxen Fahrtdaten / Belege
     */
    const boxY = 344;
    const boxHeight = 166;
    const leftBoxX = contentX;
    const rightBoxX = 333;
    const leftBoxWidth = 292;
    const rightBoxWidth = contentX + contentWidth - rightBoxX;

    drawBox(page, leftBoxX, boxY, leftBoxWidth, boxHeight, {
        borderColor: LIGHT_BORDER,
        fillColor: VERY_LIGHT,
    });

    drawBox(page, rightBoxX, boxY, rightBoxWidth, boxHeight, {
        borderColor: LIGHT_BORDER,
        fillColor: VERY_LIGHT,
    });

    drawSectionHeader(page, "FAHRTDATEN", leftBoxX + 14, boxY + boxHeight - 32, {
        font: helveticaBold,
        width: 255,
    });

    let mileageY = boxY + boxHeight - 76;

    mileageY = drawMileageInput(page, {
        label: "Startkilometer",
        value: getMileageValue(data.startMileage),
        x: leftBoxX + 14,
        y: mileageY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        boxX: leftBoxX + 142,
        boxWidth: 128,
    });

    mileageY = drawMileageInput(page, {
        label: "Endkilometer",
        value: getMileageValue(data.endMileage),
        x: leftBoxX + 14,
        y: mileageY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        boxX: leftBoxX + 142,
        boxWidth: 128,
    });

    drawMileageInput(page, {
        label: "Gefahrene Kilometer",
        value: getMileageDistance(data),
        x: leftBoxX + 14,
        y: mileageY,
        labelFont: helveticaBold,
        valueFont: helvetica,
        boxX: leftBoxX + 142,
        boxWidth: 128,
    });

    drawSectionHeader(page, "HOCHGELADENE BELEGE", rightBoxX + 14, boxY + boxHeight - 32, {
        font: helveticaBold,
        width: rightBoxWidth - 28,
    });

    let receiptY = boxY + boxHeight - 62;

    const receipts = [
        "Tankbeleg",
        "Maut",
        "Parkticket",
        "Hotel",
        "Bewirtung",
        "Sonstige Belege",
    ];

    for (const receipt of receipts) {
        receiptY = drawCheckbox(page, {
            x: rightBoxX + 25,
            y: receiptY,
            label: receipt,
            checked: false,
            font: helvetica,
        });
    }

    /**
     * Bemerkungen
     */
    const notesBoxY = 233;
    const notesBoxHeight = 108;

    drawBox(page, contentX, notesBoxY, contentWidth, notesBoxHeight, {
        borderColor: LIGHT_BORDER,
        fillColor: VERY_LIGHT,
    });

    drawSectionHeader(page, "KURZE NOTIZ / BEMERKUNGEN", contentX + 14, notesBoxY + notesBoxHeight - 28, {
        font: helveticaBold,
        width: contentWidth - 28,
    });

    const noteLineX = contentX + 14;
    const noteLineEndX = contentX + contentWidth - 14;

    drawWrappedText(page, requireValue(data.notes), noteLineX, notesBoxY + 48, {
        font: helvetica,
        size: 8.3,
        maxWidth: noteLineEndX - noteLineX,
        lineHeight: 18,
        maxLines: 3,
        color: TEXT,
    });

    drawLine(page, noteLineX, notesBoxY + 44, noteLineEndX, notesBoxY + 44, BORDER);
    drawLine(page, noteLineX, notesBoxY + 24, noteLineEndX, notesBoxY + 24, BORDER);
    drawLine(page, noteLineX, notesBoxY + 4, noteLineEndX, notesBoxY + 4, BORDER);

    /**
     * Anleitung und Beispiel
     */
    const smallBoxY = 82;
    const smallBoxHeight = 105;
    const instructionBoxX = contentX;
    const exampleBoxX = 333;

    drawBox(page, instructionBoxX, smallBoxY, leftBoxWidth, smallBoxHeight, {
        borderColor: LIGHT_BORDER,
    });

    drawBox(page, exampleBoxX, smallBoxY, rightBoxWidth, smallBoxHeight, {
        borderColor: LIGHT_BORDER,
    });

    page.drawRectangle({
        x: instructionBoxX + 14,
        y: smallBoxY + smallBoxHeight - 28,
        width: 136,
        height: 17,
        color: BLUE,
    });

    page.drawText("MITARBEITER-ANLEITUNG (KURZ)", {
        x: instructionBoxX + 20,
        y: smallBoxY + smallBoxHeight - 22,
        size: 7.1,
        font: helveticaBold,
        color: rgb(1, 1, 1),
    });

    const instructions = [
        "Nach der Fahrt alle Belege fotografieren",
        "In Circula hochladen",
        "Kunde + Fahrzeug auswählen",
        "Kilometer eintragen",
        "Absenden",
    ];

    let instructionY = smallBoxY + 61;

    instructions.forEach((instruction, index) => {
        page.drawCircle({
            x: instructionBoxX + 22,
            y: instructionY + 3,
            size: 5,
            color: BLUE,
        });

        page.drawText(String(index + 1), {
            x: instructionBoxX + 20.5,
            y: instructionY,
            size: 6,
            font: helveticaBold,
            color: rgb(1, 1, 1),
        });

        page.drawText(instruction, {
            x: instructionBoxX + 36,
            y: instructionY,
            size: 6.7,
            font: helvetica,
            color: TEXT,
        });

        instructionY -= 14;
    });

    page.drawRectangle({
        x: exampleBoxX + 14,
        y: smallBoxY + smallBoxHeight - 28,
        width: 64,
        height: 17,
        color: BLUE,
    });

    page.drawText("BEISPIEL", {
        x: exampleBoxX + 23,
        y: smallBoxY + smallBoxHeight - 22,
        size: 7.2,
        font: helveticaBold,
        color: rgb(1, 1, 1),
    });

    const examples = [
        ["Kunde:", "MAN Truck Service Hamburg"],
        ["Zweck:", "Fahrzeugabholung"],
        ["Fahrzeug:", "Mercedes Actros – HH-AB 123"],
        ["Kilometer:", "214 km"],
        ["Beleg:", "Diesel + Maut hochgeladen"],
    ];

    let exampleY = smallBoxY + 61;

    examples.forEach(([label, value]) => {
        page.drawText(label, {
            x: exampleBoxX + 18,
            y: exampleY,
            size: 6.7,
            font: helveticaBold,
            color: TEXT,
        });

        page.drawText(value, {
            x: exampleBoxX + 66,
            y: exampleY,
            size: 6.7,
            font: helvetica,
            color: TEXT,
        });

        exampleY -= 14;
    });

    /**
     * Footer
     */
    drawLine(page, contentX, 78, contentX + contentWidth, 78, LIGHT_BORDER);

    page.drawCircle({
        x: contentX + 86,
        y: 47,
        size: 13,
        borderWidth: 1.2,
        borderColor: BLUE,
    });

    page.drawLine({
        start: { x: contentX + 78, y: 47 },
        end: { x: contentX + 84, y: 40 },
        thickness: 2.2,
        color: BLUE,
    });

    page.drawLine({
        start: { x: contentX + 84, y: 40 },
        end: { x: contentX + 96, y: 56 },
        thickness: 2.2,
        color: BLUE,
    });

    drawWrappedText(
        page,
        "So sind Kundenfahrten, Fahrzeugtransporte, Händlerfahrten und Servicefahrten für Buchhaltung und Finanzamt sauber dokumentiert.",
        contentX + 112,
        52,
        {
            font: helveticaBold,
            size: 8.2,
            maxWidth: contentWidth - 130,
            lineHeight: 11,
            color: BLUE,
        },
    );

    return ctx.pdfDoc.save();
}
