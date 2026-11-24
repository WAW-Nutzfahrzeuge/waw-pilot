import type { SupabaseClient } from "@supabase/supabase-js";

import {
    companyEmailSignaturePlainText,
    extractCompanyEmailSignatureContentIds,
    isValidEmailSignatureContentId,
    sanitizeCompanyEmailSignatureHtml,
} from "@/lib/email/company-email-signature";
import { emailAttachmentLimits } from "@/src/modules/email/domain/policies/email-attachment-policy";
import type {
    CompanyEmailSignatureReaderPort,
    ResolvedCompanyEmailSignature,
} from "@/src/modules/email/application/ports/company-email-signature-reader.port";

type SignatureAsset = {
    contentId: string;
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
};

export class SupabaseCompanyEmailSignatureReader implements CompanyEmailSignatureReaderPort {
    constructor(private readonly supabase: SupabaseClient) {}

    async read(companyId: string): Promise<ResolvedCompanyEmailSignature | null> {
        const { data, error } = await this.supabase
            .from("companies")
            .select("email_signature_html, email_signature_includes_closing, email_signature_assets")
            .eq("id", companyId)
            .maybeSingle();

        if (error || !data) {
            throw new Error("Die Firmen-E-Mail-Signatur konnte nicht geladen werden.");
        }

        const html = sanitizeCompanyEmailSignatureHtml(data.email_signature_html);
        if (!html) return null;

        const referencedIds = extractCompanyEmailSignatureContentIds(html);
        const assets = parseAssets(data.email_signature_assets, companyId);
        const inlineAttachments = await Promise.all(referencedIds.map(async (contentId) => {
            const asset = assets.find((item) => item.contentId === contentId);
            if (!asset) throw new Error("Ein Bild der Firmen-E-Mail-Signatur fehlt.");

            const { data: file, error: downloadError } = await this.supabase.storage
                .from("documents")
                .download(asset.filePath);
            if (downloadError || !file) {
                throw new Error("Ein Bild der Firmen-E-Mail-Signatur konnte nicht geladen werden.");
            }
            const content = Buffer.from(await file.arrayBuffer());
            if (!content.byteLength || content.byteLength !== asset.fileSizeBytes) {
                throw new Error("Ein Bild der Firmen-E-Mail-Signatur ist unvollständig.");
            }
            return {
                filename: asset.fileName,
                content,
                contentType: "image/png",
                contentId,
            };
        }));

        const totalInlineBytes = inlineAttachments.reduce((total, item) => total + item.content.byteLength, 0);
        if (totalInlineBytes > emailAttachmentLimits.maxTotalSizeBytes) {
            throw new Error("Die Firmen-E-Mail-Signatur überschreitet das zulässige Versandvolumen.");
        }

        const includesClosing = data.email_signature_includes_closing === true;

        return {
            html,
            text: companyEmailSignaturePlainText(html),
            inlineAttachments,
            includesClosing,
        };
    }
}

function parseAssets(value: unknown, companyId: string): SignatureAsset[] {
    if (!Array.isArray(value)) return [];
    const prefix = `company-assets/${companyId}/email-signature/`;
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const asset = item as Record<string, unknown>;
        if (
            !isValidEmailSignatureContentId(asset.contentId) ||
            typeof asset.filePath !== "string" ||
            !asset.filePath.startsWith(prefix) ||
            asset.filePath.includes("..") ||
            typeof asset.fileName !== "string" ||
            asset.mimeType !== "image/png" ||
            !Number.isSafeInteger(asset.fileSizeBytes) ||
            (asset.fileSizeBytes as number) <= 0 ||
            (asset.fileSizeBytes as number) > 2 * 1024 * 1024
        ) return [];
        return [{
            contentId: asset.contentId,
            filePath: asset.filePath,
            fileName: asset.fileName.slice(0, 180),
            mimeType: "image/png",
            fileSizeBytes: asset.fileSizeBytes as number,
        }];
    });
}
