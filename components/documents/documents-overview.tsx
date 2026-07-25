"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import {
    Archive,
    Download,
    ExternalLink,
    FileArchive,
    FileText,
    FileWarning,
    Search,
} from "lucide-react";

import type { DocumentRow } from "@/lib/documents/document-queries";
import {
    formatFileSize,
    getDocumentSourceLabel,
    getDocumentStatusLabel,
    getDocumentStatusTone,
    getDocumentTypeLabel,
} from "@/lib/documents/document-helpers";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusFilter } from "@/components/filters/status-filter";

type DocumentsOverviewProps = {
    documents: DocumentRow[];
    initialFilter?: string | null;
    initialVehicleId?: string | null;
};

type DocumentFilter =
    | "all"
    | "invoices"
    | "vehicle_documents"
    | "purchase_documents"
    | "license_plates"
    | "cashbook"
    | "needs_review";

function getInitialDocumentFilter(filter: string | null | undefined): DocumentFilter {
    if (filter === "open" || filter === "needs_review" || filter === "review") {
        return "needs_review";
    }

    if (
        filter === "invoices" ||
        filter === "vehicle_documents" ||
        filter === "purchase_documents" ||
        filter === "license_plates" ||
        filter === "cashbook"
    ) {
        return filter;
    }

    return "all";
}

const invoiceDocumentTypes = [
    "invoice",
    "invoice_pdf",
    "proforma_invoice",
    "down_payment_invoice",
];

const purchaseDocumentTypes = [
    "purchase_invoice",
    "purchase_contract",
    "purchase_receipt",
    "purchase_payment_proof",
    "seller_id",
    "seller_commercial_register",
];

const licensePlateDocumentTypes = [
    "license_plate_document",
    "license_plate_insurance",
    "license_plate_power_of_attorney",
    "license_plate_registration",
];

const vehicleDocumentTypes = [
    "vehicle_registration",
    "contract",
    "handover_protocol",
    "entry_certificate",
    "transport_proof",
    "abd_checklist",
    "exit_note_checklist",
    "customs",
    "commercial_register",
    "business_registration",
    "owner_id",
    "customer_id",
    "tax_number_document",
    "export_documents",
    "registration_documents",
    "insurance_document",
    "tax_document",
];

type DocumentGroupKey =
    | "invoice"
    | "vehicle"
    | "purchase"
    | "license_plate"
    | "cashbook"
    | "review"
    | "other";

const documentGroupOrder: DocumentGroupKey[] = [
    "invoice",
    "vehicle",
    "purchase",
    "license_plate",
    "cashbook",
    "other",
];

const documentGroupLabels: Record<DocumentGroupKey, string> = {
    invoice: "Rechnungen",
    vehicle: "Pflicht- und Fahrzeugdokumente",
    purchase: "Ankaufsdokumente",
    license_plate: "Kennzeichen",
    cashbook: "Kassenbuch",
    review: "Zu prüfen",
    other: "Sonstige Dokumente",
};

const invoiceTitlePrefixes: Record<string, string> = {
    invoice: "Rechnung",
    invoice_pdf: "Rechnung",
    proforma_invoice: "Proformarechnung",
    down_payment_invoice: "Anzahlungsrechnung",
};

function getFileNameWithoutExtension(fileName: string): string {
    return fileName.replace(/\.[a-z0-9]+$/i, "");
}

function extractReferenceNumber(fileName: string): string | null {
    const withoutExtension = getFileNameWithoutExtension(fileName);
    const match = withoutExtension.match(/(?:AZ-)?\d{2,4}-\d{3,}/i);

    return match?.[0]?.toUpperCase() ?? null;
}

function cleanTechnicalFileName(fileName: string): string {
    return getFileNameWithoutExtension(fileName)
        .replace(/^scan-\d{4}-\d{2}-\d{2}[-_\d]*$/i, "Scan")
        .replace(/scan-\d{4}-\d{2}-\d{2}[-_\d]*/gi, "")
        .replace(/\b[a-f0-9]{8,}\b/gi, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\buebergabeprotokoll\b/gi, "Übergabeprotokoll")
        .replace(/\bgelangensbestaetigung\b/gi, "Gelangensbestätigung")
        .replace(/\bverbringungsnachweis\b/gi, "Verbringungsnachweis")
        .replace(/\brechnung\b/gi, "Rechnung")
        .replace(/\banzahlungsrechnung\b/gi, "Anzahlungsrechnung")
        .replace(/\bproforma\b/gi, "Proforma")
        .replace(/\bpdf\b/gi, "")
        .trim();
}

function getDocumentDisplayName(document: DocumentRow): string {
    const invoicePrefix = invoiceTitlePrefixes[document.document_type];

    if (invoicePrefix) {
        const number = document.invoice_number ?? extractReferenceNumber(document.file_name);

        return number ? `${invoicePrefix} ${number}` : invoicePrefix;
    }

    if (
        document.document_type === "handover_protocol" &&
        /unterschrieben|signed/i.test(document.file_name)
    ) {
        return "Übergabeprotokoll unterschrieben";
    }

    const typeLabel = getDocumentTypeLabel(document.document_type);

    if (typeLabel !== getDocumentTypeLabel("other")) {
        return typeLabel;
    }

    return cleanTechnicalFileName(document.file_name) || "Dokument";
}

function getMimeTypeLabel(mimeType: string | null): string {
    if (!mimeType) return "Dateityp unbekannt";

    if (mimeType === "application/pdf") return "PDF";
    if (mimeType === "image/jpeg") return "JPEG";
    if (mimeType === "image/png") return "PNG";

    return mimeType.split("/").at(1)?.toUpperCase() ?? mimeType;
}

function getDocumentSourceDisplay(document: DocumentRow): string {
    if (/scan/i.test(document.file_name)) return "Scan";
    if (document.generated_by_system || document.source === "generated") {
        return "Automatisch erzeugt";
    }

    return getDocumentSourceLabel(document.source);
}

function getDocumentReferenceLabel(document: DocumentRow): string | null {
    if (document.invoice_number) {
        return `Rechnung ${document.invoice_number}`;
    }

    const referenceNumber = extractReferenceNumber(document.file_name);

    if (document.sale_id && referenceNumber) {
        return `Verkauf ${referenceNumber}`;
    }

    if (document.vehicle_internal_number) {
        return document.vehicle_name
            ? `${document.vehicle_internal_number} · ${document.vehicle_name}`
            : document.vehicle_internal_number;
    }

    if (document.customer_name) return document.customer_name;

    return null;
}

function getDocumentMetaText(document: DocumentRow): string {
    const dateLabel =
        document.generated_by_system || document.source === "generated"
            ? "Erzeugt am"
            : "Hochgeladen am";

    return [
        getDocumentSourceDisplay(document),
        getMimeTypeLabel(document.mime_type),
        formatFileSize(document.file_size),
        getDocumentReferenceLabel(document),
        `${dateLabel} ${formatDate(document.created_at)}`,
    ]
        .filter((part) => part && part !== "—")
        .join(" · ");
}

export function DocumentsOverview({
                                      documents,
                                      initialFilter = null,
                                      initialVehicleId = null,
                                  }: DocumentsOverviewProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState("");
    const [documentFilter, setDocumentFilter] =
        useState<DocumentFilter>(() => getInitialDocumentFilter(initialFilter));

    const availableDocuments = documents.filter(
        (document) => document.status === "available",
    ).length;

    const needsReviewDocuments = documents.filter(
        (document) => document.status === "needs_review",
    ).length;

    const generatedDocuments = documents.filter(
        (document) => document.generated_by_system,
    ).length;

    const uploadedDocuments = documents.filter(
        (document) => !document.generated_by_system,
    ).length;

    const invoiceDocuments = documents.filter((document) =>
        invoiceDocumentTypes.includes(document.document_type),
    ).length;

    const vehicleDocuments = documents.filter((document) =>
        vehicleDocumentTypes.includes(document.document_type),
    ).length;

    const purchaseDocuments = documents.filter((document) =>
        purchaseDocumentTypes.includes(document.document_type),
    ).length;

    const licensePlateDocuments = documents.filter((document) =>
        licensePlateDocumentTypes.includes(document.document_type),
    ).length;

    const cashbookDocuments = documents.filter(
        (document) => document.document_type === "cashbook_receipt",
    ).length;

    const filteredDocuments = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return documents.filter((document) => {
            const matchesVehicle =
                !initialVehicleId || document.vehicle_id === initialVehicleId;

            if (!matchesVehicle) return false;

            const matchesFilter =
                documentFilter === "all" ||
                (documentFilter === "invoices" &&
                    invoiceDocumentTypes.includes(document.document_type)) ||
                (documentFilter === "vehicle_documents" &&
                    vehicleDocumentTypes.includes(document.document_type)) ||
                (documentFilter === "purchase_documents" &&
                    purchaseDocumentTypes.includes(document.document_type)) ||
                (documentFilter === "license_plates" &&
                    licensePlateDocumentTypes.includes(document.document_type)) ||
                (documentFilter === "cashbook" &&
                    document.document_type === "cashbook_receipt") ||
                (documentFilter === "needs_review" &&
                    document.status === "needs_review");

            if (!matchesFilter) return false;

            if (!normalizedQuery) return true;

            const searchableText = [
                getDocumentDisplayName(document),
                getDocumentMetaText(document),
                document.file_name,
                document.document_type,
                getDocumentTypeLabel(document.document_type),
                getDocumentSourceLabel(document.source),
                getDocumentStatusLabel(document.status),
                document.customer_name,
                document.vehicle_internal_number,
                document.vehicle_name,
                document.invoice_number,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(normalizedQuery);
        }).sort((a, b) => {
            const groupDifference =
                documentGroupOrder.indexOf(getDocumentGroup(a.document_type)) -
                documentGroupOrder.indexOf(getDocumentGroup(b.document_type));

            if (groupDifference !== 0) return groupDifference;

            return (
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
        });
    }, [query, documents, documentFilter, initialVehicleId]);

    const groupedDocuments = useMemo(() => {
        return documentGroupOrder
            .map((group) => ({
                group,
                label: documentGroupLabels[group],
                documents: filteredDocuments.filter(
                    (document) => getDocumentGroup(document.document_type) === group,
                ),
            }))
            .filter((group) => group.documents.length > 0);
    }, [filteredDocuments]);

    function updateDocumentFilter(nextFilter: DocumentFilter) {
        setDocumentFilter(nextFilter);

        const params = new URLSearchParams(searchParams.toString());
        if (nextFilter === "all") {
            params.delete("filter");
            params.delete("status");
        } else {
            params.set("filter", nextFilter);
            params.delete("status");
        }

        const nextQuery = params.toString();
        router.push(nextQuery ? `/dashboard/documents?${nextQuery}` : "/dashboard/documents");
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Dokumentenarchiv"
                title="Dokumente"
                description="Alle Rechnungen, Verkaufsunterlagen, Fahrzeugdokumente und Kassenbuch-Belege zentral prüfen, öffnen und herunterladen."
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DocumentStatCard
                    label="Dokumente gesamt"
                    value={documents.length}
                    description="Archivierte Dateien"
                    icon={FileArchive}
                />
                <DocumentStatCard
                    label="Verfügbar"
                    value={availableDocuments}
                    description="direkt abrufbar"
                    icon={FileText}
                />
                <DocumentStatCard
                    label="Zu prüfen"
                    value={needsReviewDocuments}
                    description="Dokumente mit Prüfbedarf"
                    icon={FileWarning}
                    danger={needsReviewDocuments > 0}
                    href="/dashboard/documents?filter=needs_review"
                    active={documentFilter === "needs_review"}
                />
                <DocumentStatCard
                    label="Automatisch"
                    value={generatedDocuments}
                    description={`${uploadedDocuments} hochgeladen`}
                    icon={Archive}
                />
            </section>

            <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Dokumentenliste
                                </h2>
                                <p className="mt-1 text-sm font-medium text-slate-500">
                                    Suche nach Datei, Dokumenttyp, Kunde, Fahrzeug oder Rechnung.
                                </p>
                            </div>

                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Dokument suchen..."
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-10 font-medium"
                                />
                            </div>
                        </div>

                        <div className="mt-5 overflow-x-auto">
                            <StatusFilter
                                activeValue={documentFilter}
                                onChange={(value) => updateDocumentFilter(value as DocumentFilter)}
                                options={[
                                    { value: "all", label: `Alle ${documents.length}` },
                                    { value: "invoices", label: `Rechnungen ${invoiceDocuments}` },
                                    { value: "vehicle_documents", label: `Fahrzeuge ${vehicleDocuments}` },
                                    { value: "purchase_documents", label: `Ankauf ${purchaseDocuments}` },
                                    { value: "license_plates", label: `Kennzeichen ${licensePlateDocuments}` },
                                    { value: "cashbook", label: `Kassenbuch ${cashbookDocuments}` },
                                    { value: "needs_review", label: `Prüfen ${needsReviewDocuments}` },
                                ]}
                            />
                        </div>

                    </div>

                    <div>
                        <div className="grid gap-4 p-4 md:hidden">
                            {groupedDocuments.map((group) => (
                                <div key={group.group} className="space-y-3">
                                    <p className="px-1 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                                        {group.label}
                                    </p>

                                    {group.documents.map((document) => (
                                        <DocumentMobileCard
                                            key={document.id}
                                            document={document}
                                            reviewMode={documentFilter === "needs_review"}
                                        />
                                    ))}
                                </div>
                            ))}

                            {filteredDocuments.length === 0 ? <EmptyDocumentsState /> : null}
                        </div>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1120px] text-left">
                                <thead className="bg-slate-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-5 py-4">Dokument</th>
                                    <th className="px-5 py-4">Typ</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4">Quelle</th>
                                    <th className="px-5 py-4">Bezug</th>
                                    <th className="px-5 py-4">Datum</th>
                                    <th className="px-5 py-4 text-right">Aktionen</th>
                                </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                {groupedDocuments.map((group) => (
                                    <Fragment key={group.group}>
                                        <tr className="bg-slate-50/80">
                                            <td
                                                colSpan={7}
                                                className="px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-slate-500"
                                            >
                                                {group.label}
                                            </td>
                                        </tr>

                                        {group.documents.map((document) => (
                                            <tr
                                                key={document.id}
                                                className="group bg-white transition-colors hover:bg-cyan-50/30"
                                            >
                                                <td className="px-5 py-5">
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                                            <FileText className="size-5" />
                                                        </div>

                                                        <div className="min-w-0">
                                                            <DocumentPrimaryLink
                                                                document={document}
                                                                reviewMode={documentFilter === "needs_review"}
                                                                className="block max-w-sm font-extrabold leading-6 text-slate-950 hover:text-cyan-700 hover:underline"
                                                            >
                                                                {getDocumentDisplayName(document)}
                                                            </DocumentPrimaryLink>
                                                            <p className="mt-1 max-w-md text-xs font-semibold leading-5 text-slate-500">
                                                                {getDocumentMetaText(document)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-5 py-5">
                                                    <DocumentTypePill document={document} />
                                                </td>

                                                <td className="px-5 py-5">
                                                    <StatusBadge tone={getDocumentStatusTone(document.status)}>
                                                        {getDocumentStatusLabel(document.status)}
                                                    </StatusBadge>
                                                </td>

                                                <td className="px-5 py-5">
                                                    <StatusBadge tone="neutral">
                                                        {getDocumentSourceDisplay(document)}
                                                    </StatusBadge>
                                                </td>

                                                <td className="px-5 py-5">
                                                    <div className="space-y-1">
                                                        {getDocumentReferenceLabel(document) ? (
                                                            <p className="text-sm font-extrabold text-cyan-700">
                                                                {getDocumentReferenceLabel(document)}
                                                            </p>
                                                        ) : null}

                                                        {document.customer_name ? (
                                                            <p className="text-sm font-bold text-slate-950">
                                                                {document.customer_name}
                                                            </p>
                                                        ) : null}

                                                        {!getDocumentReferenceLabel(document) &&
                                                        !document.customer_name ? (
                                                            <p className="text-sm font-semibold text-slate-400">
                                                                —
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </td>

                                                <td className="px-5 py-5">
                                                    <p className="text-sm font-semibold text-slate-700">
                                                        {formatDate(document.created_at)}
                                                    </p>
                                                </td>

                                                <td className="px-5 py-5">
                                                    <div className="flex justify-end gap-2">
                                                        <DocumentOpenButton document={document} />
                                                        <DocumentDownloadButton document={document} />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))}
                                </tbody>
                            </table>

                            {filteredDocuments.length === 0 ? <EmptyDocumentsState /> : null}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function DocumentTypePill({ document }: { document: DocumentRow }) {
    const group = getDocumentGroup(document.document_type);

    const classes = {
        invoice: "border-cyan-100 bg-cyan-50 text-cyan-700",
        vehicle: "border-violet-100 bg-violet-50 text-violet-700",
        purchase: "border-orange-100 bg-orange-50 text-orange-700",
        license_plate: "border-blue-100 bg-blue-50 text-blue-700",
        cashbook: "border-emerald-100 bg-emerald-50 text-emerald-700",
        review: "border-amber-100 bg-amber-50 text-amber-700",
        other: "border-slate-200 bg-slate-50 text-slate-700",
    };

    return (
        <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${classes[group]}`}
        >
            {getDocumentTypeLabel(document.document_type)}
        </span>
    );
}

function getDocumentGroup(
    documentType: string,
): DocumentGroupKey {
    if (invoiceDocumentTypes.includes(documentType)) return "invoice";
    if (vehicleDocumentTypes.includes(documentType)) return "vehicle";
    if (purchaseDocumentTypes.includes(documentType)) return "purchase";
    if (licensePlateDocumentTypes.includes(documentType)) return "license_plate";
    if (documentType === "cashbook_receipt") return "cashbook";

    return "other";
}

function getReviewDocumentHref(document: DocumentRow): string | null {
    return document.review_href;
}

function DocumentPrimaryLink({
    document,
    reviewMode,
    className,
    children,
}: {
    document: DocumentRow;
    reviewMode: boolean;
    className?: string;
    children: ReactNode;
}) {
    const reviewHref = reviewMode ? getReviewDocumentHref(document) : null;
    const detailHref = `/dashboard/documents/${document.id}`;
    const href = reviewHref ?? detailHref;

    return <Link href={href} className={className}>{children}</Link>;
}

function DocumentMobileCard({
    document,
    reviewMode,
}: {
    document: DocumentRow;
    reviewMode: boolean;
}) {
    const reviewHref = reviewMode ? getReviewDocumentHref(document) : null;
    const content = (
        <>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <DocumentTypePill document={document} />

                    <p className="mt-2 line-clamp-2 text-base font-extrabold leading-6 text-slate-950">
                        {getDocumentDisplayName(document)}
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                        {getDocumentMetaText(document)}
                    </p>
                </div>

                <StatusBadge tone={getDocumentStatusTone(document.status)}>
                    {getDocumentStatusLabel(document.status)}
                </StatusBadge>
            </div>

            {getDocumentReferenceLabel(document) ? (
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Bezug
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-cyan-700">
                        {getDocumentReferenceLabel(document)}
                    </p>
                </div>
            ) : null}

            {reviewHref ? null : (
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <DocumentOpenButton document={document} fullWidth />
                    <DocumentDownloadButton document={document} fullWidth />
                </div>
            )}
        </>
    );

    const className = "rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.99]";

    if (reviewHref) {
        return (
            <Link href={reviewHref} className={`${className} block hover:border-cyan-200 hover:bg-cyan-50/40 hover:shadow-md`}>
                {content}
            </Link>
        );
    }

    return <div className={className}>{content}</div>;
}

type DocumentActionProps = {
    document: DocumentRow;
    fullWidth?: boolean;
};

function DocumentOpenButton({ document, fullWidth = false }: DocumentActionProps) {
    const hasFile = Boolean(document.file_path);

    return (
        <Button
            asChild={hasFile}
            disabled={!hasFile}
            variant="outline"
            size="sm"
            className={
                fullWidth
                    ? "h-11 w-full rounded-2xl font-bold"
                    : "rounded-xl font-bold"
            }
        >
            {hasFile ? (
                <Link href={`/api/documents/${document.id}/file`} target="_blank">
                    <ExternalLink className="mr-1 size-3.5" />
                    Öffnen
                </Link>
            ) : (
                <span>
                    <ExternalLink className="mr-1 size-3.5" />
                    Öffnen
                </span>
            )}
        </Button>
    );
}

function DocumentDownloadButton({
                                    document,
                                    fullWidth = false,
                                }: DocumentActionProps) {
    const hasFile = Boolean(document.file_path);

    return (
        <Button
            asChild={hasFile}
            disabled={!hasFile}
            variant="outline"
            size="sm"
            className={
                fullWidth
                    ? "h-11 w-full rounded-2xl font-bold"
                    : "rounded-xl font-bold"
            }
        >
            {hasFile ? (
                <Link href={`/api/documents/${document.id}/file?download=1`}>
                    <Download className="mr-1 size-3.5" />
                    Download
                </Link>
            ) : (
                <span>
                    <Download className="mr-1 size-3.5" />
                    Download
                </span>
            )}
        </Button>
    );
}

function DocumentStatCard({
                              label,
                              value,
                              description,
                              icon: Icon,
                              danger = false,
                              href,
                              active = false,
                          }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof FileArchive;
    danger?: boolean;
    href?: string;
    active?: boolean;
}) {
    const card = (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={active || danger ? "warning" : "info"}
        />
    );

    if (!href) return card;

    return (
        <Link
            href={href}
            className={
                active
                    ? "block rounded-[1.25rem] ring-2 ring-amber-300 ring-offset-2"
                    : "block rounded-[1.25rem] transition hover:-translate-y-0.5 hover:shadow-md"
            }
        >
            {card}
        </Link>
    );
}

function EmptyDocumentsState() {
    return (
        <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <FileArchive className="size-6" />
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
                Keine Dokumente gefunden
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
                Passe deine Suche an oder lade neue Dokumente in einer Verkaufsakte hoch.
            </p>
        </div>
    );
}
