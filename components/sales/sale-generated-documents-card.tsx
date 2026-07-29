import Link from "next/link";
import {
    AlertTriangle,
    CheckCircle2,
    FileCheck2,
    FileSignature,
    FileText,
    Info,
    PencilLine,
    UserRoundCog,
} from "lucide-react";

import { generateSaleDocumentAction } from "@/app/dashboard/sales/[saleId]/generated-document-actions";
import { SaleDocumentUploadForm } from "@/components/sales/sale-document-upload-form";
import type { SaleGeneratedDocumentCheck } from "@/lib/pdf/generated-documents/sale-document-checks";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GenerateSaleDocumentSubmitButton } from "@/components/sales/generate-sale-document-submit-button";
import { TemporarySuccessMessage } from "@/components/shared/temporary-success-message";
import { DocumentCard } from "@/components/shared/document-card";

type SaleGeneratedDocumentsCardProps = {
    saleId: string;
    documents: SaleGeneratedDocumentCheck[];
    generatedDocumentType?: string | null;
};

export function SaleGeneratedDocumentsCard({
                                               saleId,
                                               documents,
                                               generatedDocumentType = null,
                                           }: SaleGeneratedDocumentsCardProps) {
    const missingDataCount = documents.filter(
        (document) => document.status === "missing_data",
    ).length;

    const signedCount = documents.filter(
        (document) => document.status === "signed_received",
    ).length;

    const generatedCount = documents.filter(
        (document) =>
            document.status === "generated_available" ||
            document.status === "generated_needs_signature" ||
            document.status === "sent_to_customer" ||
            document.status === "signed_received",
    ).length;

    return (
        <Card
            id="automatic-documents"
            className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-slate-900/25 bg-white/90 shadow-sm"
        >
            <CardContent className="p-0">
                <div className="border-b-2 border-slate-900 bg-white px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-start gap-3">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                    <FileSignature className="size-5" />
                                </div>

                                <div className="min-w-0">
                                    <h2 className="text-xl font-extrabold text-slate-950">
                                        Automatische Dokumente
                                    </h2>
                                    <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                                        Prüfung der erzeugbaren Verkaufsdokumente inklusive Pflichtdaten,
                                        Unterschriftenstatus und vorhandenen Dateien.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[390px]">
                            <SummaryStat
                                label="Erzeugt"
                                value={generatedCount}
                                tone="info"
                            />
                            <SummaryStat
                                label="Unterschrieben"
                                value={signedCount}
                                tone="success"
                            />
                            <SummaryStat
                                label="Daten fehlen"
                                value={missingDataCount}
                                tone={missingDataCount > 0 ? "danger" : "success"}
                            />
                        </div>
                    </div>
                </div>

                <div className="divide-y-2 divide-slate-900/20">
                    {documents.map((document) => (
                        <GeneratedDocumentRow
                            key={document.type}
                            saleId={saleId}
                            document={document}
                            wasJustGenerated={generatedDocumentType === document.type}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function GeneratedDocumentRow({
                                  saleId,
                                  document,
                                  wasJustGenerated,
                              }: {
    saleId: string;
    document: SaleGeneratedDocumentCheck;
    wasJustGenerated: boolean;
}) {
    const isAutomaticDocument = document.generationMode === "automatic";
    const canGenerateNow = document.canGenerate && isAutomaticDocument;
    const showMissingFields = document.status === "missing_data";
    const showSignatureStatus =
        document.requiresSignature &&
        (isAutomaticDocument ||
            Boolean(document.generatedDocument) ||
            Boolean(document.signedDocument));

    return (
        <div id={`document-${document.documentType}`} className="scroll-mt-28 bg-white p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="rounded-3xl border border-slate-900/20 bg-slate-50/70 p-4">
                        <DocumentCard
                            className="border-0 bg-transparent p-0 shadow-none"
                            icon={<DocumentIcon status={document.status} />}
                            title={<span className="text-xl font-extrabold text-slate-950">{document.label}</span>}
                            description={document.description}
                            status={
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <StatusBadge tone={document.statusTone}>
                                        {document.statusLabel}
                                    </StatusBadge>

                                    {showSignatureStatus ? (
                                        <StatusBadge tone="warning">
                                            Unterschrift nötig
                                        </StatusBadge>
                                    ) : (
                                        <StatusBadge tone="neutral">
                                            {document.requiresSignature
                                                ? "Kein Rücklauf hier"
                                                : "Keine Unterschrift"}
                                        </StatusBadge>
                                    )}

                                    {document.generationMode !== "automatic" ? (
                                        <StatusBadge
                                            tone={
                                                document.generationMode === "not_relevant"
                                                    ? "neutral"
                                                    : "info"
                                            }
                                        >
                                            {getGenerationModeLabel(document)}
                                        </StatusBadge>
                                    ) : null}
                                </div>
                            }
                        />
                    </div>

                    {wasJustGenerated ? (
                        <TemporarySuccessMessage
                            title="Dokument wurde erfolgreich erzeugt."
                            description="Die PDF wurde gespeichert und ist jetzt in der Verkaufsakte verfügbar."
                            durationMs={3000}
                        />
                    ) : null}

                    {showMissingFields ? (
                        <div className="mt-4 rounded-3xl border border-red-100 bg-red-50 p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-extrabold text-red-800">
                                        Dieses Dokument kann noch nicht erzeugt werden.
                                    </p>

                                    <ul className="mt-2 space-y-1">
                                        {document.missingFields.map((field) => (
                                            <li
                                                key={`${document.type}-${field.field}`}
                                                className="text-xs font-semibold text-red-700"
                                            >
                                                {field.message}
                                            </li>
                                        ))}
                                    </ul>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {document.missingFields.some((field) =>
                                            field.field.startsWith("export."),
                                        ) ? (
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl border-red-200 bg-white font-extrabold text-red-700 hover:bg-red-100"
                                            >
                                                <Link href="#export-details">
                                                    <PencilLine className="mr-2 size-3.5" />
                                                    Exportdaten ergänzen
                                                </Link>
                                            </Button>
                                        ) : null}

                                        {document.missingFields.some((field) =>
                                            field.field.startsWith("customer."),
                                        ) ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-red-700">
                                                    Kundendaten wie USt-ID bitte im Kundenstamm ergänzen.
                                                </div>

                                                {document.customerId ? (
                                                    <Button
                                                        asChild
                                                        variant="outline"
                                                        size="sm"
                                                        className="rounded-xl border-red-200 bg-white font-extrabold text-red-700 hover:bg-red-100"
                                                    >
                                                        <Link href={`/dashboard/customers/${document.customerId}`}>
                                                            <UserRoundCog className="mr-2 size-3.5" />
                                                            Kundendaten öffnen
                                                        </Link>
                                                    </Button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 border-t-2 border-slate-900/20 pt-4 md:grid-cols-2">
                        <DocumentFileStatus
                            title="Generiertes Dokument"
                            document={document.generatedDocument}
                            emptyText={getGeneratedDocumentEmptyText(document)}
                        />

                        {showSignatureStatus ? (
                            <DocumentFileStatus
                                title="Unterschriebenes Dokument"
                                document={document.signedDocument}
                                emptyText="Noch nicht unterschrieben hochgeladen."
                            />
                        ) : (
                            <div className="rounded-2xl border border-slate-900/15 bg-slate-50 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400">
                                        <Info className="size-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            Unterschrift
                                        </p>
                                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                            {getSignatureInfoText(document)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {isAutomaticDocument && document.requiresSignature && document.generatedDocument ? (
                        <div className="mt-4 rounded-3xl border border-slate-900/20 bg-slate-50 p-4">
                            <p className="text-sm font-extrabold text-slate-950">
                                Unterschriebenes Dokument hochladen
                            </p>
                            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                Lade hier die vom Kunden unterschriebene Version hoch. Danach gilt der Rücklauf als vorhanden.
                            </p>

                            <div className="mt-4">
                                <SaleDocumentUploadForm
                                    saleId={saleId}
                                    documentType={document.documentType}
                                    documentLabel={`${document.label} unterschrieben`}
                                    existingDocumentId={document.signedDocument?.id ?? null}
                                    existingFileName={document.signedDocument?.fileName ?? null}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-col gap-2 border-t-2 border-slate-900/20 pt-4 xl:w-48 xl:border-t-0 xl:pl-4 xl:pt-0">
                    {isAutomaticDocument ? (
                        <form action={generateSaleDocumentAction}>
                            <input type="hidden" name="sale_id" value={saleId} />
                            <input type="hidden" name="document_type" value={document.type} />

                            {document.dateSuggestion ? (
                                <div className="mb-2 rounded-2xl border border-slate-900/20 bg-cyan-50 p-3 text-xs font-bold leading-5 text-cyan-900">
                                    <p>{document.dateSuggestion.explanation}</p>
                                    <label className="mt-2 block text-slate-700">
                                        Dokumentdatum
                                        <input
                                            type="date"
                                            name="document_date"
                                            defaultValue={
                                                document.dateSuggestion.suggestedDate ?? ""
                                            }
                                            className="mt-1 h-9 w-full rounded-xl border border-cyan-200 bg-white px-3 text-sm font-semibold text-slate-950"
                                            required={
                                                document.type === "handover_protocol" ||
                                                document.dateSuggestion.suggestedDate === null
                                            }
                                        />
                                    </label>
                                </div>
                            ) : null}

                            <GenerateSaleDocumentSubmitButton
                                disabled={!canGenerateNow}
                                isGenerated={Boolean(document.generatedDocument?.id)}
                            />
                        </form>
                    ) : (
                        <DocumentContextAction document={document} />
                    )}

                </div>
            </div>
        </div>
    );
}

function getGenerationModeLabel(document: SaleGeneratedDocumentCheck): string {
    if (document.generationMode === "external") {
        return document.type === "proforma_invoice"
            ? "Über Rechnungsbereich"
            : "Über Rechnungsbereich";
    }

    if (document.generationMode === "planned") {
        return "Generator folgt";
    }

    if (document.generationMode === "not_relevant") {
        return "Für diesen Verkauf nicht relevant";
    }

    return "Automatisch erzeugbar";
}

function getGeneratedDocumentEmptyText(
    document: SaleGeneratedDocumentCheck,
): string {
    if (document.generationMode === "external") {
        return document.type === "proforma_invoice"
            ? "Proforma-Rechnungen werden im Bereich „Rechnungen & Zahlung“ erzeugt."
            : "Rechnungen werden im Bereich „Rechnungen & Zahlung“ erzeugt.";
    }

    if (document.generationMode === "planned") {
        return "Der Generator für dieses Dokument ist vorbereitet, aber noch nicht umgesetzt.";
    }

    if (document.generationMode === "not_relevant") {
        return "Dieses Dokument ist für diesen Verkaufstyp nicht erforderlich.";
    }

    if (document.canGenerate) {
        return "Noch nicht erzeugt.";
    }

    return "Erzeugung erst nach vollständigen Pflichtdaten möglich.";
}

function getSignatureInfoText(document: SaleGeneratedDocumentCheck): string {
    if (document.generationMode === "planned") {
        return "Ein Rücklauf wird erst relevant, sobald der Generator verfügbar ist.";
    }

    if (document.generationMode === "not_relevant") {
        return "Für diesen Verkauf ist kein Rücklauf für dieses Dokument vorgesehen.";
    }

    if (document.generationMode === "external") {
        return "Der weitere Ablauf erfolgt im zuständigen Bereich.";
    }

    return "Für dieses Dokument ist kein unterschriebener Rücklauf vorgesehen.";
}

function DocumentContextAction({
                                   document,
                               }: {
    document: SaleGeneratedDocumentCheck;
}) {
    if (document.externalActionHref && document.externalActionLabel) {
        return (
            <Button
                asChild
                variant="outline"
                className="h-11 rounded-2xl border-cyan-200 bg-cyan-50 font-bold text-cyan-800 hover:bg-cyan-100"
            >
                <Link href={document.externalActionHref}>
                    {document.externalActionLabel}
                </Link>
            </Button>
        );
    }

    if (document.generationMode === "not_relevant") {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-extrabold leading-5 text-slate-500">
                Keine Aktion nötig
            </div>
        );
    }

    return null;
}

function DocumentFileStatus({
                                title,
                                document,
                                emptyText,
                            }: {
    title: string;
    document: SaleGeneratedDocumentCheck["generatedDocument"];
    emptyText: string;
}) {
    if (!document) {
        return (
            <div className="rounded-2xl border border-slate-900/15 bg-slate-50 p-4">
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
        <Link
            href={`/api/documents/${document.id}/file`}
            target="_blank"
            className="block rounded-2xl border border-slate-900/20 bg-emerald-50 p-4 transition hover:-translate-y-0.5 hover:border-slate-900/30 hover:bg-emerald-100 hover:shadow-sm"
        >
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700">
                    <FileCheck2 className="size-4" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-extrabold text-emerald-900">
                        {title}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold leading-5 text-emerald-800">
                        {document.fileName}
                    </p>
                </div>
            </div>
        </Link>
    );
}

function DocumentIcon({
                          status,
                      }: {
    status: SaleGeneratedDocumentCheck["status"];
}) {
    if (status === "missing_data") {
        return <AlertTriangle className="size-5 text-red-600" />;
    }

    if (status === "signed_received" || status === "generated_available") {
        return <CheckCircle2 className="size-5 text-emerald-700" />;
    }

    return <FileText className="size-5 text-cyan-700" />;
}

function SummaryStat({
                         label,
                         value,
                         tone,
                     }: {
    label: string;
    value: number;
    tone: "success" | "danger" | "info";
}) {
    const toneClasses = {
        success: {
            wrapper: "border-emerald-100 bg-emerald-50 text-emerald-900",
            value: "text-emerald-950",
            label: "text-emerald-700",
        },
        danger: {
            wrapper: "border-red-100 bg-red-50 text-red-900",
            value: "text-red-950",
            label: "text-red-700",
        },
        info: {
            wrapper: "border-cyan-100 bg-cyan-50 text-cyan-900",
            value: "text-cyan-950",
            label: "text-cyan-700",
        },
    };

    const classes = toneClasses[tone];

    return (
        <div
            className={`flex min-h-[78px] min-w-0 flex-col items-center justify-center rounded-[1.35rem] border px-3 py-3 text-center shadow-sm ${classes.wrapper}`}
        >
            <p className={`text-2xl font-black leading-none ${classes.value}`}>
                {value}
            </p>
            <p
                className={`mt-2 max-w-full break-words text-center text-[10px] font-extrabold uppercase leading-4 tracking-[0.08em] ${classes.label}`}
            >
                {label}
            </p>
        </div>
    );
}
