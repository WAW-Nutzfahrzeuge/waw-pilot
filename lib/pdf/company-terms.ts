import "server-only";

import { PDFDocument } from "pdf-lib";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CompanyTermsPdf = {
    bytes: Buffer;
    path: string;
    filename: string;
    mimeType: string;
    size: number | null;
    uploadedAt: string | null;
};

type CompanyTermsRow = {
    terms_pdf_path: string | null;
    terms_pdf_filename: string | null;
    terms_pdf_mime_type: string | null;
    terms_pdf_size: number | null;
    terms_pdf_uploaded_at: string | null;
};

const companyTermsPdfCache = new Map<string, Promise<CompanyTermsPdf | null>>();

export function clearCompanyTermsPdfCache(companyId = getCurrentCompanyId()) {
    for (const cacheKey of companyTermsPdfCache.keys()) {
        if (cacheKey.startsWith(`${companyId}:`)) {
            companyTermsPdfCache.delete(cacheKey);
        }
    }
}

export async function getCompanyTermsPdf(): Promise<CompanyTermsPdf | null> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const { data, error } = await supabase
        .from("companies")
        .select(
            "terms_pdf_path, terms_pdf_filename, terms_pdf_mime_type, terms_pdf_size, terms_pdf_uploaded_at",
        )
        .eq("id", companyId)
        .single();

    if (error || !data) {
        console.error("[terms] company terms lookup failed", error);
        return null;
    }

    const terms = data as CompanyTermsRow;

    if (!terms.terms_pdf_path) return null;

    if (
        terms.terms_pdf_mime_type &&
        terms.terms_pdf_mime_type !== "application/pdf"
    ) {
        console.error("[terms] stored terms asset is not a PDF");
        return null;
    }

    const cacheKey = [
        companyId,
        terms.terms_pdf_path,
        terms.terms_pdf_uploaded_at ?? "",
        terms.terms_pdf_size ?? "",
    ].join(":");
    const cachedTermsPdf = companyTermsPdfCache.get(cacheKey);

    if (cachedTermsPdf) return cachedTermsPdf;

    const termsPdfPromise = supabase.storage
        .from("documents")
        .download(terms.terms_pdf_path)
        .then(async ({ data: fileData, error: downloadError }) => {
            if (downloadError || !fileData) {
                console.error("[terms] terms PDF download failed", downloadError);
                return null;
            }

            if (fileData.type && fileData.type !== "application/pdf") {
                console.error("[terms] stored terms asset is not a PDF");
                return null;
            }

            return {
                bytes: Buffer.from(await fileData.arrayBuffer()),
                path: terms.terms_pdf_path as string,
                filename: terms.terms_pdf_filename ?? "AGB.pdf",
                mimeType: terms.terms_pdf_mime_type ?? "application/pdf",
                size: terms.terms_pdf_size,
                uploadedAt: terms.terms_pdf_uploaded_at,
            };
        })
        .catch((error: unknown) => {
            companyTermsPdfCache.delete(cacheKey);
            console.error("[terms] terms PDF download failed", error);
            return null;
        });

    companyTermsPdfCache.set(cacheKey, termsPdfPromise);

    return termsPdfPromise;
}

export async function buildFinalInvoicePdf({
                                               invoicePdf,
                                               termsPdf,
                                           }: {
    invoicePdf: Uint8Array | Buffer;
    termsPdf?: Uint8Array | Buffer | null;
}): Promise<Uint8Array> {
    if (!termsPdf || termsPdf.byteLength === 0) {
        return invoicePdf instanceof Uint8Array ? invoicePdf : new Uint8Array(invoicePdf);
    }

    const invoiceDocument = await PDFDocument.load(invoicePdf);
    const termsDocument = await PDFDocument.load(termsPdf);
    const copiedTermsPages = await invoiceDocument.copyPages(
        termsDocument,
        termsDocument.getPageIndices(),
    );

    copiedTermsPages.forEach((page) => invoiceDocument.addPage(page));

    return invoiceDocument.save();
}
