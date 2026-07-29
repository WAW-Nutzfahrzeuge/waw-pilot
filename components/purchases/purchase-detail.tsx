import Link from "next/link";
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    Download,
    ExternalLink,
    FileText,
    FileWarning,
    ShoppingCart,
    Truck,
    UserRound,
    Wallet,
    Pencil,
} from "lucide-react";

import { PurchaseDocumentUploadForm } from "@/components/purchases/purchase-document-upload-form";
import type { PurchaseCaseDetail as PurchaseCaseDetailType } from "@/lib/purchases/purchase-detail-queries";
import {
    getPurchaseDocumentStatusLabel,
    getPurchaseDocumentStatusTone,
    getPurchasePaymentStatusLabel,
    getPurchasePaymentStatusTone,
    getPurchaseStatusLabel,
    getPurchaseStatusTone,
} from "@/lib/purchases/purchase-helpers";
import { getDocumentTypeLabel } from "@/lib/documents/document-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markPurchasePaidAction } from "@/app/dashboard/ankauf/[purchaseId]/payment-actions";
import { FlashMessage } from "@/components/shared/flash-message";
import {
    PurchaseSellerEditDialog,
    PurchaseVehicleEditDialog,
} from "@/components/purchases/purchase-record-edit-dialogs";

type PurchaseDetailProps = {
    purchase: PurchaseCaseDetailType;
    sellerSaved?: boolean;
    vehicleSaved?: boolean;
};

const purchaseRequiredDocuments = [
    {
        documentType: "vehicle_registration",
        label: "Fahrzeugschein",
        required: false,
    },
    {
        documentType: "purchase_invoice",
        label: "Einkaufsrechnung",
        required: false,
    },
];

export function PurchaseDetail({
                                   purchase,
                                   sellerSaved = false,
                                   vehicleSaved = false,
                               }: PurchaseDetailProps) {
    const primaryDocumentTypes = purchaseRequiredDocuments.map(
        (document) => document.documentType,
    );
    const archivedDocuments = purchase.documents.filter(
        (document) => !primaryDocumentTypes.includes(document.document_type),
    );

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Fahrzeugankauf"
                title={purchase.purchase_number ?? "Ankauf ohne Nummer"}
                description="Gekauftes Fahrzeug mit Verkäufer, Einkaufspreis, Zahlung und Ankaufsdokumenten."
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            asChild
                            variant="outline"
                            className="rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/ankauf">
                                <ArrowLeft className="mr-2 size-4" />
                                Zurück
                            </Link>
                        </Button>

                        <Button
                            asChild
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        >
                            <Link href={`/dashboard/ankauf/${purchase.id}/edit`}>
                                <Pencil className="mr-2 size-4" />
                                Bearbeiten
                            </Link>
                        </Button>
                    </div>
                }
            />

            {sellerSaved ? (
                <FlashMessage message="Verkäuferdaten wurden gespeichert." />
            ) : null}

            {vehicleSaved ? (
                <FlashMessage message="Fahrzeugdaten wurden gespeichert." />
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailStatCard
                    label="Status"
                    value={getPurchaseStatusLabel(purchase.status)}
                    description="Ankaufsstatus"
                    icon={ShoppingCart}
                    tone={getPurchaseStatusTone(purchase.status)}
                />
                <DetailStatCard
                    label="Zahlung"
                    value={getPurchasePaymentStatusLabel(purchase.payment_status)}
                    description={formatCurrency(purchase.gross_amount)}
                    icon={Wallet}
                    tone={getPurchasePaymentStatusTone(purchase.payment_status)}
                />
                <DetailStatCard
                    label="Dokumente"
                    value={getPurchaseDocumentStatusLabel(
                        purchase.document_check_status,
                    )}
                    description="Ankaufsunterlagen"
                    icon={FileWarning}
                    tone={getPurchaseDocumentStatusTone(
                        purchase.document_check_status,
                    )}
                />
                <DetailStatCard
                    label="Ankaufsdatum"
                    value={formatDate(purchase.purchase_date)}
                    description="Datum der Ankaufsakte"
                    icon={CalendarDays}
                    tone="info"
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-6">
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <SectionTitle
                                    icon={UserRound}
                                    title="Verkäufer"
                                    description="Verkäuferdaten aus der Ankaufsakte."
                                />
                                {purchase.seller ? (
                                    <PurchaseSellerEditDialog
                                        purchaseId={purchase.id}
                                        seller={purchase.seller}
                                    />
                                ) : null}
                            </div>

                            {purchase.seller ? (
                                <div className="mt-5 space-y-3">
                                    <InfoRow label="Name" value={purchase.seller.name} />
                                    <InfoRow
                                        label="Adresse"
                                        value={purchase.seller.address || "—"}
                                    />
                                    <InfoRow
                                        label="E-Mail"
                                        value={purchase.seller.email ?? "—"}
                                    />
                                    <InfoRow
                                        label="Telefon"
                                        value={purchase.seller.phone ?? "—"}
                                    />
                                    <InfoRow
                                        label="USt-ID"
                                        value={purchase.seller.vat_id ?? "—"}
                                    />
                                </div>
                            ) : (
                                <EmptyBox text="Kein Verkäufer verknüpft." />
                            )}
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <SectionTitle
                                    icon={Truck}
                                    title="Fahrzeug"
                                    description="Fahrzeugdaten aus dem Bestand."
                                />
                                {purchase.vehicle ? (
                                    <PurchaseVehicleEditDialog
                                        purchaseId={purchase.id}
                                        vehicle={purchase.vehicle}
                                    />
                                ) : null}
                            </div>

                            {purchase.vehicle ? (
                                <div className="mt-5 space-y-3">
                                    <InfoRow
                                        label="Interne Nummer"
                                        value={purchase.vehicle.internal_number}
                                    />
                                    <InfoRow label="Fahrzeug" value={purchase.vehicle.name} />
                                    <InfoRow
                                        label="Fahrzeugtyp"
                                        value={purchase.vehicle.vehicle_type}
                                    />
                                    <InfoRow label="VIN" value={purchase.vehicle.vin} />
                                    <InfoRow
                                        label="Kennzeichen"
                                        value={purchase.vehicle.license_plate ?? "—"}
                                    />
                                    <InfoRow
                                        label="Baujahr"
                                        value={
                                            purchase.vehicle.construction_year?.toString() ?? "—"
                                        }
                                    />
                                    <InfoRow
                                        label="Fahrzeugstatus"
                                        value={purchase.vehicle.status}
                                    />
                                </div>
                            ) : (
                                <EmptyBox text="Kein Fahrzeug verknüpft." />
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={Wallet}
                                title="Beträge"
                                description="Netto, Mehrwertsteuer und Brutto des Ankaufs."
                            />

                            <div className="mt-5 grid gap-3 md:grid-cols-3">
                                <AmountBox
                                    label="Netto"
                                    value={formatCurrency(purchase.net_amount)}
                                />
                                <AmountBox
                                    label={`MwSt. ${purchase.vat_rate}%`}
                                    value={formatCurrency(purchase.vat_amount)}
                                />
                                <AmountBox
                                    label="Brutto"
                                    value={formatCurrency(purchase.gross_amount)}
                                />
                            </div>

                            <MarkPurchasePaidButton purchase={purchase} />
                            {purchase.notes ? (
                                <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                        Notizen
                                    </p>
                                    <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">
                                        {purchase.notes}
                                    </p>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card
                        id="documents"
                        className="scroll-mt-24 rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm"
                    >
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={FileText}
                                title="Ankaufsdokumente"
                                description="Fahrzeugschein und Einkaufsrechnung mit Ankauf und Fahrzeug verknüpfen."
                            />

                            <div className="mt-5 space-y-4">
                                {purchaseRequiredDocuments.map((requiredDocument) => {
                                    const existingDocument =
                                        purchase.documents.find(
                                            (document) =>
                                                document.document_type ===
                                                requiredDocument.documentType,
                                        ) ?? null;

                                    return (
                                        <div
                                            key={requiredDocument.documentType}
                                            className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {existingDocument ? (
                                                            <CheckCircle2 className="size-5 text-emerald-700" />
                                                        ) : (
                                                            <FileWarning className="size-5 text-amber-700" />
                                                        )}

                                                        <p className="font-extrabold text-slate-950">
                                                            {requiredDocument.label}
                                                        </p>

                                                        {requiredDocument.required ? (
                                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-extrabold text-red-700">
                                                                Pflicht
                                                            </span>
                                                        ) : (
                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold text-slate-500">
                                                                Optional
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="mt-1 text-sm font-medium text-slate-500">
                                                        {existingDocument
                                                            ? existingDocument.file_name
                                                            : "Noch nicht hochgeladen"}
                                                    </p>

                                                    {existingDocument?.file_path ? (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <Button
                                                                asChild
                                                                variant="outline"
                                                                size="sm"
                                                                className="rounded-xl font-bold"
                                                            >
                                                                <Link
                                                                    href={`/api/documents/${existingDocument.id}/file`}
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
                                                                    href={`/api/documents/${existingDocument.id}/file?download=1`}
                                                                >
                                                                    <Download className="mr-1 size-3.5" />
                                                                    Download
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <StatusBadge
                                                    tone={existingDocument ? "success" : "danger"}
                                                >
                                                    {existingDocument ? "Vorhanden" : "Fehlt"}
                                                </StatusBadge>
                                            </div>

                                            <PurchaseDocumentUploadForm
                                                purchaseId={purchase.id}
                                                documentType={requiredDocument.documentType}
                                                documentLabel={requiredDocument.label}
                                                existingDocumentId={existingDocument?.id ?? null}
                                                existingFileName={
                                                    existingDocument?.file_name ?? null
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            {archivedDocuments.length > 0 ? (
                                <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
                                    <p className="text-sm font-extrabold text-slate-950">
                                        Weitere / archivierte Ankaufsdokumente
                                    </p>

                                    <div className="mt-3 space-y-3">
                                        {archivedDocuments.map((document) => (
                                            <div
                                                key={document.id}
                                                className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 md:flex-row md:items-center md:justify-between"
                                            >
                                                <div>
                                                    <p className="font-bold text-slate-950">
                                                        {document.file_name}
                                                    </p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                                        {getDocumentTypeLabel(document.document_type)}
                                                    </p>
                                                </div>

                                                {document.file_path ? (
                                                    <div className="flex flex-wrap gap-2">
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
                                                                Download
                                                            </Link>
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}

function MarkPurchasePaidButton({
                                    purchase,
                                }: {
    purchase: PurchaseCaseDetailType;
}) {
    if (purchase.payment_status === "paid") {
        return (
            <Button
                disabled
                variant="outline"
                className="mt-5 rounded-2xl border-emerald-200 bg-emerald-50 font-bold text-emerald-700 disabled:cursor-default disabled:opacity-100"
            >
                <CheckCircle2 className="mr-2 size-4" />
                Bezahlt
            </Button>
        );
    }

    return (
        <form
            action={markPurchasePaidAction}
            className="mt-5 flex flex-wrap items-center gap-2"
        >
            <input type="hidden" name="purchase_id" value={purchase.id} />

            <select
                name="payment_method"
                defaultValue="bank"
                className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
            >
                <option value="bank">Bank</option>
                <option value="cash">Bar</option>
            </select>

            <Button
                type="submit"
                className="rounded-2xl bg-emerald-700 font-bold text-white hover:bg-emerald-800"
            >
                <CheckCircle2 className="mr-2 size-4" />
                Ankauf bezahlt markieren
            </Button>
        </form>
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

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-sm font-bold text-slate-500">{label}</p>
            <p className="text-right text-sm font-extrabold text-slate-950">
                {value || "—"}
            </p>
        </div>
    );
}

function AmountBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p className="mt-2 text-lg font-extrabold text-slate-950">{value}</p>
        </div>
    );
}

function DetailStatCard({
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
