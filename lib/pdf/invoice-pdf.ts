import { readFile } from "fs/promises";
import path from "path";
import type { InvoiceType } from "@/lib/invoices/invoice-numbering";
import type { SaleType } from "@/lib/sales/sale-queries";
import { normalizeEmailLanguage } from "@/lib/customers/email-languages";
import { formatIban } from "@/lib/settings/company-bank-details";
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
    invoiceDate: string;
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
const tableGray = rgb(0.72, 0.72, 0.72);
const red = rgb(0.9, 0.05, 0.05);
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
    },
) {
    page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: options?.borderColor ?? black,
        borderWidth: options?.borderWidth ?? 1,
        color: options?.fillColor,
    });
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
) {
    const textWidth = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
        x: x + (width - textWidth) / 2,
        y,
        size,
        font,
        color: black,
    });
}

function drawRightAlignedText(
    page: PDFPage,
    text: string,
    rightX: number,
    y: number,
    font: PDFFont,
    size: number,
) {
    const textWidth = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
        x: rightX - textWidth,
        y,
        size,
        font,
        color: black,
    });
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

    if (signatureImage) {
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
        const width = 68;
        const height = Math.min(50, (stampImage.height / stampImage.width) * width);

        page.drawImage(stampImage, {
            x: 476,
            y: 66,
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
        return "Proforma Anzahlungs Rechnung";
    }

    if (invoiceType === "down_payment") {
        return "Anzahlungs Rechnung";
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
        return "Anzahlungs-Rechnung: Proforma";
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

function getPrimaryFileLabel(invoiceType: InvoiceType): string {
    if (invoiceType === "cancellation_invoice") {
        return "Storno";
    }

    if (invoiceType === "credit_note") {
        return "Gutschrift";
    }

    if (invoiceType === "proforma") {
        return "Proforma";
    }

    if (invoiceType === "down_payment") {
        return "Anzahlung";
    }

    return "";
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
    const invoiceNoteLines = data.invoiceNotes?.trim()
        ? [
              "",
              "Hinweis / Notiz:",
              ...data.invoiceNotes
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0),
          ]
        : [];

    if (data.saleType === "eu") {
        return [
            ...baseLines,
            ...invoiceNoteLines,
            "",
            "Steuerfreie innergemeinschaftliche Lieferung gemäß § 4 Nr. 1b UStG i.V.m. § 6a UStG. | Intra-Community supply exempt from VAT.",
        ];
    }

    if (data.saleType === "export_third_country") {
        return [
            ...baseLines,
            ...invoiceNoteLines,
            "",
            "Steuerfreie Ausfuhrlieferung gemäß § 4 Nr. 1a UStG. | Export delivery exempt from VAT according to § 4 No. 1a German VAT Act.",
        ];
    }

    return [...baseLines, ...invoiceNoteLines];
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

    const embeddedFontBytes = await readFile(pdfFontPath);
    const embeddedFont = await pdfDoc.embedFont(embeddedFontBytes, { subset: false });
    const helvetica = embeddedFont;
    const helveticaBold = embeddedFont;

    const logoPath = path.join(process.cwd(), "public", "brand", "waw-logo.png");
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);

    page.drawImage(logoImage, {
        x: 40,
        y: 708,
        width: 120,
        height: 95,
    });

    drawText(page, getInvoiceTitle(data.invoiceType, data.invoiceNumber), 210, 805, {
        font: helveticaBold,
        size: data.invoiceType === "standard" ? 22 : 21,
        color: data.invoiceType === "standard" ? gray : black,
        maxWidth: 340,
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
    drawText(page, "Käufer | Buyer:", 42, 662, {
        font: helveticaBold,
        size: 7.2,
        color: gray,
    });

    drawWrappedLines(page, getCustomerAddressLines(data), 42, 646, {
        font: helveticaBold,
        size: 7,
        lineHeight: 10,
        maxWidth: 245,
    });

    drawText(page, getSaleTypeInvoiceLabel(data.saleType), 42, 586, {
        font: helveticaBold,
        size: 6.5,
        color: gray,
    });

    /**
     * Rechte Firmen- und Bankdatenbox
     */
    const infoBoxX = 378;
    const infoBoxY = 468;
    const infoBoxWidth = 178;
    const infoBoxHeight = 250;
    const infoHeaderHeight = 18;

    drawBox(page, infoBoxX, infoBoxY, infoBoxWidth, infoBoxHeight, {
        borderColor: black,
        borderWidth: 1,
    });

    drawBox(page, infoBoxX, infoBoxY + infoBoxHeight - infoHeaderHeight, infoBoxWidth, infoHeaderHeight, {
        borderColor: black,
        borderWidth: 1,
        fillColor: tableGray,
    });

    drawWrappedLines(
        page,
        [
            data.company.legalName,
            data.company.street,
            `${data.company.postalCode} ${data.company.city}`,
            "",
            `Tel: ${safeText(data.company.phone)}`,
            data.company.mobilePhone1 ? `Mobil 1: ${data.company.mobilePhone1}` : null,
            data.company.mobilePhone2 ? `Mobil 2: ${data.company.mobilePhone2}` : null,
            `E-Mail: ${safeText(data.company.email)}`,
            data.company.website ? `Web: ${data.company.website}` : null,
            `Steuer-Nr: ${safeText(data.company.taxNumber)}`,
            safeText(data.company.vatId),
        ].filter((line): line is string => line !== null),
        infoBoxX + 6,
        infoBoxY + infoBoxHeight - 35,
        {
            font: helveticaBold,
            size: 5.7,
            lineHeight: 11,
            maxWidth: infoBoxWidth - 12,
        },
    );

    const bankBoxY = infoBoxY;
    const bankBoxHeight = 112;

    drawBox(page, infoBoxX, bankBoxY, infoBoxWidth, bankBoxHeight, {
        borderColor: red,
        borderWidth: 1.5,
    });

    drawWrappedLines(
        page,
        [
            "Bankverbindung | bank information:",
            `Kontoinhaber: ${safeText(data.company.bankAccountHolder ?? data.company.legalName)}`,
            `Kreditinstitut/Bank: ${safeText(data.company.bankName)}`,
            data.company.bankBlz ? `BLZ: ${data.company.bankBlz}` : null,
            `IBAN: ${safeText(formatIban(data.company.bankIban))}`,
            data.company.bankBic ? `BIC: ${data.company.bankBic}` : null,
            "",
            "Verwendungszweck | reason for payment:",
            getPaymentReasonLabel(data.invoiceType),
            data.invoiceType === "proforma"
                ? "Fahrgestellnummer / vehicle identification number"
                : "Fahrgestell-Nr. | Vehicle Identification Number (VIN)",
        ].filter((line): line is string => line !== null),
        infoBoxX + 6,
        bankBoxY + bankBoxHeight - 13,
        {
            font: helveticaBold,
            size: 5.3,
            lineHeight: 10,
            maxWidth: infoBoxWidth - 12,
        },
    );

    /**
     * Linke Rechnungsbox
     */
    drawBox(page, 42, 500, 230, 44, {
        borderColor: black,
        borderWidth: 1,
    });

    drawWrappedText(page, getInvoiceBoxTitle(data.invoiceType, data.invoiceNumber), 48, 525, {
        font: helveticaBold,
        size: 9,
        lineHeight: 10,
        maxWidth: 215,
        maxLines: 1,
    });

    drawText(page, `Rechnungs-Datum: ${formatDate(data.invoiceDate)}`, 48, 507, {
        font: helveticaBold,
        size: 8,
    });

    /**
     * Gebrauchte Box - bewusst mit Abstand zur Fahrzeugtabelle
     */
    drawBox(page, 42, 444, 230, 44, {
        borderColor: black,
        borderWidth: 1,
    });

    drawText(page, "Gebrauchte | Pre-owned:", 48, 463, {
        font: helveticaBold,
        size: 8,
    });

    const primaryFileLabel = getPrimaryFileLabel(data.invoiceType);

    if (primaryFileLabel) {
        drawText(page, primaryFileLabel, 150, 463, {
            font: helveticaBold,
            size: 8,
        });
    }

    /**
     * Fahrzeugtabelle
     */
    const tableX = 42;
    const tableY = 205;
    const tableWidth = 515;
    const tableHeight = 190;

    const headerHeight = 23;
    const col1 = 175;
    const col3 = 75;
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
        fillColor: tableGray,
    });

    drawBox(page, tableX + col1 + col2, tableY, col3, tableHeight, {
        borderColor: black,
        borderWidth: 0,
        fillColor: lightGray,
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
    );

    drawCenteredText(
        page,
        "Fahrgestellnummer | Chassi number .:",
        tableX + col1,
        tableTopY - 15,
        col2,
        helveticaBold,
        6.5,
    );

    drawCenteredText(
        page,
        "Ges.-Preis",
        tableX + col1 + col2,
        tableTopY - 15,
        col3,
        helveticaBold,
        6.2,
    );

    const vehicleLabelX = tableX + 16;
    const vehicleValueX = tableX + 72;
    const vehicleStartY = tableContentTopY - 12;
    const vehicleLineHeight = 25;

    drawText(page, "Marke:", vehicleLabelX, vehicleStartY, {
        font: helveticaBold,
        size: 7,
    });

    drawWrappedText(page, safeText(data.vehicle.manufacturer), vehicleValueX, vehicleStartY, {
        font: helveticaBold,
        size: 7,
        lineHeight: 8,
        maxWidth: col1 - 86,
        maxLines: 2,
    });

    drawText(page, "Art/Typ:", vehicleLabelX, vehicleStartY - vehicleLineHeight, {
        font: helveticaBold,
        size: 7,
    });

    drawWrappedText(page, safeText(data.vehicle.model), vehicleValueX, vehicleStartY - vehicleLineHeight, {
        font: helveticaBold,
        size: 7,
        lineHeight: 8,
        maxWidth: col1 - 86,
        maxLines: 2,
    });

    drawText(page, getThirdVehicleLineLabel(data.invoiceType), vehicleLabelX, vehicleStartY - vehicleLineHeight * 2, {
        font: helveticaBold,
        size: 7,
    });

    drawWrappedText(page, getThirdVehicleLineValue(data), vehicleValueX + 26, vehicleStartY - vehicleLineHeight * 2, {
        font: helveticaBold,
        size: 7,
        lineHeight: 8,
        maxWidth: col1 - 112,
        maxLines: 2,
    });

    drawCellText(
        page,
        safeText(data.vehicle.vin),
        tableX + col1,
        tableContentTopY,
        col2,
        {
            font: helveticaBold,
            size: 7,
            lineHeight: 8,
            paddingX: 18,
            paddingTop: 14,
            maxLines: 3,
        },
    );

    drawCellText(
        page,
        "Der Verkauf erfolgt ohne jeglicher Gewährleistung und Garantie!",
        tableX + col1,
        tableContentTopY - 50,
        col2,
        {
            font: helveticaBold,
            size: 7,
            lineHeight: 9,
            paddingX: 28,
            paddingTop: 10,
            maxLines: 3,
            align: "center",
        },
    );

    drawCellText(
        page,
        formatCurrency(data.amounts.netAmount),
        tableX + col1 + col2,
        tableContentTopY,
        col3,
        {
            font: helveticaBold,
            size: 6.2,
            lineHeight: 7,
            paddingX: 6,
            paddingTop: 23,
            maxLines: 2,
            align: "right",
        },
    );

    /**
     * Zahlungsbedingungen und Summenbereich
     */
    const paymentTitleY = 188;

    drawText(page, "Zahlungsbedingungen | Payment:", 42, paymentTitleY, {
        font: helveticaBold,
        size: 7.5,
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
        fillColor: lightGray,
    });

    drawRightAlignedText(
        page,
        formatCurrency(data.amounts.netAmount),
        totalsX + totalsBoxWidth - 6,
        totalsY + 41,
        helveticaBold,
        5.8,
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
        5.8,
    );

    drawRightAlignedText(
        page,
        "Brutto - Gesamtpreis",
        totalsLabelRightX,
        totalsY + 5,
        helveticaBold,
        5.8,
    );

    drawBox(page, totalsX, totalsY - 1, totalsBoxWidth, totalsBoxHeight, {
        borderColor: black,
        borderWidth: 1,
        fillColor: lightGray,
    });

    drawRightAlignedText(
        page,
        formatCurrency(data.amounts.grossAmount),
        totalsX + totalsBoxWidth - 6,
        totalsY + 5,
        helveticaBold,
        5.8,
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
