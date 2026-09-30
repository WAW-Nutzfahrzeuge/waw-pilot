import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { formatPdfDate } from "@/lib/pdf/core/pdf-format";
import { getWawLogoBytes } from "@/lib/pdf/core/pdf-assets";
import { resolveCompanyDocumentIdentity } from "@/lib/pdf/core/company-document-header";
import type { SaleGeneratedDocumentData } from "@/lib/pdf/generated-documents/sale-document-data";

const templatePath = path.join(
    process.cwd(),
    "public",
    "Endverbleibserklaerung_LKW_WAW_Vorlage.pdf",
);

type DeclarationIcon = "building" | "document" | "truck";

// The invoice uses Lucide's vector paths directly in the PDF. Reusing that
// approach here keeps the two document families visually consistent without
// introducing image assets or affecting print quality.
const declarationIconPaths: Record<DeclarationIcon, string[]> = {
    building: [
        "M10 12h4",
        "M10 8h4",
        "M14 21v-3a2 2 0 0 0-4 0v3",
        "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
        "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
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
};

const invoiceNavy = rgb(0.04, 0.12, 0.22);
const invoicePaleBlue = rgb(0.87, 0.94, 0.98);

function drawDeclarationIcon(
    page: PDFPage,
    x: number,
    y: number,
    kind: DeclarationIcon,
) {
    const scale = 0.26;

    for (const iconPath of declarationIconPaths[kind]) {
        page.drawSvgPath(iconPath, {
            x: x - 12 * scale,
            y: y + 12 * scale,
            scale,
            borderColor: invoiceNavy,
            borderWidth: 0.75,
        });
    }
}

function drawSectionIconBadge(
    page: PDFPage,
    x: number,
    y: number,
    kind: DeclarationIcon,
) {
    page.drawCircle({ x, y, size: 5.5, color: invoicePaleBlue });
    drawDeclarationIcon(page, x, y, kind);
}

function drawSectionHeading(
    page: PDFPage,
    font: PDFFont,
    params: { y: number; label: string; icon: DeclarationIcon },
) {
    // Only replace the tiny printed heading area; the surrounding form and
    // all of its table borders remain untouched.
    page.drawRectangle({
        x: 46,
        y: params.y - 4,
        width: 270,
        height: 14,
        color: rgb(1, 1, 1),
    });
    drawSectionIconBadge(page, 53, params.y + 2, params.icon);
    page.drawText(params.label, {
        x: 63,
        y: params.y - 1,
        size: 8,
        font,
        color: invoiceNavy,
    });
}

function valueOrDash(value: string | number | null | undefined): string {
    const valueAsString = String(value ?? "").trim();

    return valueAsString.length > 0 ? valueAsString : "—";
}

function drawFittedText(
    page: PDFPage,
    font: PDFFont,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    size = 7,
) {
    let fittedSize = size;

    while (fittedSize > 5 && font.widthOfTextAtSize(text, fittedSize) > maxWidth) {
        fittedSize -= 0.25;
    }

    const maxLength = Math.max(1, Math.floor((maxWidth / font.widthOfTextAtSize("W", fittedSize)) * 1.25));
    const fittedText =
        font.widthOfTextAtSize(text, fittedSize) > maxWidth
            ? `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
            : text;

    page.drawText(fittedText, {
        x,
        y,
        size: fittedSize,
        font,
        color: rgb(0, 0, 0),
    });
}

/** Clears only the pre-printed underline, never a table or box border. */
function clearPrintedUnderline(
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height = 1.5,
) {
    page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(1, 1, 1),
    });
}

function drawWrappedFieldText(
    page: PDFPage,
    font: PDFFont,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxLines = 2,
) {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let currentLine = "";
    const size = 7;

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;

        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            currentLine = candidate;
            continue;
        }

        if (currentLine) lines.push(currentLine);
        currentLine = word;
    }

    if (currentLine) lines.push(currentLine);

    lines.slice(0, maxLines).forEach((line, index) => {
        page.drawText(line, {
            x,
            y: y - index * 8,
            size,
            font,
            color: rgb(0, 0, 0),
        });
    });
}

function getVehicleLabel(data: SaleGeneratedDocumentData): string {
    return [
        data.vehicle?.manufacturer,
        data.vehicle?.model,
        data.vehicle?.vehicleType,
    ]
        .filter(Boolean)
        .join(" ") || "—";
}

function formatPrice(value: number | null | undefined): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";

    return new Intl.NumberFormat("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

async function drawInvoiceStyledHeader(
    page: PDFPage,
    pdf: PDFDocument,
    data: SaleGeneratedDocumentData,
    regularFont: PDFFont,
    boldFont: PDFFont,
) {
    const muted = rgb(0.31, 0.38, 0.45);
    const identity = resolveCompanyDocumentIdentity(data);
    const logo = await pdf.embedPng(await getWawLogoBytes());

    page.drawRectangle({
        x: 0,
        // The explanatory sentence below the document heading belongs to the
        // supplied form and must remain completely visible.
        y: 734,
        width: page.getWidth(),
        height: page.getHeight() - 734,
        color: rgb(1, 1, 1),
    });
    page.drawImage(logo, {
        x: 42,
        y: 748,
        width: 90,
        height: 59,
    });
    page.drawText("Endverbleibserklärung", {
        x: 148,
        y: 786,
        size: 16,
        font: boldFont,
        color: invoiceNavy,
    });
    page.drawText("End-use declaration for commercial vehicles", {
        x: 148,
        y: 770,
        size: 8.5,
        font: regularFont,
        color: muted,
    });
    drawFittedText(page, boldFont, identity.legalName, 425, 806, 125, 7.5);
    drawFittedText(
        page,
        regularFont,
        `${identity.street}, ${identity.postalCode} ${identity.city}`,
        425,
        794,
        125,
        6.5,
    );
}

export async function generateEndUseDeclarationPdf(
    data: SaleGeneratedDocumentData,
): Promise<Uint8Array> {
    if (!data.customer || !data.vehicle || !data.sale || !data.export) {
        throw new Error(
            "Endverbleibserklärung konnte nicht erzeugt werden: Verkaufsdaten sind unvollständig.",
        );
    }

    // Do not save the loaded template document directly. Its original object
    // structure is accepted by Preview/iOS, but pdf-lib's re-serialization of
    // that structure produces a PDF that those renderers reject. Copying the
    // template pages into a fresh document retains the visible form while
    // producing a standards-compatible output document.
    const template = await PDFDocument.load(await readFile(templatePath));
    const pdf = await PDFDocument.create();
    const templatePages = await pdf.copyPages(template, template.getPageIndices());

    for (const templatePage of templatePages) {
        pdf.addPage(templatePage);
    }

    const page = pdf.getPage(0);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

    await drawInvoiceStyledHeader(page, pdf, data, font, boldFont);
    drawSectionHeading(page, font, {
        y: 621,
        label: "Fahrzeuge / Vehicles",
        icon: "truck",
    });
    drawSectionHeading(page, font, {
        y: 530,
        label: "Bestimmungsort und Verwendung / Destination and use",
        icon: "building",
    });
    // The printed declaration heading sits directly under the destination
    // table. Clear that label only (without touching the table's lower
    // border), then redraw it with a comfortable gap below the table.
    page.drawRectangle({
        x: 46,
        y: 456,
        width: 270,
        height: 16,
        color: rgb(1, 1, 1),
    });
    drawSectionHeading(page, font, {
        // Keep this heading in the form's original heading strip. Moving it
        // lower would cover the first line of the declaration text below.
        y: 463,
        label: "Erklärung des Käufers und Endverwenders",
        icon: "document",
    });

    const invoiceReference = data.sale.invoiceNumber ?? data.sale.saleNumber;
    const documentDate = formatPdfDate(
        data.documentDate?.usedDate ?? data.sale.invoiceDate ?? data.sale.saleDate,
    );
    const destinationCountry = data.export.destinationCountry ?? data.customer.country;
    const destinationCity = data.export.destinationCity ?? data.customer.city;
    const endUser = data.export.receiverName ?? data.customer.name;
    const customerVatId = data.customer.vatId ?? "—";

    // Only remove the thin, pre-printed text underlines. Table grid lines are
    // intentionally left untouched.
    for (const y of [697.5, 685.5, 673.5, 661.5, 649.5]) {
        clearPrintedUnderline(page, 160, y, 166);
        clearPrintedUnderline(page, 429, y, 109);
    }
    clearPrintedUnderline(page, 80, 593.5, 148);
    clearPrintedUnderline(page, 235, 593.5, 196);
    // The template's fixed euro symbol sits at the far end of this field.
    // Clear only the input underline, never the currency marker.
    clearPrintedUnderline(page, 438, 593.5, 55);
    clearPrintedUnderline(page, 152, 501.5, 77);
    clearPrintedUnderline(page, 397, 501.5, 137);
    clearPrintedUnderline(page, 152, 482.5, 139);

    // Baselines sit just above the bottom edge of each box, never at its top.
    drawFittedText(page, font, valueOrDash(invoiceReference), 160, 696, 166, 6.5);
    drawFittedText(page, font, documentDate, 429, 696, 109, 6.5);
    drawFittedText(page, font, valueOrDash(data.customer.name), 160, 684, 166, 6.5);
    drawFittedText(page, font, customerVatId, 429, 684, 109, 6.5);
    drawFittedText(page, font, valueOrDash(data.customer.street), 160, 672, 166, 6.5);
    drawFittedText(page, font, valueOrDash(data.customer.country), 429, 672, 109, 6.5);
    drawFittedText(page, font, valueOrDash(endUser), 160, 660, 166, 6.5);
    drawFittedText(page, font, valueOrDash(data.customer.phone), 429, 660, 109, 6.5);
    drawFittedText(page, font, valueOrDash(destinationCity), 160, 648, 166, 6.5);
    drawFittedText(page, font, valueOrDash(destinationCountry), 429, 648, 109, 6.5);

    drawFittedText(page, font, getVehicleLabel(data), 80, 592, 148, 6.5);
    drawFittedText(page, font, valueOrDash(data.vehicle.vin), 235, 592, 196, 6.5);
    drawFittedText(page, font, formatPrice(data.sale.grossAmount), 438, 592, 98, 6.5);

    // Keep a visible gap to the printed writing rule below these two values.
    drawFittedText(page, font, valueOrDash(destinationCountry), 152, 507, 77, 6.5);
    drawFittedText(page, font, valueOrDash(destinationCity), 397, 507, 137, 6.5);
    drawWrappedFieldText(
        page,
        font,
        "Gewerbliche Nutzung durch den genannten Endverwender",
        152,
        489,
        139,
    );

    const signatureY = 92;
    page.drawLine({
        start: { x: 48, y: signatureY },
        end: { x: 232, y: signatureY },
        thickness: 0.6,
        color: rgb(0, 0, 0),
    });
    page.drawLine({
        start: { x: 330, y: signatureY },
        end: { x: 547, y: signatureY },
        thickness: 0.6,
        color: rgb(0, 0, 0),
    });
    page.drawText("Ort, Datum / Place, date", {
        x: 48,
        y: 77,
        size: 7,
        font,
        color: rgb(0, 0, 0),
    });
    page.drawText("Unterschrift des Endverwenders / Signature of end user", {
        x: 330,
        y: 77,
        size: 7,
        font,
        color: rgb(0, 0, 0),
    });

    return pdf.save();
}
