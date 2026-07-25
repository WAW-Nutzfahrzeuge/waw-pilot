import {
    PDFDocument,
    PDFPage,
    rgb,
    StandardFonts,
    type PDFFont,
} from "pdf-lib";

import { pdfTheme } from "@/lib/pdf/core/pdf-theme";
import { joinPdfLines } from "@/lib/pdf/core/pdf-format";
import type {
    PdfCompany,
    PdfCustomer,
    PdfVehicle,
} from "@/lib/pdf/core/pdf-types";

export type PdfLayoutContext = {
    pdfDoc: PDFDocument;
    page: PDFPage;
    regularFont: PDFFont;
    boldFont: PDFFont;
    width: number;
    height: number;
    margin: number;
    cursorY: number;
};

export async function createPdfLayout(): Promise<PdfLayoutContext> {
    const pdfDoc = await PDFDocument.create();

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const margin = pdfTheme.spacing.pageMargin;

    return {
        pdfDoc,
        page,
        regularFont,
        boldFont,
        width,
        height,
        margin,
        cursorY: height - margin,
    };
}

export function hexToRgb(hex: string) {
    const normalized = hex.replace("#", "");

    const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
    const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
    const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;

    return rgb(r, g, b);
}

export function drawText(
    ctx: PdfLayoutContext,
    text: string,
    x: number,
    y: number,
    options?: {
        size?: number;
        bold?: boolean;
        color?: string;
        maxWidth?: number;
        lineHeight?: number;
    },
) {
    const font = options?.bold ? ctx.boldFont : ctx.regularFont;
    const size = options?.size ?? pdfTheme.fontSize.normal;
    const color = hexToRgb(options?.color ?? pdfTheme.colors.text);

    const lines = options?.maxWidth
        ? wrapText(text, font, size, options.maxWidth)
        : [text];

    const lineHeight = options?.lineHeight ?? size + 3;

    lines.forEach((line, index) => {
        ctx.page.drawText(line, {
            x,
            y: y - index * lineHeight,
            size,
            font,
            color,
        });
    });

    return y - (lines.length - 1) * lineHeight;
}

export function wrapText(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];

    let currentLine = "";

    words.forEach((word) => {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(nextLine, size);

        if (width <= maxWidth) {
            currentLine = nextLine;
            return;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            lines.push(word);
        }
    });

    if (currentLine) {
        lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [text];
}

export function drawHorizontalLine(
    ctx: PdfLayoutContext,
    y: number,
    options?: {
        x?: number;
        width?: number;
        color?: string;
        thickness?: number;
    },
) {
    const x = options?.x ?? ctx.margin;
    const width = options?.width ?? ctx.width - ctx.margin * 2;

    ctx.page.drawLine({
        start: { x, y },
        end: { x: x + width, y },
        thickness: options?.thickness ?? 0.75,
        color: hexToRgb(options?.color ?? pdfTheme.colors.lightBorder),
    });
}

export function drawSectionTitle(
    ctx: PdfLayoutContext,
    title: string,
    y: number,
): number {
    drawText(ctx, title, ctx.margin, y, {
        size: pdfTheme.fontSize.large,
        bold: true,
        color: pdfTheme.colors.primaryDark,
    });

    drawHorizontalLine(ctx, y - 8);

    return y - 22;
}

export function drawKeyValueRows(
    ctx: PdfLayoutContext,
    rows: {
        label: string;
        value: string;
    }[],
    x: number,
    y: number,
    options?: {
        labelWidth?: number;
        valueWidth?: number;
        rowHeight?: number;
    },
): number {
    const labelWidth = options?.labelWidth ?? 110;
    const valueWidth = options?.valueWidth ?? 170;
    const rowHeight = options?.rowHeight ?? 17;

    let currentY = y;

    rows.forEach((row) => {
        drawText(ctx, row.label, x, currentY, {
            size: pdfTheme.fontSize.small,
            bold: true,
            color: pdfTheme.colors.mutedText,
            maxWidth: labelWidth,
        });

        const finalY = drawText(ctx, row.value, x + labelWidth, currentY, {
            size: pdfTheme.fontSize.small,
            color: pdfTheme.colors.text,
            maxWidth: valueWidth,
            lineHeight: 11,
        });

        currentY = Math.min(currentY - rowHeight, finalY - rowHeight);
    });

    return currentY;
}

export function drawPdfHeader(
    ctx: PdfLayoutContext,
    options: {
        title: string;
        subtitle?: string;
        documentNumber?: string | null;
    },
): number {
    const topY = ctx.height - ctx.margin;

    drawText(ctx, options.title, ctx.margin, topY, {
        size: pdfTheme.fontSize.headline,
        bold: true,
        color: pdfTheme.colors.text,
    });

    if (options.subtitle) {
        drawText(ctx, options.subtitle, ctx.margin, topY - 18, {
            size: pdfTheme.fontSize.normal,
            color: pdfTheme.colors.mutedText,
        });
    }

    if (options.documentNumber) {
        drawText(ctx, options.documentNumber, ctx.width - ctx.margin - 160, topY, {
            size: pdfTheme.fontSize.medium,
            bold: true,
            color: pdfTheme.colors.primaryDark,
            maxWidth: 160,
        });
    }

    drawHorizontalLine(ctx, topY - 34, {
        color: pdfTheme.colors.border,
    });

    return topY - 58;
}

export function drawCompanyBlock(
    ctx: PdfLayoutContext,
    company: PdfCompany,
    x: number,
    y: number,
): number {
    const lines = joinPdfLines([
        company.legalName,
        company.street,
        `${company.postalCode} ${company.city}`,
        company.country,
        company.email ? `E-Mail: ${company.email}` : null,
        company.website ? `Web: ${company.website}` : null,
        company.phone ? `Tel.: ${company.phone}` : null,
        company.mobilePhone1 ? `Mobil 1: ${company.mobilePhone1}` : null,
        company.mobilePhone2 ? `Mobil 2: ${company.mobilePhone2}` : null,
        company.vatId ? `USt-ID: ${company.vatId}` : null,
        company.taxNumber ? `St.-Nr.: ${company.taxNumber}` : null,
    ]);

    let currentY = y;

    lines.forEach((line, index) => {
        drawText(ctx, line, x, currentY, {
            size: index === 0 ? pdfTheme.fontSize.normal : pdfTheme.fontSize.small,
            bold: index === 0,
            color: index === 0 ? pdfTheme.colors.text : pdfTheme.colors.mutedText,
            maxWidth: 210,
        });

        currentY -= index === 0 ? 13 : 11;
    });

    return currentY;
}

export function drawCustomerBlock(
    ctx: PdfLayoutContext,
    customer: PdfCustomer,
    x: number,
    y: number,
): number {
    const lines = joinPdfLines([
        customer.name,
        customer.street,
        `${customer.postalCode ?? ""} ${customer.city ?? ""}`,
        customer.country,
        customer.vatId ? `USt-ID: ${customer.vatId}` : null,
    ]);

    let currentY = y;

    lines.forEach((line, index) => {
        drawText(ctx, line, x, currentY, {
            size: index === 0 ? pdfTheme.fontSize.normal : pdfTheme.fontSize.small,
            bold: index === 0,
            color: index === 0 ? pdfTheme.colors.text : pdfTheme.colors.mutedText,
            maxWidth: 220,
        });

        currentY -= index === 0 ? 13 : 11;
    });

    return currentY;
}

export function drawVehicleSummary(
    ctx: PdfLayoutContext,
    vehicle: PdfVehicle,
    x: number,
    y: number,
): number {
    return drawKeyValueRows(
        ctx,
        [
            {
                label: "Fahrzeug",
                value: `${vehicle.manufacturer} ${vehicle.model}`,
            },
            {
                label: "Typ",
                value: vehicle.vehicleType,
            },
            {
                label: "Interne Nr.",
                value: vehicle.internalNumber,
            },
            {
                label: "FIN/VIN",
                value: vehicle.vin,
            },
            {
                label: "Kennzeichen",
                value: vehicle.licensePlate ?? "—",
            },
        ],
        x,
        y,
        {
            labelWidth: 85,
            valueWidth: 190,
        },
    );
}

export function drawSignatureLine(
    ctx: PdfLayoutContext,
    x: number,
    y: number,
    label: string,
    width = 180,
) {
    drawHorizontalLine(ctx, y, {
        x,
        width,
        color: pdfTheme.colors.border,
    });

    drawText(ctx, label, x, y - 13, {
        size: pdfTheme.fontSize.tiny,
        color: pdfTheme.colors.mutedText,
        maxWidth: width,
    });
}

export function drawPdfFooter(ctx: PdfLayoutContext) {
    void ctx;
}
