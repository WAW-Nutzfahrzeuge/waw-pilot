export type ResolvedCompanyEmailSignature = {
    html: string;
    text: string;
    inlineAttachments: Array<{
        filename: string;
        content: Buffer;
        contentType: string;
        contentId: string;
    }>;
    includesClosing: boolean;
};

export interface CompanyEmailSignatureReaderPort {
    read(companyId: string): Promise<ResolvedCompanyEmailSignature | null>;
}
