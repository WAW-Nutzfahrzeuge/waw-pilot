import {
    mapLegacyDocumentStatus,
    type DocumentArchiveStatus,
} from "@/src/modules/documents/domain/constants/document-status";
import { getDocumentTypeDefinition } from "@/src/modules/documents/domain/constants/document-types";
import type {
    DocumentListItemDto,
    DocumentDetailDto,
} from "@/src/modules/documents/application/dto/document.dto";
import type {
    DocumentRelationEntity,
    DocumentVersionEntity,
} from "@/src/modules/documents/domain/entities/document";

type SupabaseRelation<T> = T | T[] | null;

export type SupabaseDocumentVersionRow = {
    id: string;
    company_id: string;
    document_id: string;
    version_number: number;
    original_file_name: string;
    stored_file_name: string;
    storage_bucket: string;
    storage_path: string;
    mime_type: string;
    file_size_bytes: number;
    checksum: string | null;
    uploaded_at: string;
    uploaded_by: string | null;
    is_active: boolean;
    replaced_version_id: string | null;
    replacement_reason: string | null;
    metadata: Record<string, unknown> | null;
};

export type SupabaseDocumentRelationRow = {
    id: string;
    company_id: string;
    document_id: string;
    relation_type: string;
    relation_id: string;
    created_at: string;
    created_by: string | null;
    metadata: Record<string, unknown> | null;
};

type CustomerRelation = {
    type: "company" | "private";
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
};

type VehicleRelation = {
    internal_number: string | null;
    manufacturer: string | null;
    model: string | null;
};

type InvoiceRelation = {
    invoice_number: string | null;
};

export type SupabaseDocumentRow = {
    id: string;
    document_reference: string | null;
    document_type: string;
    title: string | null;
    description: string | null;
    source: "generated" | "uploaded";
    status: string;
    archive_status: string | null;
    active_version_id: string | null;
    file_name: string;
    file_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    customer_id: string | null;
    vehicle_id: string | null;
    sale_id: string | null;
    invoice_id: string | null;
    generated_by_system: boolean;
    created_at: string;
    updated_at: string | null;
    created_by: string | null;
    updated_by: string | null;
    archived_at: string | null;
    archived_by: string | null;
    archive_reason: string | null;
    metadata: Record<string, unknown> | null;
    customers: SupabaseRelation<CustomerRelation>;
    vehicles: SupabaseRelation<VehicleRelation>;
    invoices: SupabaseRelation<InvoiceRelation>;
    document_versions: SupabaseDocumentVersionRow[] | null;
    document_relations: SupabaseDocumentRelationRow[] | null;
};

function getSingleRelation<T>(relation: SupabaseRelation<T>): T | null {
    if (!relation) return null;
    return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function getCustomerName(customer: CustomerRelation | null): string | null {
    if (!customer) return null;

    if (customer.type === "company") {
        return customer.company_name ?? "Unbekannte Firma";
    }

    const privateName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

    return privateName.length > 0 ? privateName : "Unbekannte Privatperson";
}

function getVehicleLabel(vehicle: VehicleRelation | null): string | null {
    if (!vehicle) return null;

    const vehicleName = [vehicle.manufacturer, vehicle.model].filter(Boolean).join(" ");

    if (vehicle.internal_number && vehicleName) {
        return `${vehicle.internal_number} · ${vehicleName}`;
    }

    return vehicle.internal_number ?? (vehicleName || null);
}

function mapVersion(row: SupabaseDocumentVersionRow): DocumentVersionEntity {
    return {
        id: row.id,
        companyId: row.company_id,
        documentId: row.document_id,
        versionNumber: row.version_number,
        originalFileName: row.original_file_name,
        storedFileName: row.stored_file_name,
        storageBucket: row.storage_bucket,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        fileSizeBytes: row.file_size_bytes,
        checksum: row.checksum,
        uploadedAt: row.uploaded_at,
        uploadedBy: row.uploaded_by,
        isActive: row.is_active,
        replacedVersionId: row.replaced_version_id,
        replacementReason: row.replacement_reason,
        metadata: row.metadata,
    };
}

function mapRelation(row: SupabaseDocumentRelationRow): DocumentRelationEntity {
    return {
        id: row.id,
        companyId: row.company_id,
        documentId: row.document_id,
        relationType: row.relation_type as DocumentRelationEntity["relationType"],
        relationId: row.relation_id,
        createdAt: row.created_at,
        createdBy: row.created_by,
        metadata: row.metadata,
    };
}

function getActiveVersion(row: SupabaseDocumentRow): SupabaseDocumentVersionRow | null {
    return (
        row.document_versions?.find((version) => version.is_active) ??
        row.document_versions?.find((version) => version.id === row.active_version_id) ??
        row.document_versions?.[0] ??
        null
    );
}

function getRelationId(row: SupabaseDocumentRow, relationType: string): string | null {
    return (
        row.document_relations?.find((relation) => relation.relation_type === relationType)
            ?.relation_id ?? null
    );
}

function getDocumentContextHref(params: {
    saleId: string | null;
    invoiceId: string | null;
    vehicleId: string | null;
    customerId: string | null;
    purchaseId: string | null;
    licensePlateCaseId: string | null;
}): string | null {
    if (params.saleId) {
        return params.invoiceId
            ? `/dashboard/sales/${params.saleId}#invoice-payments`
            : `/dashboard/sales/${params.saleId}#documents`;
    }

    if (params.purchaseId) {
        return `/dashboard/ankauf/${params.purchaseId}#documents`;
    }

    if (params.licensePlateCaseId) {
        return `/dashboard/plates/${params.licensePlateCaseId}#license-plate-documents`;
    }

    if (params.vehicleId) {
        return `/dashboard/vehicles/${params.vehicleId}#documents`;
    }

    if (params.customerId) {
        return `/dashboard/customers/${params.customerId}#documents`;
    }

    return null;
}

export function mapSupabaseDocumentRowToListItem(
    row: SupabaseDocumentRow,
): DocumentListItemDto {
    const customer = getSingleRelation(row.customers);
    const vehicle = getSingleRelation(row.vehicles);
    const invoice = getSingleRelation(row.invoices);
    const activeVersion = getActiveVersion(row);
    const definition = getDocumentTypeDefinition(row.document_type);
    const title = row.title?.trim() || definition.label;
    const archiveStatus = (row.archive_status ?? "ACTIVE") as DocumentArchiveStatus;
    const saleId = row.sale_id ?? getRelationId(row, "SALE");
    const vehicleId = row.vehicle_id ?? getRelationId(row, "VEHICLE");
    const customerId = row.customer_id ?? getRelationId(row, "CUSTOMER") ?? getRelationId(row, "PARTNER");
    const invoiceId = row.invoice_id ?? getRelationId(row, "INVOICE");
    const purchaseId = getRelationId(row, "PURCHASE");
    const licensePlateCaseId = getRelationId(row, "LICENSE_PLATE_CASE");

    return {
        id: row.id,
        documentReference: row.document_reference ?? "DOC-OHNE-REFERENZ",
        documentType: row.document_type,
        documentTypeLabel: definition.label,
        title,
        status: mapLegacyDocumentStatus(row.status),
        archiveStatus,
        source: row.source,
        fileName: activeVersion?.original_file_name ?? row.file_name,
        mimeType: activeVersion?.mime_type ?? row.mime_type,
        fileSizeBytes: activeVersion?.file_size_bytes ?? row.file_size,
        activeVersionNumber: activeVersion?.version_number ?? null,
        createdAt: row.created_at,
        createdBy: row.created_by,
        relationLabels: [
            getCustomerName(customer),
            getVehicleLabel(vehicle),
            invoice?.invoice_number ? `Rechnung ${invoice.invoice_number}` : null,
        ].filter((label): label is string => Boolean(label)),
        customerName: getCustomerName(customer),
        customerId,
        vehicleLabel: getVehicleLabel(vehicle),
        invoiceNumber: invoice?.invoice_number ?? null,
        invoiceId,
        saleId,
        vehicleId,
        purchaseId,
        licensePlateCaseId,
        reviewHref: getDocumentContextHref({
            saleId,
            invoiceId,
            vehicleId,
            customerId,
            purchaseId,
            licensePlateCaseId,
        }),
        hasActiveFile: Boolean(activeVersion?.storage_path ?? row.file_path),
    };
}

export function mapSupabaseDocumentRowToDetail(row: SupabaseDocumentRow): DocumentDetailDto {
    return {
        ...mapSupabaseDocumentRowToListItem(row),
        description: row.description,
        versions: (row.document_versions ?? []).map(mapVersion),
        relations: (row.document_relations ?? []).map(mapRelation),
        updatedAt: row.updated_at ?? row.created_at,
        archivedAt: row.archived_at,
        archiveReason: row.archive_reason,
    };
}
