import Link from "next/link";
import {
    ArrowLeft,
    ArrowUpRight,
    CalendarDays,
    Download,
    Edit3,
    ExternalLink,
    FileText,
    Receipt,
    ShoppingCart,
    Truck,
    UserRound,
    Wallet,
} from "lucide-react";

import type { VehicleDetail as VehicleDetailType } from "@/lib/vehicles/vehicle-detail-queries";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import {
    formatFileSize,
    getDocumentSourceLabel,
    getDocumentTypeLabel,
} from "@/lib/documents/document-helpers";
import { getDocumentDownloadFileName } from "@/lib/documents/visible-file-names";
import {
    getPaymentStatusLabel,
    getPaymentStatusTone,
    getSaleStatusLabel,
    getSaleStatusTone,
} from "@/lib/sales/sale-helpers";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { selectCurrentVehicleDocument } from "@/lib/vehicles/vehicle-document-selection";
import { Card, CardContent } from "@/components/ui/card";
import { FlashMessage } from "@/components/shared/flash-message";
import { DocumentCard } from "@/components/shared/document-card";
import { VehicleDocumentUploadForm } from "@/components/vehicles/vehicle-document-upload-form";
import { AdminDeleteDialog } from "@/components/admin/admin-delete-dialog";
import { deleteVehicleAdminAction } from "@/app/dashboard/admin-delete-actions";
import {
    getVehicleDeleteBlockers,
    type VehicleDeleteDependencyCounts,
} from "@/lib/admin-delete/admin-delete-policies";
import { getVehicleSaleAction } from "@/lib/sales/sale-create-prefill";

function getVehicleDocumentDisplayFileName(
    document: VehicleDetailType["documents"][number],
): string {
    return getDocumentDownloadFileName({
        storedFileName: document.file_name,
        documentType: document.document_type,
        mimeType: document.mime_type,
        storagePath: document.file_path,
        versionNumber: 1,
    });
}

type VehicleDetailProps = {
    vehicle: VehicleDetailType;
    canAdminDelete?: boolean;
    adminDeleteDependencyPreview?: VehicleDeleteDependencyCounts;
    vehicleSaved?: boolean;
    vehicleDocumentUploaded?: boolean;
    vehicleDocumentDeleted?: boolean;
    vehicleDocumentUploadError?: string | null;
};

export function VehicleDetail({
                                  vehicle,
                                  canAdminDelete = false,
                                  adminDeleteDependencyPreview,
                                  vehicleSaved = false,
                                  vehicleDocumentUploaded = false,
                                  vehicleDocumentDeleted = false,
                                  vehicleDocumentUploadError = null,
                              }: VehicleDetailProps) {
    const estimatedProfit =
        vehicle.sale_price_net === null
            ? null
            : vehicle.sale_price_net -
            vehicle.purchase_price_net -
            vehicle.additional_costs_net;
    const primaryDocumentTypes = [
        {
            type: "vehicle_registration" as const,
            label: "Fahrzeugschein",
            description: "Zulassungsdokument des Fahrzeugs.",
        },
        {
            type: "purchase_invoice" as const,
            label: "Einkaufsrechnung",
            description: "Rechnung oder Beleg zum Fahrzeugankauf.",
        },
    ];
    const primaryDocuments = primaryDocumentTypes.map((definition) => ({
        ...definition,
        document: selectCurrentVehicleDocument(vehicle.documents, definition.type),
    }));
    const otherDocuments = vehicle.documents.filter(
        (document) =>
            !primaryDocumentTypes.some(
                (definition) => definition.type === document.document_type,
            ),
    );
    const adminDeleteBlockers = getVehicleDeleteBlockers(
        adminDeleteDependencyPreview ?? {
            purchases: vehicle.purchase_id ? 1 : 0,
            sales: vehicle.sales.length,
            invoices: vehicle.sales.filter((sale) => sale.invoice_id).length,
            cashbookEntries: 0,
            financialEntries: 0,
        },
    );
    const vehicleDeleteDependencies = [
        ...adminDeleteBlockers,
        vehicle.documents.length > 0
            ? `${vehicle.documents.length} Dokument${
                vehicle.documents.length === 1 ? "" : "e"
            }`
            : null,
    ].filter((item): item is string => Boolean(item));
    const vehicleSaleAction = getVehicleSaleAction(vehicle);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Fahrzeugakte"
                title={vehicle.name}
                description="Detailansicht mit Fahrzeugdaten, Kundenbezug, Verkäufen und Dokumenten."
                action={
                    <div className="flex flex-wrap justify-end gap-2">
                        {vehicleSaleAction.kind !== "none" ? (
                            <Button
                                asChild
                                variant={vehicleSaleAction.kind === "create" ? "default" : "outline"}
                                className={
                                    vehicleSaleAction.kind === "create"
                                        ? "rounded-2xl font-bold"
                                        : "rounded-2xl border-slate-200 bg-white font-bold"
                                }
                            >
                                <Link href={vehicleSaleAction.href}>
                                    <ShoppingCart className="mr-2 size-4" />
                                    {vehicleSaleAction.label}
                                </Link>
                            </Button>
                        ) : null}
                        {canAdminDelete ? (
                            <AdminDeleteDialog
                                subjectLabel="Fahrzeug"
                                hiddenInputName="vehicle_id"
                                hiddenInputValue={vehicle.id}
                                action={deleteVehicleAdminAction}
                                dependentItems={vehicleDeleteDependencies}
                                disabledReason={
                                    adminDeleteBlockers.length > 0
                                        ? "Dieses Fahrzeug hat kritische Relationen und kann erst gelöscht werden, wenn diese fachlich entfernt wurden."
                                        : null
                                }
                            />
                        ) : null}
                        <Button
                            asChild
                            variant="outline"
                            className="rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/vehicles">
                                <ArrowLeft className="mr-2 size-4" />
                                Zurück
                            </Link>
                        </Button>
                    </div>
                }
            />

            {vehicleSaved ? (
                <FlashMessage message="Fahrzeugdaten wurden gespeichert." />
            ) : null}

            {vehicleDocumentUploaded ? (
                <FlashMessage message="Dokument wurde hochgeladen." />
            ) : null}

            {vehicleDocumentDeleted ? (
                <FlashMessage message="Dokument wurde entfernt." />
            ) : null}

            {vehicleDocumentUploadError ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    Fahrzeug wurde gespeichert, aber ein Dokument konnte nicht hochgeladen werden:{" "}
                    {vehicleDocumentUploadError}
                </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-3">
                <VehicleStatCard
                    label="Status"
                    value={getVehicleStatusLabel(vehicle.status)}
                    description={vehicle.vehicle_type}
                    icon={Truck}
                    tone={vehicle.status === "sold" ? "success" : "info"}
                />
                <VehicleStatCard
                    label="Einkauf netto"
                    value={formatCurrency(vehicle.purchase_price_net)}
                    description="Anschaffung"
                    icon={Wallet}
                    tone="neutral"
                />
                <VehicleStatCard
                    label="Rohgewinn"
                    value={estimatedProfit === null ? "—" : formatCurrency(estimatedProfit)}
                    description="interne Kalkulation"
                    icon={ArrowUpRight}
                    tone={
                        estimatedProfit === null
                            ? "neutral"
                            : estimatedProfit >= 0
                                ? "success"
                                : "danger"
                    }
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-6">
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <SectionTitle
                                    icon={Truck}
                                    title="Fahrzeugdaten"
                                    description="Technische Stammdaten."
                                />
                                <Button
                                    asChild
                                    variant="outline"
                                    className="rounded-2xl bg-white font-bold"
                                >
                                    <Link href={`/dashboard/vehicles/${vehicle.id}/edit`}>
                                        <Edit3 className="mr-2 size-4" />
                                        Bearbeiten
                                    </Link>
                                </Button>
                            </div>

                            <div className="mt-5 space-y-3">
                                <InfoRow label="Hersteller" value={vehicle.manufacturer} />
                                <InfoRow label="Modell" value={vehicle.model} />
                                <InfoRow label="Fahrzeugtyp" value={vehicle.vehicle_type} />
                                <InfoRow label="VIN" value={vehicle.vin} />
                                <InfoRow
                                    label="Kennzeichen bisher"
                                    value={vehicle.license_plate ?? "—"}
                                />
                                <InfoRow
                                    label="Baujahr"
                                    value={vehicle.construction_year?.toString() ?? "—"}
                                />
                                <InfoRow
                                    label="Angelegt am"
                                    value={formatDate(vehicle.created_at)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between gap-3">
                                <SectionTitle
                                    icon={FileText}
                                    title="Schäden"
                                    description="Bekannte Schäden oder Mängel am Fahrzeug."
                                />
                                <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 rounded-xl font-bold"
                                >
                                    <Link href={`/dashboard/vehicles/${vehicle.id}/edit`}>
                                        <Edit3 className="mr-1 size-3.5" />
                                        Bearbeiten
                                    </Link>
                                </Button>
                            </div>

                            <p className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-700">
                                {vehicle.damage_notes?.trim() || "Keine Schäden hinterlegt."}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between gap-3">
                                <SectionTitle
                                    icon={Wallet}
                                    title="Preise & Kalkulation"
                                    description="Einkauf, Verkauf und Rohgewinn."
                                />
                                <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 rounded-xl font-bold"
                                >
                                    <Link href={`/dashboard/vehicles/${vehicle.id}/edit`}>
                                        <Edit3 className="mr-1 size-3.5" />
                                        Bearbeiten
                                    </Link>
                                </Button>
                            </div>

                            <div className="mt-5 space-y-3">
                                <InfoRow
                                    label="Einkauf netto"
                                    value={formatCurrency(vehicle.purchase_price_net)}
                                />
                                <InfoRow
                                    label="Rohgewinn netto"
                                    value={
                                        estimatedProfit === null ? "—" : formatCurrency(estimatedProfit)
                                    }
                                    strong
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={UserRound}
                                title="Kundenbezug"
                                description="Verkäufer und Käufer, falls zugeordnet."
                            />

                            <div className="mt-5 grid gap-4">
                                <CustomerBox
                                    title="Verkäufer"
                                    customer={vehicle.seller}
                                    purchaseNumber={vehicle.purchase_number}
                                    purchaseHref={
                                        vehicle.purchase_id
                                            ? `/dashboard/ankauf/${vehicle.purchase_id}`
                                            : undefined
                                    }
                                    editHref={
                                        vehicle.purchase_id
                                            ? `/dashboard/ankauf/${vehicle.purchase_id}/edit`
                                            : undefined
                                    }
                                />
                                <CustomerBox title="Käufer" customer={vehicle.buyer} />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-0">
                            <div className="border-b border-slate-200 p-5">
                                <SectionTitle
                                    icon={Receipt}
                                    title="Verkäufe"
                                    description="Alle Verkaufsakten zu diesem Fahrzeug."
                                />
                            </div>

                            {vehicle.sales.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {vehicle.sales.map((sale) => (
                                        <div
                                            key={sale.id}
                                            className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    {sale.customer_name}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                                    {formatDate(sale.sale_date)}
                                                </p>

                                                {sale.invoice_number ? (
                                                    <p className="mt-1 text-sm font-extrabold text-cyan-700">
                                                        Rechnung {sale.invoice_number}
                                                    </p>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge tone={getSaleStatusTone(sale.status)}>
                                                    {getSaleStatusLabel(sale.status)}
                                                </StatusBadge>

                                                <StatusBadge tone={getPaymentStatusTone(sale.payment_status)}>
                                                    {getPaymentStatusLabel(sale.payment_status)}
                                                </StatusBadge>

                                                <Button
                                                    asChild
                                                    size="sm"
                                                    className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                                >
                                                    <Link href={`/dashboard/sales/${sale.id}`}>
                                                        Verkaufsakte
                                                        <ArrowUpRight className="ml-1 size-3.5" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyBox text="Für dieses Fahrzeug gibt es noch keinen Verkauf." />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card
                        id="documents"
                        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm"
                    >
                        <CardContent className="p-0">
                            <div className="border-b border-slate-200 p-5">
                                <SectionTitle
                                    icon={FileText}
                                    title="Dokumente"
                                    description="Alle Dokumente, die mit diesem Fahrzeug verknüpft sind."
                                />
                            </div>

                            <div className="space-y-4 p-5">
                                {primaryDocuments.map(({ type, label, description, document }) => (
                                    <DocumentCard
                                        key={type}
                                        title={label}
                                        description={description}
                                        meta={
                                            document
                                                ? `${getVehicleDocumentDisplayFileName(document)} · ${formatFileSize(document.file_size)} · ${getDocumentSourceLabel(document.source as "generated" | "uploaded")}`
                                                : "Noch nicht hochgeladen"
                                        }
                                        status={
                                            <StatusBadge
                                                tone={
                                                    document?.status === "available"
                                                        ? "success"
                                                        : "warning"
                                                }
                                            >
                                                {document?.status === "available"
                                                    ? "Verfügbar"
                                                    : "Fehlt"}
                                            </StatusBadge>
                                        }
                                        icon={<FileText className="size-5" />}
                                        actions={
                                            <>
                                                {document?.file_path ? (
                                                    <>
                                                        <Button
                                                            asChild
                                                            variant="outline"
                                                            size="sm"
                                                            className="rounded-xl font-bold"
                                                        >
                                                            <Link
                                                                href={`/api/documents/${document.id}/file`}
                                                                target="_blank"
                                                            >
                                                                <ExternalLink className="mr-1 size-3.5" />
                                                                Öffnen
                                                            </Link>
                                                        </Button>
                                                        <Button
                                                            asChild
                                                            variant="outline"
                                                            size="sm"
                                                            className="rounded-xl font-bold"
                                                        >
                                                            <Link
                                                                href={`/api/documents/${document.id}/file?download=1`}
                                                            >
                                                                <Download className="mr-1 size-3.5" />
                                                                Download
                                                            </Link>
                                                        </Button>
                                                    </>
                                                ) : null}
                                                <VehicleDocumentUploadForm
                                                    vehicleId={vehicle.id}
                                                    documentType={type}
                                                    documentLabel={label}
                                                    existingDocumentId={document?.id ?? null}
                                                />
                                            </>
                                        }
                                    />
                                ))}

                                {otherDocuments.length > 0 ? (
                                    <div className="space-y-3">
                                        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                                            Weitere Dokumente
                                        </p>
                                        {otherDocuments.map((document) => (
                                            <DocumentCard
                                                key={document.id}
                                                title={getDocumentTypeLabel(document.document_type)}
                                                meta={`${getVehicleDocumentDisplayFileName(document)} · ${formatFileSize(document.file_size)}`}
                                                status={
                                                    <StatusBadge
                                                        tone={
                                                            document.status === "available"
                                                                ? "success"
                                                                : "warning"
                                                        }
                                                    >
                                                        {document.status === "available"
                                                            ? "Verfügbar"
                                                            : "Prüfen"}
                                                    </StatusBadge>
                                                }
                                                actions={
                                                    document.file_path ? (
                                                        <>
                                                            <Button
                                                                asChild
                                                                variant="outline"
                                                                size="sm"
                                                                className="rounded-xl font-bold"
                                                            >
                                                                <Link
                                                                    href={`/api/documents/${document.id}/file`}
                                                                    target="_blank"
                                                                >
                                                                    <ExternalLink className="mr-1 size-3.5" />
                                                                    Öffnen
                                                                </Link>
                                                            </Button>
                                                            <Button
                                                                asChild
                                                                variant="outline"
                                                                size="sm"
                                                                className="rounded-xl font-bold"
                                                            >
                                                                <Link
                                                                    href={`/api/documents/${document.id}/file?download=1`}
                                                                >
                                                                    <Download className="mr-1 size-3.5" />
                                                                    Download
                                                                </Link>
                                                            </Button>
                                                        </>
                                                    ) : null
                                                }
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>

                    {vehicle.notes ? (
                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={CalendarDays}
                                    title="Notizen"
                                    description="Interne Hinweise zum Fahrzeug."
                                />

                                <p className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-700">
                                    {vehicle.notes}
                                </p>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

function CustomerBox({
                         title,
                         customer,
                         purchaseNumber,
                         purchaseHref,
                         editHref,
                     }: {
    title: string;
    customer: VehicleDetailType["seller"];
    purchaseNumber?: string | null;
    purchaseHref?: string;
    editHref?: string;
}) {
    if (!customer) {
        return (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-500">
                    Kein {title.toLowerCase()} zugeordnet.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    {title}
                </p>
                {editHref ? (
                    <Button asChild variant="outline" size="sm" className="rounded-xl font-bold">
                        <Link href={editHref}>
                            <Edit3 className="mr-1 size-3.5" />
                            Bearbeiten
                        </Link>
                    </Button>
                ) : null}
            </div>
            <p className="mt-2 font-extrabold text-slate-950">{customer.name}</p>
            {purchaseNumber ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span className="text-slate-500">Einkaufsnummer:</span>
                    {purchaseHref ? (
                        <Link
                            href={purchaseHref}
                            className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-700 transition hover:bg-cyan-100"
                        >
                            {purchaseNumber}
                        </Link>
                    ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                            {purchaseNumber}
                        </span>
                    )}
                </div>
            ) : null}
            <p className="mt-1 text-sm font-semibold text-slate-500">
                {customer.address}
            </p>
            {customer.email ? (
                <p className="mt-1 text-sm font-semibold text-cyan-700">
                    {customer.email}
                </p>
            ) : null}
            {customer.phone ? (
                <p className="mt-1 text-sm font-semibold text-slate-600">
                    {customer.phone}
                </p>
            ) : null}
        </div>
    );
}

function SectionTitle({
                          icon: Icon,
                          title,
                          description,
                      }: {
    icon: typeof Truck;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                <Icon className="size-5" />
            </div>
            <div>
                <h2 className="text-xl font-extrabold text-slate-950">{title}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                    {description}
                </p>
            </div>
        </div>
    );
}

function InfoRow({
                     label,
                     value,
                     strong = false,
                 }: {
    label: string;
    value: string;
    strong?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p
                className={
                    strong
                        ? "text-right text-sm font-extrabold text-emerald-700"
                        : "text-right text-sm font-extrabold text-slate-950"
                }
            >
                {value || "—"}
            </p>
        </div>
    );
}

function VehicleStatCard({
                             label,
                             value,
                             description,
                             icon: Icon,
                             tone,
                         }: {
    label: string;
    value: string;
    description: string;
    icon: typeof Truck;
    tone: "success" | "warning" | "danger" | "info" | "neutral";
}) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone={tone}
        />
    );
}

function EmptyBox({ text }: { text: string }) {
    return (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm font-bold text-slate-500">{text}</p>
        </div>
    );
}

function getVehicleStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        in_stock: "Im Bestand",
        reserved: "Reserviert",
        sold: "Verkauft",
    };

    return labels[status] ?? status;
}
