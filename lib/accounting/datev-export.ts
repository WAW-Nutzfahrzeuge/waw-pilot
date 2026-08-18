export const DATEV_ACCOUNTING_COMPANIES = {
    WAW: {
        companyId: "WAW",
        displayName: "WAW",
        sourceMailboxes: [
            "rechnung@waw-nutzfahrzeuge.de",
            "info@waw-nutzfahrzeuge.de",
        ],
        datevRecipient:
            "56abe163-b367-433f-896e-8f66073a75b1@uploadmail.datev.de",
    },
    WBT: {
        companyId: "WBT",
        displayName: "WBT",
        sourceMailboxes: [
            "rechnung@wbt-hamburg.de",
            "info@wbt-hamburg.de",
        ],
        datevRecipient:
            "8589dc13-21f8-4099-a6fa-bfa407865650@uploadmail.datev.de",
    },
} as const;

export type DatevAccountingCompany = keyof typeof DATEV_ACCOUNTING_COMPANIES;

export type DatevExportPreparation = {
    company: DatevAccountingCompany;
    fileName: string;
    fileSizeBytes: number;
    preparedAt: string;
};

/**
 * Local preparation seam for the future n8n integration.
 * It deliberately does not upload or process the file yet.
 */
export function processDatevExport(
    file: Pick<File, "name" | "size">,
    company: DatevAccountingCompany,
): DatevExportPreparation {
    return {
        company,
        fileName: file.name,
        fileSizeBytes: file.size,
        preparedAt: new Date().toISOString(),
    };
}
