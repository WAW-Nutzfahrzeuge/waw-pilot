import type { PDFDocument, PDFImage } from "pdf-lib";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CompanyPdfImageAsset = {
    bytes: Uint8Array;
    mimeType: string;
    path: string;
};

export type CompanySignatureStampAssets = {
    signatureImage: CompanyPdfImageAsset | null;
    stampImage: CompanyPdfImageAsset | null;
};

type CompanyAssetPaths = {
    signature_image_path: string | null;
    stamp_image_path: string | null;
};

async function downloadAsset(
    path: string | null,
): Promise<CompanyPdfImageAsset | null> {
    if (!path) return null;

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.storage.from("documents").download(path);

    if (error || !data) {
        console.error("[pdf-assets] company asset download failed", error);
        return null;
    }

    return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        mimeType: data.type || "application/octet-stream",
        path,
    };
}

export async function getCompanySignatureStampAssetPaths(): Promise<CompanyAssetPaths> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("companies")
        .select("signature_image_path, stamp_image_path")
        .eq("id", companyId)
        .single();

    if (error || !data) {
        throw new Error(
            `Unterschrift/Stempel konnten nicht geladen werden: ${
                error?.message ?? "Nicht gefunden"
            }`,
        );
    }

    return data as CompanyAssetPaths;
}

export async function assertCompanySignatureStampConfigured() {
    const paths = await getCompanySignatureStampAssetPaths();

    if (!paths.signature_image_path && !paths.stamp_image_path) {
        throw new Error(
            "Bitte hinterlege zuerst die gemeinsame Unterschrift- und Stempeldatei in den Einstellungen.",
        );
    }
}

export async function getCompanySignatureStampAssets(
    includeSignatureStamp: boolean,
): Promise<CompanySignatureStampAssets> {
    if (!includeSignatureStamp) {
        return {
            signatureImage: null,
            stampImage: null,
        };
    }

    const paths = await getCompanySignatureStampAssetPaths();

    if (paths.signature_image_path && !paths.stamp_image_path) {
        return {
            signatureImage: await downloadAsset(paths.signature_image_path),
            stampImage: null,
        };
    }

    if (!paths.signature_image_path && paths.stamp_image_path) {
        return {
            signatureImage: null,
            stampImage: await downloadAsset(paths.stamp_image_path),
        };
    }

    if (
        paths.signature_image_path &&
        paths.stamp_image_path &&
        paths.signature_image_path === paths.stamp_image_path
    ) {
        return {
            signatureImage: await downloadAsset(paths.signature_image_path),
            stampImage: null,
        };
    }

    const [signatureImage, stampImage] = await Promise.all([
        downloadAsset(paths.signature_image_path),
        downloadAsset(paths.stamp_image_path),
    ]);

    return {
        signatureImage,
        stampImage,
    };
}

export async function embedCompanyPdfImage(
    pdfDoc: PDFDocument,
    asset: CompanyPdfImageAsset,
): Promise<PDFImage | null> {
    const mimeType = asset.mimeType.toLowerCase();
    const path = asset.path.toLowerCase();

    try {
        if (mimeType.includes("png") || path.endsWith(".png")) {
            return await pdfDoc.embedPng(asset.bytes);
        }

        if (
            mimeType.includes("jpeg") ||
            mimeType.includes("jpg") ||
            path.endsWith(".jpg") ||
            path.endsWith(".jpeg")
        ) {
            return await pdfDoc.embedJpg(asset.bytes);
        }

        if (mimeType.includes("webp") || path.endsWith(".webp")) {
            const { default: sharp } = await import("sharp");
            const pngBytes = await sharp(Buffer.from(asset.bytes)).png().toBuffer();

            return await pdfDoc.embedPng(pngBytes);
        }
    } catch (error) {
        console.error("[pdf-assets] company asset embed failed", error);
    }

    return null;
}
