import type { SupabaseClient } from "@supabase/supabase-js";

import type { ArchiveDocumentCommand } from "@/src/modules/documents/application/commands/archive-document.command";
import type { DocumentRepository } from "@/src/modules/documents/application/ports/document-repository.port";
import type { GetDocumentDetailQuery } from "@/src/modules/documents/application/queries/get-document-detail.query";
import type { SearchDocumentsQuery } from "@/src/modules/documents/application/queries/search-documents.query";
import {
    mapSupabaseDocumentRowToDetail,
    mapSupabaseDocumentRowToListItem,
    type SupabaseDocumentRow,
} from "@/src/modules/documents/infrastructure/mappers/supabase-document.mapper";

const documentSelect = `
  id,
  document_reference,
  document_type,
  title,
  description,
  source,
  status,
  archive_status,
  active_version_id,
  file_name,
  file_path,
  mime_type,
  file_size,
  customer_id,
  vehicle_id,
  sale_id,
  invoice_id,
  generated_by_system,
  created_at,
  updated_at,
  created_by,
  updated_by,
  archived_at,
  archived_by,
  archive_reason,
  metadata,
  customers (
    type,
    company_name,
    first_name,
    last_name
  ),
  vehicles (
    internal_number,
    manufacturer,
    model
  ),
  invoices!documents_invoice_id_fkey (
    invoice_number
  )
`;

const documentVersionSelect = `
  id,
  company_id,
  document_id,
  version_number,
  original_file_name,
  stored_file_name,
  storage_bucket,
  storage_path,
  mime_type,
  file_size_bytes,
  checksum,
  uploaded_at,
  uploaded_by,
  is_active,
  replaced_version_id,
  replacement_reason,
  metadata
`;

const documentRelationSelect = `
  id,
  company_id,
  document_id,
  relation_type,
  relation_id,
  created_at,
  created_by,
  metadata
`;

const legacyDocumentSelect = `
  id,
  document_type,
  source,
  status,
  file_name,
  file_path,
  mime_type,
  file_size,
  customer_id,
  vehicle_id,
  sale_id,
  invoice_id,
  generated_by_system,
  created_at,
  customers (
    type,
    company_name,
    first_name,
    last_name
  ),
  vehicles (
    internal_number,
    manufacturer,
    model
  ),
  invoices!documents_invoice_id_fkey (
    invoice_number
  )
`;

type SupabaseQueryError = {
    code?: string;
    message: string;
};

type LegacyDocumentRow = Omit<
    SupabaseDocumentRow,
    | "document_reference"
    | "title"
    | "description"
    | "archive_status"
    | "active_version_id"
    | "updated_at"
    | "created_by"
    | "updated_by"
    | "archived_at"
    | "archived_by"
    | "archive_reason"
    | "metadata"
    | "document_versions"
    | "document_relations"
>;

function isMissingDocumentCenterColumn(error: SupabaseQueryError): boolean {
    return (
        error.code === "42703" ||
        error.message.includes("document_reference") ||
        error.message.includes("archive_status") ||
        error.message.includes("active_version_id")
    );
}

function isMissingDocumentVersioningTable(error: SupabaseQueryError): boolean {
    return error.code === "42P01" || error.message.includes("document_versions");
}

function isMissingDocumentRelationsTable(error: SupabaseQueryError): boolean {
    return error.code === "42P01" || error.message.includes("document_relations");
}

function mapLegacyDocumentRow(row: LegacyDocumentRow): SupabaseDocumentRow {
    return {
        ...row,
        document_reference: null,
        title: row.file_name || row.document_type,
        description: null,
        archive_status: "ACTIVE",
        active_version_id: null,
        updated_at: row.created_at,
        created_by: null,
        updated_by: null,
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        metadata: {},
        document_versions: [],
        document_relations: [],
    };
}

export class SupabaseDocumentRepository implements DocumentRepository {
    constructor(private readonly supabase: SupabaseClient) {}

    async search(query: SearchDocumentsQuery) {
        const includeCount = query.includeCount ?? true;
        let request = this.supabase
            .from("documents")
            .select(documentSelect, includeCount ? { count: "exact" } : undefined)
            .eq("company_id", query.companyId)
            .neq("status", "missing")
            .order("created_at", { ascending: false });

        if (query.archiveStatus) {
            request = request.eq("archive_status", query.archiveStatus);
        } else {
            request = request.or("archive_status.is.null,archive_status.eq.ACTIVE");
        }

        if (query.status) {
            request = request.eq("status", query.status);
        }

        if (query.documentType) {
            request = request.eq("document_type", query.documentType);
        }

        if (query.vehicleId) {
            request = request.eq("vehicle_id", query.vehicleId);
        }

        if (query.needsReviewOnly) {
            request = request.eq("status", "needs_review");
        }

        const normalizedSearch = query.search?.trim();
        if (normalizedSearch) {
            request = request.or(
                [
                    `document_reference.ilike.%${normalizedSearch}%`,
                    `title.ilike.%${normalizedSearch}%`,
                    `file_name.ilike.%${normalizedSearch}%`,
                    `document_type.ilike.%${normalizedSearch}%`,
                ].join(","),
            );
        }

        const offset = query.offset ?? 0;
        const limit = query.limit ?? 200;
        request = request.range(offset, offset + limit - 1);

        const { data, error, count } = await request;

        if (error) {
            if (isMissingDocumentCenterColumn(error)) {
                return this.searchLegacyDocuments(query);
            }

            throw new Error(`Dokumente konnten nicht geladen werden: ${error.message}`);
        }

        const rows = await this.withDocumentVersions(
            query.companyId,
            (data ?? []) as unknown as SupabaseDocumentRow[],
            { includeRelations: true, validateContextRoutes: true },
        );

        return {
            documents: rows.map(mapSupabaseDocumentRowToListItem),
            totalCount: count ?? rows.length,
        };
    }

    async findDetail(query: GetDocumentDetailQuery) {
        const { data, error } = await this.supabase
            .from("documents")
            .select(documentSelect)
            .eq("company_id", query.companyId)
            .eq("id", query.documentId)
            .single();

        if (error || !data) {
            if (error && isMissingDocumentCenterColumn(error)) {
                return this.findLegacyDocumentDetail(query);
            }

            return null;
        }

        const [document] = await this.withDocumentVersions(
            query.companyId,
            [data as unknown as SupabaseDocumentRow],
            { includeRelations: true },
        );

        return document ? mapSupabaseDocumentRowToDetail(document) : null;
    }

    async findActiveFile(params: {
        companyId: string;
        documentId: string;
        versionId?: string;
    }) {
        if (params.versionId) {
            const { data, error } = await this.supabase
                .from("document_versions")
                .select("id, document_id, storage_bucket, storage_path, original_file_name, mime_type")
                .eq("company_id", params.companyId)
                .eq("document_id", params.documentId)
                .eq("id", params.versionId)
                .single();

            if (error || !data) return null;

            return {
                documentId: data.document_id as string,
                fileName: data.original_file_name as string,
                mimeType: data.mime_type as string | null,
                storageBucket: data.storage_bucket as string,
                storagePath: data.storage_path as string,
                versionId: data.id as string,
            };
        }

        const { data: version } = await this.supabase
            .from("document_versions")
            .select("id, document_id, storage_bucket, storage_path, original_file_name, mime_type")
            .eq("company_id", params.companyId)
            .eq("document_id", params.documentId)
            .eq("is_active", true)
            .maybeSingle();

        if (version) {
            return {
                documentId: version.document_id as string,
                fileName: version.original_file_name as string,
                mimeType: version.mime_type as string | null,
                storageBucket: version.storage_bucket as string,
                storagePath: version.storage_path as string,
                versionId: version.id as string,
            };
        }

        const { data: legacyDocument, error } = await this.supabase
            .from("documents")
            .select("id, file_name, file_path, mime_type")
            .eq("company_id", params.companyId)
            .eq("id", params.documentId)
            .single();

        if (error || !legacyDocument?.file_path) return null;

        return {
            documentId: legacyDocument.id as string,
            fileName: legacyDocument.file_name as string,
            mimeType: legacyDocument.mime_type as string | null,
            storageBucket: "documents",
            storagePath: legacyDocument.file_path as string,
            versionId: null,
        };
    }

    async archive(command: ArchiveDocumentCommand): Promise<void> {
        const { error } = await this.supabase
            .from("documents")
            .update({
                archive_status: "ARCHIVED",
                status: "archived",
                archived_at: new Date().toISOString(),
                archived_by: command.archivedBy,
                archive_reason: command.reason,
                updated_at: new Date().toISOString(),
                updated_by: command.archivedBy,
            })
            .eq("company_id", command.companyId)
            .eq("id", command.documentId);

        if (error) {
            throw new Error(`Dokument konnte nicht archiviert werden: ${error.message}`);
        }
    }

    private async searchLegacyDocuments(query: SearchDocumentsQuery) {
        if (query.archiveStatus === "ARCHIVED") {
            return {
                documents: [],
                totalCount: 0,
            };
        }

        const includeCount = query.includeCount ?? true;
        let request = this.supabase
            .from("documents")
            .select(legacyDocumentSelect, includeCount ? { count: "exact" } : undefined)
            .eq("company_id", query.companyId)
            .neq("status", "missing")
            .order("created_at", { ascending: false });

        if (query.status) {
            request = request.eq("status", query.status);
        }

        if (query.documentType) {
            request = request.eq("document_type", query.documentType);
        }

        if (query.vehicleId) {
            request = request.eq("vehicle_id", query.vehicleId);
        }

        if (query.needsReviewOnly) {
            request = request.eq("status", "needs_review");
        }

        const normalizedSearch = query.search?.trim();
        if (normalizedSearch) {
            request = request.or(
                [
                    `file_name.ilike.%${normalizedSearch}%`,
                    `document_type.ilike.%${normalizedSearch}%`,
                ].join(","),
            );
        }

        const offset = query.offset ?? 0;
        const limit = query.limit ?? 200;
        request = request.range(offset, offset + limit - 1);

        const { data, error, count } = await request;

        if (error) {
            throw new Error(`Dokumente konnten nicht geladen werden: ${error.message}`);
        }

        const rows = await this.resolveReviewTargets(
            query.companyId,
            ((data ?? []) as unknown as LegacyDocumentRow[]).map(mapLegacyDocumentRow),
        );

        return {
            documents: rows.map(mapSupabaseDocumentRowToListItem),
            totalCount: count ?? rows.length,
        };
    }

    private async findLegacyDocumentDetail(query: GetDocumentDetailQuery) {
        const { data, error } = await this.supabase
            .from("documents")
            .select(legacyDocumentSelect)
            .eq("company_id", query.companyId)
            .eq("id", query.documentId)
            .single();

        if (error || !data) {
            return null;
        }

        return mapSupabaseDocumentRowToDetail(
            mapLegacyDocumentRow(data as unknown as LegacyDocumentRow),
        );
    }

    private async withDocumentVersions(
        companyId: string,
        rows: SupabaseDocumentRow[],
        options: { includeRelations?: boolean; validateContextRoutes?: boolean } = {},
    ): Promise<SupabaseDocumentRow[]> {
        const documentIds = rows.map((row) => row.id);

        if (documentIds.length === 0) {
            return rows;
        }

        const { data: versions, error: versionError } = await this.supabase
            .from("document_versions")
            .select(documentVersionSelect)
            .eq("company_id", companyId)
            .in("document_id", documentIds)
            .order("version_number", { ascending: false });

        if (versionError) {
            if (isMissingDocumentVersioningTable(versionError)) {
                const rowsWithoutVersions = rows.map((row) => ({
                    ...row,
                    document_versions: [],
                    document_relations: [],
                }));

                if (options.validateContextRoutes) {
                    return this.resolveReviewTargets(companyId, rowsWithoutVersions);
                }

                return rowsWithoutVersions;
            }

            throw new Error(`Dokumentversionen konnten nicht geladen werden: ${versionError.message}`);
        }

        const versionsByDocumentId = new Map<string, SupabaseDocumentRow["document_versions"]>();
        for (const version of (versions ?? []) as unknown as NonNullable<
            SupabaseDocumentRow["document_versions"]
        >) {
            const currentVersions = versionsByDocumentId.get(version.document_id) ?? [];
            currentVersions.push(version);
            versionsByDocumentId.set(version.document_id, currentVersions);
        }

        if (!options.includeRelations) {
            return rows.map((row) => ({
                ...row,
                document_versions: versionsByDocumentId.get(row.id) ?? [],
                document_relations: [],
            }));
        }

        const { data: relations, error: relationError } = await this.supabase
            .from("document_relations")
            .select(documentRelationSelect)
            .eq("company_id", companyId)
            .in("document_id", documentIds)
            .order("created_at", { ascending: true });

        if (relationError) {
            if (isMissingDocumentRelationsTable(relationError)) {
                const rowsWithoutRelations = rows.map((row) => ({
                    ...row,
                    document_versions: versionsByDocumentId.get(row.id) ?? [],
                    document_relations: [],
                }));

                if (options.validateContextRoutes) {
                    return this.resolveReviewTargets(companyId, rowsWithoutRelations);
                }

                return rowsWithoutRelations;
            }

            throw new Error(`Dokumentrelationen konnten nicht geladen werden: ${relationError.message}`);
        }

        const relationsByDocumentId = new Map<string, SupabaseDocumentRow["document_relations"]>();
        for (const relation of (relations ?? []) as unknown as NonNullable<
            SupabaseDocumentRow["document_relations"]
        >) {
            const currentRelations = relationsByDocumentId.get(relation.document_id) ?? [];
            currentRelations.push(relation);
            relationsByDocumentId.set(relation.document_id, currentRelations);
        }

        const rowsWithRelations = rows.map((row) => ({
            ...row,
            document_versions: versionsByDocumentId.get(row.id) ?? [],
            document_relations: relationsByDocumentId.get(row.id) ?? [],
        }));

        if (options.validateContextRoutes) {
            return this.resolveReviewTargets(companyId, rowsWithRelations);
        }

        return rowsWithRelations;
    }

    private async resolveReviewTargets(
        companyId: string,
        rows: SupabaseDocumentRow[],
    ): Promise<SupabaseDocumentRow[]> {
        const rowsWithInvoiceSales = await this.resolveInvoiceSaleTargets(companyId, rows);
        const saleIds = new Set<string>();

        for (const row of rowsWithInvoiceSales) {
            if (row.sale_id) {
                saleIds.add(row.sale_id);
            }

            for (const relation of row.document_relations ?? []) {
                if (relation.relation_type === "SALE") {
                    saleIds.add(relation.relation_id);
                }
            }
        }

        if (saleIds.size === 0) {
            return rowsWithInvoiceSales;
        }

        const { data, error } = await this.supabase
            .from("sales")
            .select("id")
            .eq("company_id", companyId)
            .in("id", [...saleIds]);

        if (error) {
            return rowsWithInvoiceSales.map((row) => ({
                ...row,
                sale_id: null,
                document_relations: (row.document_relations ?? []).filter(
                    (relation) => relation.relation_type !== "SALE",
                ),
            }));
        }

        const existingSaleIds = new Set((data ?? []).map((sale) => sale.id as string));

        return rowsWithInvoiceSales.map((row) => ({
            ...row,
            sale_id: row.sale_id && existingSaleIds.has(row.sale_id) ? row.sale_id : null,
            document_relations: (row.document_relations ?? []).filter(
                (relation) =>
                    relation.relation_type !== "SALE" || existingSaleIds.has(relation.relation_id),
            ),
        }));
    }

    private async resolveInvoiceSaleTargets(
        companyId: string,
        rows: SupabaseDocumentRow[],
    ): Promise<SupabaseDocumentRow[]> {
        const invoiceIds = new Set<string>();

        for (const row of rows) {
            if (row.invoice_id) {
                invoiceIds.add(row.invoice_id);
            }

            for (const relation of row.document_relations ?? []) {
                if (relation.relation_type === "INVOICE") {
                    invoiceIds.add(relation.relation_id);
                }
            }
        }

        if (invoiceIds.size === 0) {
            return rows;
        }

        const { data, error } = await this.supabase
            .from("invoices")
            .select("id, sale_id")
            .eq("company_id", companyId)
            .in("id", [...invoiceIds]);

        if (error) {
            return rows;
        }

        const saleIdByInvoiceId = new Map(
            (data ?? [])
                .filter((invoice) => Boolean(invoice.sale_id))
                .map((invoice) => [invoice.id as string, invoice.sale_id as string]),
        );

        return rows.map((row) => {
            const relationInvoiceId =
                row.document_relations?.find((relation) => relation.relation_type === "INVOICE")
                    ?.relation_id ?? null;
            const invoiceId = row.invoice_id ?? relationInvoiceId;
            const saleIdFromInvoice = invoiceId ? saleIdByInvoiceId.get(invoiceId) ?? null : null;

            return {
                ...row,
                invoice_id: invoiceId,
                sale_id: row.sale_id ?? saleIdFromInvoice,
            };
        });
    }
}
