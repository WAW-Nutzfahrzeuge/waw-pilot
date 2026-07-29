import Link from "next/link";
import {
    ArrowLeft,
    BadgeCheck,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Download,
    ExternalLink,
    FileSignature,
    FileText,
    Pencil,
    Truck,
    UserRound,
} from "lucide-react";

import type { LicensePlateCaseDetail as LicensePlateCaseDetailType } from "@/lib/license-plates/license-plate-detail-queries";
import {
    getLicensePlateStatusLabel,
    getLicensePlateStatusTone,
    getLicensePlateTypeLabel,
    getLicensePlateTypeTone,
} from "@/lib/license-plates/license-plate-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LicensePlateDocumentUploadForm } from "@/components/license-plates/license-plate-document-upload-form";
import { getDocumentTypeLabel } from "@/lib/documents/document-helpers";
import { LicensePlateStatusActions } from "@/components/license-plates/license-plate-status-actions";
import { generateLicensePlateConsentAction } from "@/app/dashboard/plates/[plateCaseId]/generated-document-actions";
import { GenerateLicensePlateDocumentSubmitButton } from "@/components/license-plates/generate-license-plate-document-submit-button";
import { TemporarySuccessMessage } from "@/components/shared/temporary-success-message";

type LicensePlateDetailProps = {
    plateCase: LicensePlateCaseDetailType;
    generatedDocumentType?: string | null;
};

export function LicensePlateDetail({
                                       plateCase,
                                       generatedDocumentType = null,
                                   }: LicensePlateDetailProps) {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kennzeichen"
                title={getLicensePlateTypeLabel(plateCase.plate_type)}
                description="Detailansicht mit Fahrzeug, Kunde, Gültigkeit und Vorgangsstatus."
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            asChild
                            variant="outline"
                            className="rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/plates">
                                <ArrowLeft className="mr-2 size-4" />
                                Zurück
                            </Link>
                        </Button>

                        <Button
                            asChild
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        >
                            <Link href={`/dashboard/plates/${plateCase.id}/edit`}>
                                <Pencil className="mr-2 size-4" />
                                Bearbeiten
                            </Link>
                        </Button>
                    </div>
                }
            />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailStatCard
                    label="Kennzeichenart"
                    value={getLicensePlateTypeLabel(plateCase.plate_type)}
                    description={
                        plateCase.duration_days
                            ? `${plateCase.duration_days} Tage`
                            : "ohne Dauer"
                    }
                    icon={BadgeCheck}
                    tone={getLicensePlateTypeTone(plateCase.plate_type)}
                />
                <DetailStatCard
                    label="Status"
                    value={getLicensePlateStatusLabel(plateCase.status)}
                    description="Vorgangsstatus"
                    icon={ClipboardList}
                    tone={getLicensePlateStatusTone(plateCase.status)}
                />
                <DetailStatCard
                    label="Gültig ab"
                    value={formatDate(plateCase.valid_from)}
                    description={`bis ${formatDate(plateCase.valid_until)}`}
                    icon={CalendarDays}
                    tone="info"
                />
                <DetailStatCard
                    label="Kennzeichen"
                    value={plateCase.license_plate_number ?? "Noch offen"}
                    description={plateCase.registration_office ?? "Keine Zulassungsstelle"}
                    icon={Truck}
                    tone="neutral"
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-6">
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={Truck}
                                title="Fahrzeug"
                                description="Fahrzeugbezug des Kennzeichen-Vorgangs."
                            />

                            {plateCase.vehicle ? (
                                <div className="mt-5 space-y-3">
                                    <InfoRow label="Fahrzeug" value={plateCase.vehicle.name} />
                                    <InfoRow
                                        label="Fahrzeugtyp"
                                        value={plateCase.vehicle.vehicle_type}
                                    />
                                    <InfoRow label="VIN" value={plateCase.vehicle.vin} />
                                    <InfoRow
                                        label="Aktuelles Kennzeichen"
                                        value={plateCase.vehicle.license_plate ?? "—"}
                                    />
                                    <InfoRow
                                        label="Erstzulassung"
                                        value={formatDate(plateCase.vehicle.first_registration)}
                                    />
                                </div>
                            ) : (
                                <EmptyBox text="Kein Fahrzeug verknüpft." />
                            )}
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={UserRound}
                                title="Kunde"
                                description="Kundenbezug des Kennzeichen-Vorgangs."
                            />

                            {plateCase.customer ? (
                                <div className="mt-5 space-y-3">
                                    <InfoRow label="Name" value={plateCase.customer.name} />
                                    <InfoRow
                                        label="Adresse"
                                        value={plateCase.customer.address || "—"}
                                    />
                                    <InfoRow
                                        label="E-Mail"
                                        value={plateCase.customer.email ?? "—"}
                                    />
                                    <InfoRow
                                        label="Telefon"
                                        value={plateCase.customer.phone ?? "—"}
                                    />
                                </div>
                            ) : (
                                <EmptyBox text="Kein Kunde verknüpft." />
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={ClipboardList}
                                title="Vorgang"
                                description="Antragsdaten, Zulassungsstelle und Notizen."
                            />

                            <div className="mt-5 space-y-3">
                                <InfoRow
                                    label="Antragsdatum"
                                    value={formatDate(plateCase.requested_at)}
                                />
                                <InfoRow
                                    label="Gültig von"
                                    value={formatDate(plateCase.valid_from)}
                                />
                                <InfoRow
                                    label="Gültig bis"
                                    value={formatDate(plateCase.valid_until)}
                                />
                                <InfoRow
                                    label="Zulassungsstelle"
                                    value={plateCase.registration_office ?? "—"}
                                />
                                <InfoRow
                                    label="Kennzeichen"
                                    value={plateCase.license_plate_number ?? "—"}
                                />
                            </div>

                            <LicensePlateStatusActions
                                plateCaseId={plateCase.id}
                                currentStatus={plateCase.status}
                            />

                            {plateCase.notes ? (
                                <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                        Notizen
                                    </p>
                                    <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">
                                        {plateCase.notes}
                                    </p>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <LicensePlateConsentCard
                        plateCase={plateCase}
                        wasJustGenerated={generatedDocumentType === "license_plate_consent"}
                    />

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={FileText}
                                title="Dokumente"
                                description="Dokumentenablage für Versicherung, Vollmacht, Zulassung und weitere Unterlagen."
                            />

                            <div className="mt-5">
                                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                                    <CardContent className="p-5">
                                        <SectionTitle
                                            icon={FileText}
                                            title="Dokumente"
                                            description="Versicherung, Vollmacht, Zulassung und weitere Kennzeichen-Unterlagen hochladen."
                                        />

                                        <div className="mt-5 space-y-4">
                                            {[
                                                {
                                                    documentType: "license_plate_insurance",
                                                    label: "Kennzeichen-Versicherung",
                                                },
                                                {
                                                    documentType: "license_plate_power_of_attorney",
                                                    label: "Kennzeichen-Vollmacht",
                                                },
                                                {
                                                    documentType: "license_plate_registration",
                                                    label: "Kennzeichen-Zulassung",
                                                },
                                                {
                                                    documentType: "license_plate_document",
                                                    label: "Sonstiges Kennzeichen-Dokument",
                                                },
                                            ].map((requiredDocument) => {
                                                const existingDocument =
                                                    plateCase.documents.find(
                                                        (document) =>
                                                            document.document_type === requiredDocument.documentType,
                                                    ) ?? null;

                                                return (
                                                    <div
                                                        key={requiredDocument.documentType}
                                                        className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                                                    >
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                            <div>
                                                                <p className="font-extrabold text-slate-950">
                                                                    {requiredDocument.label}
                                                                </p>
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

                                                        <LicensePlateDocumentUploadForm
                                                            plateCaseId={plateCase.id}
                                                            documentType={requiredDocument.documentType}
                                                            documentLabel={requiredDocument.label}
                                                            existingDocumentId={existingDocument?.id ?? null}
                                                            existingFileName={existingDocument?.file_name ?? null}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {plateCase.documents.length > 0 ? (
                                            <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
                                                <p className="text-sm font-extrabold text-slate-950">
                                                    Alle Kennzeichen-Dokumente
                                                </p>

                                                <div className="mt-3 space-y-3">
                                                    {plateCase.documents.map((document) => (
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
                        </CardContent>
                    </Card>

                    {plateCase.sale ? (
                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={ClipboardList}
                                    title="Verkauf"
                                    description="Verknüpfte Verkaufsakte."
                                />

                                <div className="mt-5 space-y-3">
                                    <InfoRow
                                        label="Verkaufsdatum"
                                        value={formatDate(plateCase.sale.sale_date)}
                                    />
                                    <InfoRow
                                        label="Brutto"
                                        value={formatCurrency(plateCase.sale.gross_amount)}
                                    />
                                    <InfoRow
                                        label="Zahlungsstatus"
                                        value={plateCase.sale.payment_status}
                                    />
                                </div>

                                {plateCase.sale_id ? (
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="mt-5 rounded-2xl bg-white font-bold"
                                    >
                                        <Link href={`/dashboard/sales/${plateCase.sale_id}`}>
                                            Verkaufsakte öffnen
                                        </Link>
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </section>
        </div>
    );
}

function LicensePlateConsentCard({
                                     plateCase,
                                     wasJustGenerated,
                                 }: {
    plateCase: LicensePlateCaseDetailType;
    wasJustGenerated: boolean;
}) {
    const generatedConsentDocument =
        plateCase.documents.find(
            (document) =>
                document.document_type === "license_plate_consent" &&
                document.source === "generated",
        ) ?? null;

    const signedConsentDocument =
        plateCase.documents.find(
            (document) =>
                document.document_type === "license_plate_consent" &&
                document.source === "uploaded" &&
                document.status === "available",
        ) ?? null;

    const canGenerate = Boolean(plateCase.customer && plateCase.vehicle);

    return (
        <Card
            id="license-plate-documents"
            className="scroll-mt-24 rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm"
        >
            <CardContent className="p-5">
                <SectionTitle
                    icon={FileSignature}
                    title="Einverständniserklärung"
                    description="Automatisch erzeugte Erklärung zur Nutzung von Kurzzeit- und Ausfuhrkennzeichen."
                />

                {wasJustGenerated ? (
                    <TemporarySuccessMessage
                        title="Einverständniserklärung wurde erfolgreich erzeugt."
                        description="Die PDF wurde gespeichert und ist jetzt in der Kennzeichenakte verfügbar."
                        durationMs={3000}
                    />
                ) : null}

                {!canGenerate ? (
                    <div className="mt-5 rounded-3xl border border-red-100 bg-red-50 p-4">
                        <p className="text-sm font-extrabold text-red-800">
                            Dieses Dokument kann noch nicht erzeugt werden.
                        </p>
                        <p className="mt-2 text-xs font-semibold leading-5 text-red-700">
                            Für die Einverständniserklärung müssen ein Kunde und ein Fahrzeug
                            mit dem Kennzeichen-Vorgang verknüpft sein.
                        </p>
                    </div>
                ) : null}

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <DocumentStatusBox
                        title="Generiertes Dokument"
                        document={generatedConsentDocument}
                        emptyText={
                            canGenerate
                                ? "Noch nicht erzeugt."
                                : "Erzeugung erst nach vollständigen Daten möglich."
                        }
                    />

                    <DocumentStatusBox
                        title="Unterschriebenes Dokument"
                        document={signedConsentDocument}
                        emptyText="Noch nicht unterschrieben hochgeladen."
                    />
                </div>

                <div className="mt-5 flex flex-col gap-2">
                    <form action={generateLicensePlateConsentAction}>
                        <input type="hidden" name="plate_case_id" value={plateCase.id} />

                        <GenerateLicensePlateDocumentSubmitButton
                            disabled={!canGenerate}
                        />
                    </form>

                    {generatedConsentDocument?.file_path ? (
                        <Button
                            asChild
                            variant="outline"
                            className="h-11 rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link
                                href={`/api/documents/${generatedConsentDocument.id}/file`}
                                target="_blank"
                            >
                                <ExternalLink className="mr-2 size-4" />
                                Generierte PDF öffnen
                            </Link>
                        </Button>
                    ) : null}
                </div>

                {generatedConsentDocument ? (
                    <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-extrabold text-slate-950">
                            Unterschriebene Einverständniserklärung hochladen
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                            Lade hier die vom Kunden oder Fahrer unterschriebene Version hoch.
                        </p>

                        <div className="mt-4">
                            <LicensePlateDocumentUploadForm
                                plateCaseId={plateCase.id}
                                documentType="license_plate_consent"
                                documentLabel="Einverständniserklärung unterschrieben"
                                existingDocumentId={signedConsentDocument?.id ?? null}
                                existingFileName={signedConsentDocument?.file_name ?? null}
                            />
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

function DocumentStatusBox({
                               title,
                               document,
                               emptyText,
                           }: {
    title: string;
    document: LicensePlateCaseDetailType["documents"][number] | null;
    emptyText: string;
}) {
    if (!document) {
        return (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400">
                        <FileText className="size-4" />
                    </div>
                    <div>
                        <p className="text-sm font-extrabold text-slate-700">
                            {title}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                            {emptyText}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700">
                    <CheckCircle2 className="size-4" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-extrabold text-emerald-900">
                        {title}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold leading-5 text-emerald-800">
                        {document.file_name}
                    </p>
                </div>
            </div>
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
