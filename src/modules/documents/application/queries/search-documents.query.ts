export type SearchDocumentsQuery = {
    companyId: string;
    search?: string;
    documentType?: string;
    status?: string;
    archiveStatus?: string;
    relationType?: string;
    relationId?: string;
    vehicleId?: string;
    needsReviewOnly?: boolean;
    limit?: number;
    offset?: number;
    includeCount?: boolean;
};
