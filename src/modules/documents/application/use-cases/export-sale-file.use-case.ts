import type { SupabaseClient } from "@supabase/supabase-js";

import {
    DocumentExportCategoryPolicy,
} from "@/src/modules/documents/domain/policies/document-export-category-policy";
import {
    createUniqueFileName,
    ExportFileNamePolicy,
} from "@/src/modules/documents/domain/policies/export-file-name-policy";
import { SupabaseDocumentStorage } from "@/src/modules/documents/infrastructure/storage/supabase-document-storage";
import {
    ZipArchiveService,
    type ZipArchiveEntry,
} from "@/src/modules/documents/infrastructure/archive/zip-archive.service";

type SaleExportInvoiceRow = {
    id: string;
    invoice_type: string | null;
    invoice_number: string | null;
    pdf_document_id: string | null;
};

type SaleExportRow = {
    id: string;
    company_id: string;
    sale_number: string | null;
    vehicle_id: string;
    buyer_customer_id: string;
    sale_date: string;
    vehicles: {
        internal_number: string | null;
        manufacturer: string | null;
        model: string | null;
        license_plate: string | null;
    } | null;
    invoices: SaleExportInvoiceRow[] | SaleExportInvoiceRow | null;
};

type SaleExportDocumentRow = {
    id: string;
    company_id: string;
    document_type: string;
    source: string | null;
    status: string | null;
    file_name: string | null;
    file_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    sale_id: string | null;
    vehicle_id: string | null;
    customer_id: string | null;
    invoice_id: string | null;
    created_at: string | null;
};

type SaleExportDocumentVersionRow = {
    id: string;
    document_id: string;
    storage_bucket: string;
    storage_path: string;
    original_file_name: string;
    mime_type: string | null;
    file_size_bytes: number | null;
    uploaded_at: string | null;
    is_active: boolean | null;
    version_number: number | null;
};

type SaleExportFile = {
    document: SaleExportDocumentRow;
    storageBucket: string;
    storagePath: string;
    fileName: string;
    mimeType: string | null;
    createdAt: string | null;
    isCritical: boolean;
};

export type ExportSaleFileResult = {
    fileName: string;
    contentType: "application/zip";
    archive: Buffer;
    skippedFiles: string[];
};

export class SaleFileExportError extends Error {
    constructor(
        message: string,
        readonly statusCode: number = 400,
    ) {
        super(message);
        this.name = "SaleFileExportError";
    }
}

function asArray<T>(value: T[] | T | null): T[] {
    if (!value) return [];

    return Array.isArray(value) ? value : [value];
}

function getVehicleLabel(sale: SaleExportRow): string | null {
    const parts = [
        sale.vehicles?.manufacturer,
        sale.vehicles?.model,
        sale.vehicles?.license_plate,
    ].filter((part): part is string => Boolean(part?.trim()));

    return parts.length > 0 ? parts.join("_") : sale.vehicles?.internal_number ?? null;
}

function getSaleReference(sale: SaleExportRow, invoices: SaleExportInvoiceRow[]): string {
    const standardInvoice = invoices.find(
        (invoice) => invoice.invoice_type === "standard" && invoice.invoice_number,
    );
    const firstInvoiceWithNumber = invoices.find((invoice) => invoice.invoice_number);

    return (
        sale.sale_number ??
        standardInvoice?.invoice_number ??
        firstInvoiceWithNumber?.invoice_number ??
        sale.vehicles?.internal_number ??
        sale.id
    );
}

function isActiveExportableDocument(document: SaleExportDocumentRow): boolean {
    const status = document.status?.toLowerCase();

    return (
        document.company_id.length > 0 &&
        status !== "missing" &&
        status !== "archived" &&
        status !== "deleted" &&
        status !== "voided"
    );
}

function isCriticalDocument(document: SaleExportDocumentRow): boolean {
    return (
        document.source === "generated" &&
        [
            "invoice_pdf",
            "proforma_invoice",
            "down_payment_invoice",
            "cancellation_invoice",
            "credit_note",
        ].includes(document.document_type)
    );
}

function dedupeDocuments(documents: SaleExportDocumentRow[]): SaleExportDocumentRow[] {
    const byId = new Map<string, SaleExportDocumentRow>();

    for (const document of documents) {
        if (!isActiveExportableDocument(document)) continue;
        byId.set(document.id, document);
    }

    return [...byId.values()].sort((left, right) =>
        (left.created_at ?? "").localeCompare(right.created_at ?? ""),
    );
}

function createHintsFile(skippedFiles: string[]): Uint8Array {
    const content = [
        "Hinweise zum Export der Verkaufsakte",
        "",
        ...skippedFiles.map((message) => `- ${message}`),
        "",
    ].join("\n");

    return new TextEncoder().encode(content);
}

export class ExportSaleFileUseCase {
    private readonly categoryPolicy = new DocumentExportCategoryPolicy();
    private readonly fileNamePolicy = new ExportFileNamePolicy();
    private readonly zipArchiveService = new ZipArchiveService();
    private readonly storage: SupabaseDocumentStorage;

    constructor(private readonly supabase: SupabaseClient) {
        this.storage = new SupabaseDocumentStorage(supabase);
    }

    async execute(params: {
        companyId: string;
        saleId: string;
    }): Promise<ExportSaleFileResult> {
        const sale = await this.loadSale(params);
        const invoices = asArray(sale.invoices);
        const saleReference = getSaleReference(sale, invoices);
        const vehicleLabel = getVehicleLabel(sale);
        const archiveFolderName = this.fileNamePolicy.createArchiveFolderName({
            saleReference,
        });
        const zipFileName = this.fileNamePolicy.createZipFileName({
            saleReference,
        });
        const documents = await this.loadDocuments({
            companyId: params.companyId,
            sale,
            invoices,
        });
        const files = await this.resolveFiles(params.companyId, documents);

        if (files.length === 0) {
            throw new SaleFileExportError(
                "Für diese Verkaufsakte sind keine exportierbaren Dokumente vorhanden.",
                404,
            );
        }

        const archiveEntries: ZipArchiveEntry[] = [];
        const skippedFiles: string[] = [];
        const usedArchivePaths = new Set<string>();

        for (const file of files) {
            const category = this.categoryPolicy.getCategory(file.document.document_type);
            const requestedName = this.fileNamePolicy.createDocumentFileName({
                saleReference,
                vehicleLabel,
                documentType: file.document.document_type,
                originalFileName: file.fileName,
                mimeType: file.mimeType,
                createdAt: file.createdAt,
            });
            const archivePath = createUniqueFileName(
                `${archiveFolderName}/${category.folderName}/${requestedName}`,
                usedArchivePaths,
            );
            const data = await this.storage.download({
                bucket: file.storageBucket,
                path: file.storagePath,
            });

            if (!data) {
                const message = `${requestedName} konnte nicht geladen werden.`;

                if (file.isCritical) {
                    throw new SaleFileExportError(message, 502);
                }

                skippedFiles.push(message);
                continue;
            }

            archiveEntries.push({
                path: archivePath,
                data,
                modifiedAt: file.createdAt ? new Date(file.createdAt) : undefined,
            });
        }

        if (archiveEntries.length === 0) {
            throw new SaleFileExportError(
                "Für diese Verkaufsakte konnte keine Datei geladen werden.",
                502,
            );
        }

        if (skippedFiles.length > 0) {
            archiveEntries.push({
                path: `${archiveFolderName}/Hinweise.txt`,
                data: createHintsFile(skippedFiles),
            });
        }

        archiveEntries.sort((left, right) => left.path.localeCompare(right.path));

        return {
            fileName: zipFileName,
            contentType: "application/zip",
            archive: this.zipArchiveService.createArchive(archiveEntries),
            skippedFiles,
        };
    }

    private async loadSale(params: {
        companyId: string;
        saleId: string;
    }): Promise<SaleExportRow> {
        const { data, error } = await this.supabase
            .from("sales")
            .select(
                `
                id,
                company_id,
                sale_number,
                vehicle_id,
                buyer_customer_id,
                sale_date,
                vehicles (
                    internal_number,
                    manufacturer,
                    model,
                    license_plate
                ),
                invoices (
                    id,
                    invoice_type,
                    invoice_number,
                    pdf_document_id
                )
            `,
            )
            .eq("company_id", params.companyId)
            .eq("id", params.saleId)
            .single();

        if (error || !data) {
            throw new SaleFileExportError("Verkaufsakte wurde nicht gefunden.", 404);
        }

        return data as unknown as SaleExportRow;
    }

    private async loadDocuments(params: {
        companyId: string;
        sale: SaleExportRow;
        invoices: SaleExportInvoiceRow[];
    }): Promise<SaleExportDocumentRow[]> {
        const invoiceIds = params.invoices.map((invoice) => invoice.id);
        const invoiceDocumentIds = params.invoices
            .map((invoice) => invoice.pdf_document_id)
            .filter((id): id is string => Boolean(id));
        const relationDocumentIds = await this.loadRelationDocumentIds({
            companyId: params.companyId,
            saleId: params.sale.id,
            vehicleId: params.sale.vehicle_id,
            invoiceIds,
        });
        const filters = [
            `sale_id.eq.${params.sale.id}`,
            `vehicle_id.eq.${params.sale.vehicle_id}`,
            invoiceIds.length > 0 ? `invoice_id.in.(${invoiceIds.join(",")})` : null,
            invoiceDocumentIds.length > 0
                ? `id.in.(${invoiceDocumentIds.join(",")})`
                : null,
            relationDocumentIds.length > 0
                ? `id.in.(${relationDocumentIds.join(",")})`
                : null,
        ].filter((filter): filter is string => Boolean(filter));

        if (filters.length === 0) return [];

        const { data, error } = await this.supabase
            .from("documents")
            .select(
                `
                id,
                company_id,
                document_type,
                source,
                status,
                file_name,
                file_path,
                mime_type,
                file_size,
                sale_id,
                vehicle_id,
                customer_id,
                invoice_id,
                created_at
            `,
            )
            .eq("company_id", params.companyId)
            .or(filters.join(","));

        if (error) {
            throw new SaleFileExportError(
                `Dokumente der Verkaufsakte konnten nicht geladen werden: ${error.message}`,
                500,
            );
        }

        return dedupeDocuments((data ?? []) as unknown as SaleExportDocumentRow[]);
    }

    private async loadRelationDocumentIds(params: {
        companyId: string;
        saleId: string;
        vehicleId: string;
        invoiceIds: string[];
    }): Promise<string[]> {
        const filters = [
            `and(relation_type.eq.SALE,relation_id.eq.${params.saleId})`,
            `and(relation_type.eq.VEHICLE,relation_id.eq.${params.vehicleId})`,
            params.invoiceIds.length > 0
                ? `and(relation_type.eq.INVOICE,relation_id.in.(${params.invoiceIds.join(",")}))`
                : null,
        ].filter((filter): filter is string => Boolean(filter));

        if (filters.length === 0) return [];

        const { data, error } = await this.supabase
            .from("document_relations")
            .select("document_id")
            .eq("company_id", params.companyId)
            .or(filters.join(","));

        if (error) {
            if (error.code === "42P01" || error.message.includes("document_relations")) {
                return [];
            }

            throw new SaleFileExportError(
                `Dokumentrelationen konnten nicht geladen werden: ${error.message}`,
                500,
            );
        }

        return [
            ...new Set(
                ((data ?? []) as Array<{ document_id: string | null }>)
                    .map((row) => row.document_id)
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
    }

    private async resolveFiles(
        companyId: string,
        documents: SaleExportDocumentRow[],
    ): Promise<SaleExportFile[]> {
        const documentIds = documents.map((document) => document.id);
        const versionsByDocumentId = await this.loadActiveVersions(companyId, documentIds);

        return documents
            .map((document) => {
                const version = versionsByDocumentId.get(document.id);
                const storagePath = version?.storage_path ?? document.file_path;

                if (!storagePath) return null;

                return {
                    document,
                    storageBucket: version?.storage_bucket ?? "documents",
                    storagePath,
                    fileName: version?.original_file_name ?? document.file_name ?? "Dokument",
                    mimeType: version?.mime_type ?? document.mime_type,
                    createdAt: version?.uploaded_at ?? document.created_at,
                    isCritical: isCriticalDocument(document),
                };
            })
            .filter((file): file is SaleExportFile => file !== null);
    }

    private async loadActiveVersions(
        companyId: string,
        documentIds: string[],
    ): Promise<Map<string, SaleExportDocumentVersionRow>> {
        const versionsByDocumentId = new Map<string, SaleExportDocumentVersionRow>();

        if (documentIds.length === 0) return versionsByDocumentId;

        const { data, error } = await this.supabase
            .from("document_versions")
            .select(
                `
                id,
                document_id,
                storage_bucket,
                storage_path,
                original_file_name,
                mime_type,
                file_size_bytes,
                uploaded_at,
                is_active,
                version_number
            `,
            )
            .eq("company_id", companyId)
            .in("document_id", documentIds)
            .eq("is_active", true);

        if (error) {
            if (error.code === "42P01" || error.message.includes("document_versions")) {
                return versionsByDocumentId;
            }

            throw new SaleFileExportError(
                `Dokumentversionen konnten nicht geladen werden: ${error.message}`,
                500,
            );
        }

        for (const version of (data ?? []) as unknown as SaleExportDocumentVersionRow[]) {
            versionsByDocumentId.set(version.document_id, version);
        }

        return versionsByDocumentId;
    }
}
