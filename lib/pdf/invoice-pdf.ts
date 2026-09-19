import { readFile } from "fs/promises";
import path from "path";
import type { InvoiceType } from "@/lib/invoices/invoice-numbering";
import type { SaleType } from "@/lib/sales/sale-queries";
import { normalizeEmailLanguage } from "@/lib/customers/email-languages";
import { formatIban } from "@/lib/settings/company-bank-details";
import { getWawLogoBytes } from "@/lib/pdf/core/pdf-assets";
import {
    embedCompanyPdfImage,
    type CompanySignatureStampAssets,
} from "@/lib/pdf/company-signature-assets";
import {
    PDFDocument,
    rgb,
    type PDFFont,
    type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type InvoicePdfData = {
    invoiceType: InvoiceType;
    saleType: SaleType;
    invoiceNumber: string;
    saleNumber: string | null;
    invoiceDate: string;
    dueDate: string | null;
    correction?: {
        originalInvoiceNumber: string | null;
        originalInvoiceDate: string | null;
        reason: string | null;
    };
    termsAttached?: boolean;
    signatureStamp?: CompanySignatureStampAssets & {
        include: boolean;
    };

    company: {
        legalName: string;
        street: string;
        postalCode: string;
        city: string;
        country: string;
        email: string | null;
        website: string | null;
        phone: string | null;
        mobilePhone1: string | null;
        mobilePhone2: string | null;
        vatId: string | null;
        taxNumber: string | null;
        registrationId: string | null;
        bankName: string | null;
        bankBlz: string | null;
        bankIban: string | null;
        bankBic: string | null;
        bankAccountHolder: string | null;
    };

    customer: {
        name: string;
        street: string | null;
        postalCode: string | null;
        city: string | null;
        country: string | null;
        vatId: string | null;
        preferredLanguage?: string | null;
    };

    vehicle: {
        internalNumber: string;
        manufacturer: string;
        model: string;
        vehicleType: string;
        vin: string;
        firstRegistration: string | null;
        constructionYear: number | null;
        damageNotes: string | null;
    };

    includeDamageNotesOnInvoice: boolean;
    invoiceNotes: string | null;

    amounts: {
        netAmount: number;
        vatRate: number;
        vatAmount: number;
        grossAmount: number;
    };
};

const pageWidth = 595.28;
const pageHeight = 841.89;

const black = rgb(0.08, 0.08, 0.08);
const gray = rgb(0.55, 0.55, 0.55);
const lightGray = rgb(0.86, 0.86, 0.86);
const navy = rgb(0.05, 0.15, 0.23);
const paleBlue = rgb(0.93, 0.96, 0.98);
const paleBlueStrong = rgb(0.87, 0.92, 0.96);
const borderBlue = rgb(0.62, 0.70, 0.76);
const borderRed = rgb(0.74, 0.12, 0.12);
const pdfFontPath = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@vercel",
    "og",
    "Geist-Regular.ttf",
);
type InvoicePdfAssets = {
    fontBytes: Buffer;
    logoBytes: Uint8Array;
};

let invoicePdfAssetsPromise: Promise<InvoicePdfAssets> | null = null;

function loadInvoicePdfAssets(): Promise<InvoicePdfAssets> {
    if (!invoicePdfAssetsPromise) {
        invoicePdfAssetsPromise = Promise.all([
            readFile(pdfFontPath),
            getWawLogoBytes(),
        ])
            .then(([fontBytes, logoBytes]) => ({ fontBytes, logoBytes }))
            .catch((error: unknown) => {
                invoicePdfAssetsPromise = null;
                throw error;
            });
    }

    return invoicePdfAssetsPromise;
}

function formatDate(value: string | null): string {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat("de-DE").format(date);
}

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
    }).format(value);
}

function safeText(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return "-";

    const text = String(value).trim();

    return text.length > 0 ? text : "-";
}

function drawText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    options: {
        font: PDFFont;
        size?: number;
        color?: ReturnType<typeof rgb>;
        maxWidth?: number;
    },
) {
    page.drawText(text, {
        x,
        y,
        size: options.size ?? 10,
        font: options.font,
        color: options.color ?? black,
        maxWidth: options.maxWidth,
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
        borderWidth?: number;
        fillColor?: ReturnType<typeof rgb>;
        radius?: number;
    },
) {
    const rectangleOptions = {
        x,
        y,
        width,
        height,
        borderColor: options?.borderColor ?? black,
        borderWidth: options?.borderWidth ?? 1,
        color: options?.fillColor,
    };

    page.drawRectangle(rectangleOptions);
}

type InvoiceIcon =
    | "person"
    | "building"
    | "phone"
    | "mail"
    | "bank"
    | "calendar"
    | "document"
    | "truck"
    | "card";

// These paths are the vector definitions used by lucide-react. pdf-lib cannot
// render React components, so the same Lucide paths are drawn directly into
// the PDF as stroked SVG paths.
const lucideIconPaths: Record<InvoiceIcon, string[]> = {
    person: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
    building: [
        "M10 12h4",
        "M10 8h4",
        "M14 21v-3a2 2 0 0 0-4 0v3",
        "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
        "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
    ],
    phone: [
        "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
    ],
    mail: ["m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7", "M2 4h20v16H2z"],
    bank: [
        "M10 18v-7",
        "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z",
        "M14 18v-7",
        "M18 18v-7",
        "M3 22h18",
        "M6 18v-7",
    ],
    calendar: [
        "M8 2v4",
        "M16 2v4",
        "M3 4h18v18H3z",
        "M3 10h18",
        "M8 14h.01",
        "M12 14h.01",
        "M16 14h.01",
        "M8 18h.01",
        "M12 18h.01",
        "M16 18h.01",
    ],
    document: [
        "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2z",
        "M14 2v6h6",
        "M10 13H8",
        "M16 17H8",
    ],
    truck: [
        "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
        "M15 18H9",
        "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
        "M6 18a2 2 0 1 0 4 0",
        "M16 18a2 2 0 1 0 4 0",
    ],
    card: ["M2 5h20v14H2z", "M2 10h20"],
};

const iconBadgeRadius = 8;
const iconBadgeIconScale = 0.4;
const inlineIconScale = 0.36;
const iconTextGap = 6;

function textXAfterBadge(iconX: number): number {
    return iconX + iconBadgeRadius + iconTextGap;
}

function drawLucideIcon(
    page: PDFPage,
    x: number,
    y: number,
    kind: InvoiceIcon,
    scale = inlineIconScale,
    borderWidth = 1,
) {
    // pdf-lib flips the SVG Y axis around the supplied origin. The origin is
    // therefore placed at the path's top-right coordinate so its 24-unit
    // Lucide viewBox is centered at the requested PDF point.
    for (const iconPath of lucideIconPaths[kind]) {
        page.drawSvgPath(iconPath, {
            x: x - 12 * scale,
            y: y + 12 * scale,
            scale,
            borderColor: navy,
            borderWidth,
        });
    }
}

function drawIconBadge(page: PDFPage, x: number, y: number, kind: InvoiceIcon) {
    page.drawCircle({ x, y, size: iconBadgeRadius, color: paleBlueStrong });
    drawLucideIcon(page, x, y, kind, iconBadgeIconScale, 0.95);
}

function getInvoiceCompanyDisplayName(): string {
    return "WAW Nutzfahrzeuge E. K.";
}

function drawLine(
    page: PDFPage,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    thickness = 1,
    color = black,
) {
    page.drawLine({
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
        thickness,
        color,
    });
}

function drawCenteredText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    width: number,
    font: PDFFont,
    size: number,
    color = black,
) {
    const textWidth = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
        x: x + (width - textWidth) / 2,
        y,
        size,
        font,
        color,
    });
}

function drawRightAlignedText(
    page: PDFPage,
    text: string,
    rightX: number,
    y: number,
    font: PDFFont,
    size: number,
    color = black,
) {
    const textWidth = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
        x: rightX - textWidth,
        y,
        size,
        font,
        color,
    });
}

function fitTextSize(
    text: string,
    font: PDFFont,
    preferredSize: number,
    minSize: number,
    maxWidth: number,
): number {
    let size = preferredSize;

    while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
        size -= 0.25;
    }

    return size;
}

async function drawSignatureStampImages(
    page: PDFPage,
    pdfDoc: PDFDocument,
    assets: InvoicePdfData["signatureStamp"],
) {
    if (!assets?.include) return;

    const signatureImage = assets.signatureImage
        ? await embedCompanyPdfImage(pdfDoc, assets.signatureImage)
        : null;
    const stampImage = assets.stampImage
        ? await embedCompanyPdfImage(pdfDoc, assets.stampImage)
        : null;

    if (!signatureImage && !stampImage) return;

    if (signatureImage && !stampImage) {
        // Combined signature/stamp uploads need a wider frame so the stamp
        // remains visible on the right and is not vertically compressed.
        const maxWidth = 180;
        const maxHeight = 64;
        const scale = Math.min(
            maxWidth / signatureImage.width,
            maxHeight / signatureImage.height,
        );
        const width = signatureImage.width * scale;
        const height = signatureImage.height * scale;

        page.drawImage(signatureImage, {
            x: 405,
            y: 58,
            width,
            height,
        });
    } else if (signatureImage) {
        const width = 112;
        const height = Math.min(
            34,
            (signatureImage.height / signatureImage.width) * width,
        );

        page.drawImage(signatureImage, {
            x: 360,
            y: 72,
            width,
            height,
        });
    }

    if (stampImage) {
        const width = 78;
        const height = Math.min(62, (stampImage.height / stampImage.width) * width);

        page.drawImage(stampImage, {
            x: 512,
            y: 60,
            width,
            height,
        });
    }
}

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
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
    const normalizedText = safeText(text).replace(/\s+/g, " ").trim();

    if (normalizedText === "-") return ["-"];

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
            if (font.widthOfTextAtSize(part, size) <= maxWidth) {
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                }

                currentLine = part;
            }
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
    startY: number,
    options: {
        font: PDFFont;
        size: number;
        lineHeight: number;
        maxWidth: number;
        maxLines?: number;
        color?: ReturnType<typeof rgb>;
    },
): number {
    const lines = wrapText(text, options.font, options.size, options.maxWidth);
    const visibleLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;

    visibleLines.forEach((line, index) => {
        drawText(page, line, x, startY - index * options.lineHeight, {
            font: options.font,
            size: options.size,
            color: options.color,
            maxWidth: options.maxWidth,
        });
    });

    return startY - visibleLines.length * options.lineHeight;
}

function drawWrappedLines(
    page: PDFPage,
    lines: string[],
    x: number,
    startY: number,
    options: {
        font: PDFFont;
        size: number;
        lineHeight: number;
        maxWidth?: number;
        color?: ReturnType<typeof rgb>;
    },
) {
    let y = startY;

    for (const line of lines) {
        if (line.trim().length === 0) {
            y -= options.lineHeight;
            continue;
        }

        if (options.maxWidth) {
            y = drawWrappedText(page, line, x, y, {
                font: options.font,
                size: options.size,
                lineHeight: options.lineHeight,
                maxWidth: options.maxWidth,
                color: options.color,
            });
        } else {
            drawText(page, line, x, y, {
                font: options.font,
                size: options.size,
                color: options.color,
            });

            y -= options.lineHeight;
        }
    }
}

function drawCellText(
    page: PDFPage,
    text: string,
    x: number,
    topY: number,
    width: number,
    options: {
        font: PDFFont;
        size: number;
        lineHeight: number;
        paddingX?: number;
        paddingTop?: number;
        maxLines?: number;
        align?: "left" | "center" | "right";
        color?: ReturnType<typeof rgb>;
    },
) {
    const paddingX = options.paddingX ?? 6;
    const paddingTop = options.paddingTop ?? 8;
    const maxWidth = width - paddingX * 2;
    const lines = wrapText(text, options.font, options.size, maxWidth);
    const visibleLines = options.maxLines ? lines.slice(0, options.maxLines) : lines;

    visibleLines.forEach((line, index) => {
        const textWidth = options.font.widthOfTextAtSize(line, options.size);

        let textX = x + paddingX;

        if (options.align === "center") {
            textX = x + (width - textWidth) / 2;
        }

        if (options.align === "right") {
            textX = x + width - paddingX - textWidth;
        }

        page.drawText(line, {
            x: textX,
            y: topY - paddingTop - index * options.lineHeight,
            size: options.size,
            font: options.font,
            color: options.color ?? black,
        });
    });
}

function getInvoiceTitle(invoiceType: InvoiceType, invoiceNumber: string): string {
    if (invoiceType === "cancellation_invoice") {
        return `STORNORECHNUNG ${invoiceNumber}`;
    }

    if (invoiceType === "credit_note") {
        return `GUTSCHRIFT ${invoiceNumber}`;
    }

    if (invoiceType === "proforma") {
        return `Proforma Anzahlungs Rechnung ${invoiceNumber}`;
    }

    if (invoiceType === "down_payment") {
        return `Anzahlungs Rechnung ${invoiceNumber}`;
    }

    return `Rechnung | Invoice ${invoiceNumber}`;
}

function getInvoiceBoxTitle(invoiceType: InvoiceType, invoiceNumber: string): string {
    if (invoiceType === "cancellation_invoice") {
        return `Stornorechnung: ${invoiceNumber}`;
    }

    if (invoiceType === "credit_note") {
        return `Gutschrift: ${invoiceNumber}`;
    }

    if (invoiceType === "proforma") {
        return `Anzahlungs-Rechnung: Proforma ${invoiceNumber}`;
    }

    if (invoiceType === "down_payment") {
        return `Anzahlungs-Rechnung: ${invoiceNumber}`;
    }

    return `Rechnung | Invoice: ${invoiceNumber}`;
}

function getPaymentReasonLabel(invoiceType: InvoiceType): string {
    if (invoiceType === "cancellation_invoice") {
        return "Storno zu Rechnung Nr. | Cancellation invoice";
    }

    if (invoiceType === "credit_note") {
        return "Gutschrift Nr. | Credit note number";
    }

    if (invoiceType === "proforma") {
        return "Artikel - Nummer / item number";
    }

    if (invoiceType === "down_payment") {
        return "Anzahlungs-Rechnung Nr. | Down payment invoice number";
    }

    return "Rechnung Nr. | Invoice Number";
}

function getThirdVehicleLineLabel(invoiceType: InvoiceType): string {
    if (invoiceType === "proforma") {
        return "Betriebsstunden:";
    }

    return "Baujahr:";
}

function getThirdVehicleLineValue(data: InvoicePdfData): string {
    if (data.invoiceType === "proforma") {
        return "";
    }

    return safeText(data.vehicle.constructionYear);
}

function getCustomerAddressLines(data: InvoicePdfData): string[] {
    return [
        data.customer.name,
        data.customer.street,
        [data.customer.postalCode, data.customer.city]
            .filter(Boolean)
            .join(" "),
        data.customer.country,
        data.customer.vatId ? `USt-ID: ${data.customer.vatId}` : null,
    ].filter((line): line is string => Boolean(line && line.trim().length > 0));
}

function getSaleTypeInvoiceLabel(saleType: SaleType): string {
    if (saleType === "eu") {
        return "EU-Lieferung";
    }

    if (saleType === "export_third_country") {
        return "Drittland Export";
    }

    return "Inland Deutschland";
}

function getPaymentAndTaxLines(data: InvoicePdfData): string[] {
    const baseLines = [
        "Betrag wird auf das Konto überwiesen. | Payment via bank transfer in advance.",
        "",
        "Delivery terms: EXW (Ex Works) according to Incoterms",
        "Das KFZ wird unter Ausschluss jeder Gewährleistung, so wie es steht, verkauft. | Sold without warranty or guarantee .",
    ];
    if (data.saleType === "eu") {
        return [
            ...baseLines,
            "",
            "Steuerfreie innergemeinschaftliche Lieferung gemäß § 4 Nr. 1b UStG i.V.m. § 6a UStG. | Intra-Community supply exempt from VAT.",
        ];
    }

    if (data.saleType === "export_third_country") {
        return [
            ...baseLines,
            "",
            "Steuerfreie Ausfuhrlieferung gemäß § 4 Nr. 1a UStG. | Export delivery exempt from VAT according to § 4 No. 1a German VAT Act.",
            "Lieferdatum = Rechnungsdatum",
        ];
    }

    return baseLines;
}

function getTermsNotice(language: string | null | undefined): string {
    const normalizedLanguage = normalizeEmailLanguage(language, "de");

    if (normalizedLanguage === "en") {
        return "Our General Terms and Conditions apply. The full terms are attached on the following pages of this invoice.";
    }

    if (normalizedLanguage === "pl") {
        return "Obowiązują nasze Ogólne Warunki Handlowe. Pełna treść warunków została dołączona na kolejnych stronach niniejszej faktury.";
    }

    if (normalizedLanguage === "bg") {
        return "Прилагат се нашите Общи условия. Пълният текст на условията е приложен на следващите страници към настоящата фактура.";
    }

    return "Es gelten unsere Allgemeinen Geschäftsbedingungen. Die vollständigen AGB sind den nachfolgenden Seiten dieser Rechnung beigefügt.";
}

function drawDamageNotesPages(
    pdfDoc: PDFDocument,
    data: InvoicePdfData,
    font: PDFFont,
    boldFont: PDFFont,
) {
    const damageNotes = data.vehicle.damageNotes?.trim();

    if (!data.includeDamageNotesOnInvoice || !damageNotes) return;

    let damagePage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = 780;

    drawText(damagePage, "Fahrzeugzustand / bekannte Schäden", 42, y, {
        font: boldFont,
        size: 16,
    });

    y -= 34;

    drawText(
        damagePage,
        `${safeText(data.vehicle.manufacturer)} ${safeText(data.vehicle.model)} · VIN ${safeText(data.vehicle.vin)}`,
        42,
        y,
        {
            font: boldFont,
            size: 8,
            color: gray,
            maxWidth: 500,
        },
    );

    y -= 28;

    const paragraphs = damageNotes
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    for (const paragraph of paragraphs.length > 0 ? paragraphs : [damageNotes]) {
        const lines = wrapText(paragraph, font, 9, 500);

        for (const line of lines) {
            if (y < 72) {
                damagePage = pdfDoc.addPage([pageWidth, pageHeight]);
                y = 780;
            }

            drawText(damagePage, line, 42, y, {
                font,
                size: 9,
                maxWidth: 500,
            });
            y -= 13;
        }

        y -= 7;
    }
}

export async function generateInvoicePdf(
    data: InvoicePdfData,
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const invoiceDisplayNumber = data.invoiceNumber;

    const { fontBytes, logoBytes } = await loadInvoicePdfAssets();
    const embeddedFont = await pdfDoc.embedFont(fontBytes, { subset: false });
    const helvetica = embeddedFont;
    const helveticaBold = embeddedFont;

    const logoImage = await pdfDoc.embedPng(logoBytes);

    page.drawImage(logoImage, {
        x: 42,
        y: 698,
        width: 138,
        height: 108,
    });

    const invoiceTitle = getInvoiceTitle(data.invoiceType, invoiceDisplayNumber);
    const titleWidth = 225;
    const titleSize = fitTextSize(invoiceTitle, helveticaBold, data.invoiceType === "standard" ? 20 : 18, 13, titleWidth);
    drawCenteredText(page, invoiceTitle, 184, 805, titleWidth, helveticaBold, titleSize, navy);

    drawText(page, getInvoiceCompanyDisplayName(), 430, 812, {
        font: helveticaBold,
        size: 7.5,
        color: navy,
        maxWidth: 120,
    });

    if (data.correction?.originalInvoiceNumber) {
        drawText(
            page,
            `Bezug: Originalrechnung ${data.correction.originalInvoiceNumber} vom ${formatDate(data.correction.originalInvoiceDate)}`,
            210,
            788,
            {
                font: helveticaBold,
                size: 8,
                color: gray,
                maxWidth: 340,
            },
        );

        if (data.correction.reason) {
            drawText(page, `Grund: ${data.correction.reason}`, 210, 776, {
                font: helvetica,
                size: 7.5,
                color: gray,
                maxWidth: 340,
            });
        }
    }

    /**
     * Empfängeradresse / Käufer
     */
    const buyerBoxX = 42;
    const buyerBoxTop = 674;
    const buyerIconX = buyerBoxX + 15;
    const buyerContentX = textXAfterBadge(buyerIconX);
    const buyerContentWidth = 208;
    const customerAddressLines = getCustomerAddressLines(data);
    const [customerName, ...customerAddressLinesRest] = customerAddressLines;
    const buyerTextStartY = 625;
    const buyerNameLineHeight = 11;
    const buyerAddressLineHeight = 10;
    const visibleCustomerNameLines = wrapText(
        customerName ?? "-",
        helveticaBold,
        9.2,
        buyerContentWidth,
    ).slice(0, 2);
    const visibleCustomerAddressLines = customerAddressLinesRest.flatMap((line) =>
        wrapText(line, helvetica, 8, buyerContentWidth),
    );
    const buyerAddressStartY =
        buyerTextStartY - visibleCustomerNameLines.length * buyerNameLineHeight - 1;
    const buyerAddressEndY =
        buyerAddressStartY - visibleCustomerAddressLines.length * buyerAddressLineHeight;
    const buyerSeparatorY = buyerAddressEndY + 4;
    const buyerExportY = buyerSeparatorY - 12;
    const buyerBoxBottom = buyerExportY - 14;
    const buyerBoxHeight = buyerBoxTop - buyerBoxBottom;

    drawBox(page, buyerBoxX, buyerBoxBottom, 250, buyerBoxHeight, {
        borderColor: borderBlue,
        borderWidth: 0.8,
        fillColor: paleBlue,
        radius: 6,
    });
    drawIconBadge(page, buyerIconX, buyerBoxTop - 23, "person");
    drawText(page, "Käufer | Buyer:", buyerContentX, 648, {
        font: helveticaBold,
        size: 9,
        color: navy,
    });

    let buyerTextY = buyerTextStartY;
    buyerTextY = drawWrappedText(page, customerName ?? "-", buyerContentX, buyerTextY, {
        font: helveticaBold,
        size: 9.2,
        lineHeight: buyerNameLineHeight,
        maxWidth: buyerContentWidth,
        maxLines: 2,
    });

    drawWrappedLines(page, customerAddressLinesRest, buyerContentX, buyerTextY - 1, {
        font: helvetica,
        size: 8,
        lineHeight: buyerAddressLineHeight,
        maxWidth: buyerContentWidth,
    });

    drawLine(page, buyerContentX, buyerSeparatorY, buyerBoxX + 237, buyerSeparatorY, 0.6, borderBlue);
    drawText(page, getSaleTypeInvoiceLabel(data.saleType), buyerContentX, buyerExportY, {
        font: helveticaBold,
        size: 7,
        color: gray,
        maxWidth: 220,
    });

    /**
     * Rechte Firmen- und Bankdatenbox
     */
    const infoBoxX = 314;
    const infoBoxY = 468;
    const infoBoxWidth = 243;
    const infoBoxHeight = 250;

    drawBox(page, infoBoxX, infoBoxY, infoBoxWidth, infoBoxHeight, {
        borderColor: borderBlue,
        borderWidth: 0.8,
        fillColor: paleBlue,
        radius: 6,
    });

    const rightIconX = infoBoxX + 15;
    const rightContentX = textXAfterBadge(rightIconX);
    const rightContentWidth = infoBoxX + infoBoxWidth - 14 - rightContentX;
    drawIconBadge(page, rightIconX, infoBoxY + infoBoxHeight - 22, "building");

    drawWrappedLines(
        page,
        [
            getInvoiceCompanyDisplayName(),
            data.company.street,
            `${data.company.postalCode} ${data.company.city}`,
        ].filter((line): line is string => line !== null),
        rightContentX,
        infoBoxY + infoBoxHeight - 27,
        {
            font: helveticaBold,
            size: 7.4,
            lineHeight: 10,
            maxWidth: rightContentWidth,
        },
    );

    let contactY = infoBoxY + infoBoxHeight - 62;
    const contactLineGap = 20;
    const drawContactLine = (kind: InvoiceIcon, text: string) => {
        drawIconBadge(page, rightIconX, contactY + 3.2, kind);
        drawText(page, text, rightContentX, contactY, {
            font: helveticaBold,
            size: 7.2,
            maxWidth: rightContentWidth,
        });
        contactY -= contactLineGap;
    };
    const drawCompanyTextLine = (text: string) => {
        drawText(page, text, rightContentX, contactY, {
            font: helveticaBold,
            size: 7.2,
            maxWidth: rightContentWidth,
        });
        contactY -= contactLineGap;
    };

    if (data.company.phone) drawContactLine("phone", `Tel: ${data.company.phone}`);
    if (data.company.mobilePhone1) drawContactLine("phone", `Mobil 1: ${data.company.mobilePhone1}`);
    if (data.company.mobilePhone2) drawContactLine("phone", `Mobil 2: ${data.company.mobilePhone2}`);
    if (data.company.email) drawContactLine("mail", `E-Mail: ${data.company.email}`);
    if (data.company.website) drawContactLine("document", `Web: ${data.company.website}`);
    drawCompanyTextLine(`Steuer-Nr: ${safeText(data.company.taxNumber)}`);

    if (data.company.vatId?.trim()) {
        drawCompanyTextLine(`USt-IdNr: ${data.company.vatId.trim()}`);
    }

    const bankBoxHeight = 132;
    const bankTopY = contactY + 15;
    const bankBoxY = bankTopY - bankBoxHeight;

    drawBox(page, infoBoxX, bankBoxY, infoBoxWidth, bankBoxHeight, {
        borderColor: borderRed,
        borderWidth: 1.6,
        fillColor: paleBlue,
        radius: 6,
    });

    const bankContentX = rightContentX;
    const bankContentWidth = rightContentWidth;

    drawIconBadge(page, rightIconX, bankTopY - 20, "bank");
    drawIconBadge(page, rightIconX, bankTopY - 84, "document");
    drawText(page, "Bankverbindung | bank information:", bankContentX, bankTopY - 17, {
        font: helveticaBold,
        size: 7.2,
        maxWidth: bankContentWidth,
    });

    const bankInfoLines = [
        `Kontoinhaber: ${getInvoiceCompanyDisplayName()}`,
        `Kreditinstitut/Bank: ${safeText(data.company.bankName)}`,
        data.company.bankBlz ? `BLZ: ${data.company.bankBlz}` : null,
        `IBAN: ${safeText(formatIban(data.company.bankIban))}`,
        data.company.bankBic ? `BIC: ${data.company.bankBic}` : null,
    ].filter((line): line is string => line !== null);
    const bankInfoY = bankTopY - 30;
    const bankInfoLineHeight = 9.6;

    drawWrappedLines(page, bankInfoLines, bankContentX, bankInfoY, {
        font: helveticaBold,
        size: 6.9,
        lineHeight: bankInfoLineHeight,
        maxWidth: bankContentWidth,
    });

    const renderedBankInfoLineCount = bankInfoLines.reduce(
        (lineCount, line) => lineCount + wrapText(line, helveticaBold, 6.9, bankContentWidth).length,
        0,
    );
    const paymentPurposeValue = `${safeText(data.vehicle.vin)}_${data.invoiceNumber}`;
    const paymentLabelX = bankContentX;
    const paymentValueX = bankContentX + 74;
    const paymentLabelWidth = paymentValueX - paymentLabelX - 4;
    const paymentValueWidth = bankContentX + bankContentWidth - paymentValueX;
    let paymentY = bankInfoY - renderedBankInfoLineCount * bankInfoLineHeight - 7;

    const drawPaymentPurposeLine = (label: string, value: string) => {
        const safeValue = safeText(value);
        const valueSize = fitTextSize(safeValue, helveticaBold, 6.6, 4.8, paymentValueWidth);

        drawWrappedText(page, label, paymentLabelX, paymentY, {
            font: helveticaBold,
            size: 6.6,
            lineHeight: 8.8,
            maxWidth: paymentLabelWidth,
            maxLines: 2,
        });
        drawText(page, safeValue, paymentValueX, paymentY, {
            font: helveticaBold,
            size: valueSize,
            maxWidth: paymentValueWidth,
        });
        paymentY -= 20;
    };

    drawPaymentPurposeLine("Verwendungszweck | reason for payment:", paymentPurposeValue);
    drawPaymentPurposeLine(getPaymentReasonLabel(data.invoiceType), data.invoiceNumber);
    drawPaymentPurposeLine(
        data.invoiceType === "proforma"
            ? "Fahrgestellnummer | VIN"
            : "Fahrgestell-Nr. | VIN",
        data.vehicle.vin,
    );

    /**
     * Linke Rechnungsbox
     */
    drawBox(page, 42, 500, 230, 44, {
        borderColor: black,
        borderWidth: 1,
    });

    const leftBoxIconX = 57;
    const leftBoxTextX = textXAfterBadge(leftBoxIconX);

    drawIconBadge(page, leftBoxIconX, 523, "calendar");

    drawWrappedText(page, getInvoiceBoxTitle(data.invoiceType, invoiceDisplayNumber), leftBoxTextX, 525, {
        font: helveticaBold,
        size: 9,
        lineHeight: 10,
        maxWidth: 42 + 230 - 9 - leftBoxTextX,
        maxLines: 1,
    });

    drawText(
        page,
        `Rechnungs-Datum: ${formatDate(data.invoiceDate)} | Fällig: ${formatDate(data.dueDate)}`,
        leftBoxTextX,
        507,
        {
        font: helveticaBold,
        size: 8,
        },
    );

    /**
     * Gebrauchte Box - bewusst mit Abstand zur Fahrzeugtabelle
     */
    drawBox(page, 42, 444, 230, 44, {
        borderColor: black,
        borderWidth: 1,
    });

    drawIconBadge(page, leftBoxIconX, 467, "document");

    drawText(page, "Gebrauchte | Pre-owned:", leftBoxTextX, 463, {
        font: helveticaBold,
        size: 8,
    });

    drawWrappedText(page, safeText(data.vehicle.vehicleType), leftBoxTextX + 100, 463, {
        font: helveticaBold,
        size: 8,
        lineHeight: 9,
        maxWidth: 42 + 230 - 9 - (leftBoxTextX + 100),
        maxLines: 2,
    });

    drawText(page, "Modell:", leftBoxTextX, 451, {
        font: helveticaBold,
        size: 8,
    });

    drawWrappedText(page, safeText(data.vehicle.model), leftBoxTextX + 100, 451, {
        font: helveticaBold,
        size: 8,
        lineHeight: 9,
        maxWidth: 42 + 230 - 9 - (leftBoxTextX + 100),
        maxLines: 2,
    });

    /**
     * Fahrzeugtabelle
     */
    const tableX = 42;
    const tableY = 205;
    const tableWidth = 515;
    const tableHeight = 190;

    const headerHeight = 23;
    const col1 = 160;
    const col3 = 100;
    const col2 = tableWidth - col1 - col3;

    const tableTopY = tableY + tableHeight;
    const tableContentTopY = tableTopY - headerHeight;

    drawBox(page, tableX, tableY, tableWidth, tableHeight, {
        borderColor: black,
        borderWidth: 1,
    });

    drawBox(page, tableX, tableTopY - headerHeight, tableWidth, headerHeight, {
        borderColor: black,
        borderWidth: 1,
        fillColor: navy,
    });

    // Keep the price-column fill below the header so the complete header row
    // remains navy with white text.
    drawBox(page, tableX + col1 + col2, tableY, col3, tableHeight - headerHeight, {
        borderColor: black,
        borderWidth: 0,
        fillColor: paleBlue,
    });

    drawLine(page, tableX + col1, tableY, tableX + col1, tableTopY);
    drawLine(page, tableX + col1 + col2, tableY, tableX + col1 + col2, tableTopY);
    drawLine(page, tableX, tableContentTopY, tableX + tableWidth, tableContentTopY);

    drawCenteredText(
        page,
        "Fahrzeug | Vehicle",
        tableX,
        tableTopY - 15,
        col1,
        helveticaBold,
        6.5,
        rgb(1, 1, 1),
    );

    drawCenteredText(
        page,
        "Fahrgestellnummer | VIN",
        tableX + col1,
        tableTopY - 15,
        col2,
        helveticaBold,
        6.5,
        rgb(1, 1, 1),
    );

    drawCenteredText(
        page,
        "Ges.-Preis",
        tableX + col1 + col2,
        tableTopY - 15,
        col3,
        helveticaBold,
        6.2,
        rgb(1, 1, 1),
    );

    const vehicleIconX = tableX + 14;
    drawIconBadge(page, vehicleIconX, tableContentTopY - 16, "truck");
    const vehicleLabelX = textXAfterBadge(vehicleIconX);
    const vehicleLabelWidth = 52;
    const vehicleValueX = vehicleLabelX + vehicleLabelWidth;
    const vehicleStartY = tableContentTopY - 12;
    const vehicleLineHeight = 25;
    const vehicleValueMaxWidth = col1 - (vehicleValueX - tableX) - 12;
    const vehicleTextSize = 8;

    drawText(page, "Marke:", vehicleLabelX, vehicleStartY, {
        font: helveticaBold,
        size: vehicleTextSize,
    });

    drawWrappedText(page, safeText(data.vehicle.manufacturer), vehicleValueX, vehicleStartY, {
        font: helveticaBold,
        size: vehicleTextSize,
        lineHeight: 9,
        maxWidth: vehicleValueMaxWidth,
        maxLines: 2,
    });

    drawText(page, "Art/Typ:", vehicleLabelX, vehicleStartY - vehicleLineHeight, {
        font: helveticaBold,
        size: vehicleTextSize,
    });

    drawWrappedText(page, safeText(data.vehicle.model), vehicleValueX, vehicleStartY - vehicleLineHeight, {
        font: helveticaBold,
        size: vehicleTextSize,
        lineHeight: 9,
        maxWidth: vehicleValueMaxWidth,
        maxLines: 2,
    });

    drawText(page, getThirdVehicleLineLabel(data.invoiceType), vehicleLabelX, vehicleStartY - vehicleLineHeight * 2, {
        font: helveticaBold,
        size: vehicleTextSize,
    });

    drawWrappedText(page, getThirdVehicleLineValue(data), vehicleValueX, vehicleStartY - vehicleLineHeight * 2, {
        font: helveticaBold,
        size: vehicleTextSize,
        lineHeight: 9,
        maxWidth: vehicleValueMaxWidth,
        maxLines: 2,
    });

    const vinText = safeText(data.vehicle.vin);
    const vinSize = fitTextSize(vinText, helveticaBold, 11, 8, col2 - 24);
    drawCenteredText(
        page,
        vinText,
        tableX + col1,
        tableContentTopY - 27,
        col2,
        helveticaBold,
        vinSize,
        navy,
    );

    const agreementNotes = data.invoiceNotes?.trim();
    const warrantyTextTopY = agreementNotes ? tableContentTopY - 96 : tableContentTopY - 50;

    if (agreementNotes) {
        const agreementX = tableX + col1 + 12;
        const agreementY = tableContentTopY - 47;
        const agreementWidth = col2 - 24;

        drawText(page, "Zusätzliche Vereinbarung:", agreementX, agreementY, {
            font: helveticaBold,
            size: 6.8,
            color: navy,
            maxWidth: agreementWidth,
        });

        drawWrappedText(page, agreementNotes, agreementX, agreementY - 10, {
            font: helveticaBold,
            size: 6.6,
            lineHeight: 8,
            maxWidth: agreementWidth,
            maxLines: 5,
            color: black,
        });
    }

    drawCellText(
        page,
        "Der Verkauf erfolgt ohne jeglicher Gewährleistung und Garantie!",
        tableX + col1,
        warrantyTextTopY,
        col2,
        {
            font: helveticaBold,
            size: 7.5,
            lineHeight: 9,
            paddingX: 12,
            paddingTop: 10,
            maxLines: 3,
            align: "left",
        },
    );

    const vehiclePrice = formatCurrency(data.amounts.netAmount);
    const vehiclePriceSize = fitTextSize(
        vehiclePrice,
        helveticaBold,
        11,
        7.5,
        col3 - 16,
    );

    drawCellText(
        page,
        vehiclePrice,
        tableX + col1 + col2,
        tableContentTopY,
        col3,
        {
            font: helveticaBold,
            size: vehiclePriceSize,
            lineHeight: 7,
            paddingX: 8,
            paddingTop: 23,
            maxLines: 1,
            align: "center",
        },
    );

    /**
     * Zahlungsbedingungen und Summenbereich
     */
    const paymentTitleY = 188;

    const paymentIconX = 54;
    drawIconBadge(page, paymentIconX, paymentTitleY + 1, "card");
    drawText(page, "Zahlungsbedingungen | Payment:", textXAfterBadge(paymentIconX), paymentTitleY, {
        font: helveticaBold,
        size: 7.2,
    });

    drawWrappedLines(
        page,
        getPaymentAndTaxLines(data),
        42,
        174,
        {
            font: helvetica,
            size: 5.5,
            lineHeight: 10,
            maxWidth: 345,
        },
    );

    const totalsX = tableX + col1 + col2;
    const totalsY = 150;
    const totalsBoxWidth = col3;
    const totalsBoxHeight = 18;
    const totalsLabelRightX = totalsX - 8;

    drawRightAlignedText(
        page,
        "Rechnungswert ohne MwSt.(EUR)",
        totalsLabelRightX,
        totalsY + 41,
        helvetica,
        5.8,
    );

    drawBox(page, totalsX, totalsY + 35, totalsBoxWidth, totalsBoxHeight, {
        borderColor: black,
        borderWidth: 1,
        fillColor: paleBlue,
    });

    drawRightAlignedText(
        page,
        formatCurrency(data.amounts.netAmount),
        totalsX + totalsBoxWidth - 6,
        totalsY + 41,
        helveticaBold,
        6,
    );

    drawRightAlignedText(
        page,
        `davon ${data.amounts.vatRate}% MwST.`,
        totalsLabelRightX,
        totalsY + 23,
        helvetica,
        5.8,
    );

    drawBox(page, totalsX, totalsY + 17, totalsBoxWidth, totalsBoxHeight, {
        borderColor: black,
        borderWidth: 1,
        fillColor: lightGray,
    });

    drawRightAlignedText(
        page,
        formatCurrency(data.amounts.vatAmount),
        totalsX + totalsBoxWidth - 6,
        totalsY + 23,
        helveticaBold,
        6,
    );

    drawRightAlignedText(
        page,
        "Brutto Gesamtpreis",
        totalsLabelRightX,
        totalsY + 5,
        helveticaBold,
        5.9,
    );

    drawBox(page, totalsX, totalsY - 1, totalsBoxWidth, totalsBoxHeight, {
        borderColor: black,
        borderWidth: 1,
        fillColor: navy,
    });

    const grossAmountText = formatCurrency(data.amounts.grossAmount);
    const grossAmountSize = fitTextSize(
        grossAmountText,
        helveticaBold,
        9.2,
        7.2,
        totalsBoxWidth - 12,
    );

    drawRightAlignedText(
        page,
        grossAmountText,
        totalsX + totalsBoxWidth - 6,
        totalsY + 5,
        helveticaBold,
        grossAmountSize,
        rgb(1, 1, 1),
    );

    await drawSignatureStampImages(page, pdfDoc, data.signatureStamp);

    if (data.termsAttached) {
        drawWrappedText(page, getTermsNotice(data.customer.preferredLanguage), 42, 52, {
            font: helvetica,
            size: 5.8,
            lineHeight: 7,
            maxWidth: 500,
            maxLines: 3,
            color: gray,
        });
    }

    drawDamageNotesPages(pdfDoc, data, helvetica, helveticaBold);

    return pdfDoc.save();
}
