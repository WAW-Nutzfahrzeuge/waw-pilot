import type { PDFDocument } from "pdf-lib";
import { rgb, StandardFonts } from "pdf-lib";

export async function drawSaleIdentifierOnEveryPage(
    pdfDoc: PDFDocument,
    saleIdentifier: string,
): Promise<void> {
    const normalizedIdentifier = saleIdentifier.trim();
    if (!normalizedIdentifier) return;

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const text = `Verkaufskennung: ${normalizedIdentifier}`;
    const size = 7.5;

    for (const page of pdfDoc.getPages()) {
        const { width } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);

        page.drawText(text, {
            x: Math.max(24, width - 42 - textWidth),
            y: 17,
            size,
            font,
            color: rgb(0.25, 0.31, 0.39),
        });
    }
}

