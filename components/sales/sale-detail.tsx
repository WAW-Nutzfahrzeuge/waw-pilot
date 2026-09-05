import Link from "next/link";
import {
    ArrowLeft,
    CheckCircle2,
    Download,
    ExternalLink,
    FileText,
    FileCheck2,
    FileWarning,
    Mail,
    Receipt,
    Route,
    Truck,
    UserRound,
    Wallet,
} from "lucide-react";
import { SaleDocumentUploadForm } from "@/components/sales/sale-document-upload-form";
import type {
    SaleDetail as SaleDetailType,
    SaleDetailInvoice,
} from "@/lib/sales/sale-detail-queries";
import { SaleInvoiceTypeActions } from "@/components/sales/sale-invoice-type-actions";
import { getInvoiceTypeLabel } from "@/lib/invoices/invoice-numbering";
import { SaleGeneratedDocumentsCard } from "@/components/sales/sale-generated-documents-card";
import type { SaleGeneratedDocumentCheck } from "@/lib/pdf/generated-documents/sale-document-checks";
import {
    getDatevStatusLabel,
    getDatevStatusTone,
    getPaymentStatusLabel,
    getPaymentStatusTone,
    getSaleTypeLabel,
    getSaleTypeTone,
} from "@/lib/sales/sale-helpers";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { getDocumentTypeLabel } from "@/lib/documents/document-helpers";
import { ExportFileNamePolicy } from "@/src/modules/documents/domain/policies/export-file-name-policy";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { BzstVatValidationLink } from "@/components/shared/bzst-vat-validation-link";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SaleExportDetailsForm } from "@/components/sales/sale-export-details-form";
import type { SaleExportDetails } from "@/lib/sales/sale-export-details-queries";
import { FlashMessage } from "@/components/shared/flash-message";
import { DeleteSaleDocumentForm } from "@/components/sales/delete-sale-document-form";
import { TemporaryHighlight } from "@/components/shared/temporary-highlight";
import { RegenerateInvoicePdfForm } from "@/components/sales/regenerate-invoice-pdf-form";
import { SendInvoiceEmailForm } from "@/components/sales/send-invoice-email-form";
import { SendInvoiceDatevEmailForm } from "@/components/sales/send-invoice-datev-email-form";
import { SendStampDocumentsDialog } from "@/components/sales/send-stamp-documents-dialog";
import { ZugferdInvoiceActions } from "@/components/sales/zugferd-invoice-actions";
import { SalePaymentsCard } from "@/components/sales/sale-payments-card";
import { SaleCorrectionsCard } from "@/components/sales/sale-corrections-card";
import { DownloadSaleFileButton } from "@/components/sales/download-sale-file-button";
import type { EmailListItemDto } from "@/src/modules/email/application/dto/email.dto";
import { EmailHistoryTable } from "@/src/modules/email/presentation/components/email-history-table";
import { GetVatVerificationRequirementUseCase } from "@/src/modules/documents/application/use-cases/get-vat-verification-requirement.use-case";
import { BzstVatVerificationCard } from "@/src/modules/documents/presentation/components/bzst-vat-verification-card";
import {
    SaleCustomerEditDialog,
    SaleVehicleEditDialog,
} from "@/components/sales/sale-record-edit-dialogs";
import {
    getSaleDocumentStatus,
    getSaleDocumentStatusLabel,
} from "@/utils/sale-document-status";

type SaleDetailProps = {
    sale: SaleDetailType;
    generatedDocuments: SaleGeneratedDocumentCheck[];
    exportDetails: SaleExportDetails;
    emailHistory: EmailListItemDto[];
    emailHistoryHasMore: boolean;
    isZugferdServiceConfigured: boolean;
    generatedDocumentType?: string | null;
    invoiceCreatedNumber?: string | null;
    invoiceRegeneratedNumber?: string | null;
    invoiceEmailSent?: string | null;
    invoiceEmailError?: string | null;
    datevInvoiceSent?: boolean;
    datevInvoiceError?: string | null;
    stampEmailSent?: string | null;
    zugferdCreated?: boolean;
    zugferdEmailSent?: string | null;
    zugferdError?: string | null;
    zugferdMissingFields?: string[];
    highlightInvoiceId?: string | null;
    documentUploaded?: boolean;
    documentDeleted?: boolean;
    travelExpenseCreated?: boolean;
    exportDataSaved?: boolean;
    exportDataError?: boolean;
    exportArrivalError?: boolean;
    paymentSaved?: string | null;
    paymentError?: string | null;
    cancellationCreated?: string | null;
    refundCreated?: string | null;
    correctionError?: string | null;
    recordSaved?: string | null;
    recordError?: string | null;
};

function getSaleDocumentDisplayFileName(
    document: SaleDetailType["documents"][number] | null,
    saleNumber: string | null,
): string | null {
    if (!document) return null;
    if (document.source !== "generated") return document.file_name;

    return new ExportFileNamePolicy().createDocumentFileName({
        saleReference: saleNumber ?? "ohne-nummer",
        documentType: document.document_type,
        mimeType: document.mime_type,
    });
}

export async function SaleDetail({
                               sale,
                               generatedDocuments,
                               exportDetails,
                               emailHistory,
                               emailHistoryHasMore,
                               isZugferdServiceConfigured,
                               generatedDocumentType = null,
                               invoiceCreatedNumber = null,
                               invoiceRegeneratedNumber = null,
                               invoiceEmailSent = null,
                               invoiceEmailError = null,
                               datevInvoiceSent = false,
                               datevInvoiceError = null,
                               stampEmailSent = null,
                               zugferdCreated = false,
                               zugferdEmailSent = null,
                               zugferdError = null,
                               zugferdMissingFields = [],
                               highlightInvoiceId = null,
                               documentUploaded = false,
                               documentDeleted = false,
                               travelExpenseCreated = false,
                               exportDataSaved = false,
                               exportDataError = false,
                               exportArrivalError = false,
                               paymentSaved = null,
                               paymentError = null,
                               cancellationCreated = null,
                               refundCreated = null,
                               correctionError = null,
                               recordSaved = null,
                               recordError = null,
                           }: SaleDetailProps) {
    const missingRequirementLabels = [
        ...sale.missing_required_labels,
        ...sale.missing_required_data_labels,
    ];
    const missingRequirementCount = missingRequirementLabels.length;
    const saleDocumentStatus = getSaleDocumentStatus({
        missingRequiredDocuments: sale.missing_required_labels.length,
        missingRequiredData: sale.missing_required_data_labels.length,
    });
    const isRequirementComplete = saleDocumentStatus === "complete";
    const existingInvoiceTypes = sale.invoices.map(
        (invoice) => invoice.invoice_type,
    );
    const showBzstVerification = new GetVatVerificationRequirementUseCase().execute({
        saleType: sale.sale_type,
        buyerType: sale.customer.type,
    });
    const travelExpenseSearchParams = new URLSearchParams({
        saleId: sale.id,
        vehicleId: sale.vehicle.id,
        customerId: sale.customer.id,
    });
    const travelExpenseHref = `/dashboard/travel-expenses/new?${travelExpenseSearchParams.toString()}`;
    const visibleDocuments = sale.documents.filter(
        (document) => document.status !== "missing",
    );

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Verkaufsakte"
                title={`Verkauf ${sale.sale_number ?? sale.invoice?.invoice_number ?? sale.vehicle.name}`}
                description="Detailansicht mit Kunde, Fahrzeug, Rechnungen, Zahlung und Pflichtdokumenten."
                action={
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                        <DownloadSaleFileButton saleId={sale.id} />
                        <Button
                            asChild
                            variant="outline"
                            className="h-11 rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/sales">
                                <ArrowLeft className="mr-2 size-4" />
                                Zurück
                            </Link>
                        </Button>
                    </div>
                }
            />

            {invoiceCreatedNumber ? (
                <FlashMessage
                    message="Rechnung wurde erstellt."
                    description={`Rechnung ${invoiceCreatedNumber} ist unten im Bereich „Rechnungen & Zahlung“ verfügbar und kann dort geöffnet oder heruntergeladen werden.`}
                />
            ) : null}

            {invoiceRegeneratedNumber ? (
                <FlashMessage
                    message="Rechnung wurde neu generiert."
                    description={`Die aktualisierte PDF für Rechnung ${invoiceRegeneratedNumber} ist unten im Bereich „Rechnungen & Zahlung“ verfügbar.`}
                />
            ) : null}

            {invoiceEmailSent ? (
                <FlashMessage
                    message="Rechnung wurde per E-Mail gesendet."
                    description={`Rechnung wurde per E-Mail an ${invoiceEmailSent} gesendet.`}
                />
            ) : null}

            {invoiceEmailError ? (
                <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                            <FileWarning className="size-5" />
                        </div>
                        <div>
                            <p className="font-extrabold text-red-950">
                                Rechnung konnte nicht per E-Mail gesendet werden.
                            </p>
                            <p className="mt-1 text-sm font-semibold text-red-800">
                                {getInvoiceEmailErrorMessage(invoiceEmailError)}
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {datevInvoiceSent ? (
                <FlashMessage
                    message="Rechnung wurde an DATEV gesendet."
                    description="Die normale Rechnung wurde separat an die DATEV-Upload-Adresse gesendet."
                />
            ) : null}

            {datevInvoiceError ? (
                <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                            <FileWarning className="size-5" />
                        </div>
                        <div>
                            <p className="font-extrabold text-red-950">
                                Rechnung konnte nicht an DATEV gesendet werden.
                            </p>
                            <p className="mt-1 text-sm font-semibold text-red-800">
                                {getDatevInvoiceErrorMessage(datevInvoiceError)}
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {stampEmailSent ? (
                <FlashMessage
                    message="E-Mail wurde erfolgreich versendet."
                    description="Die Dokumente zum Stempeln wurden an den Kunden gesendet."
                />
            ) : null}

            {cancellationCreated ? (
                <FlashMessage
                    message="Stornorechnung wurde erstellt."
                    description={`Stornorechnung ${cancellationCreated} ist im Bereich „Rechnungskorrekturen“ verfügbar.`}
                />
            ) : null}

            {refundCreated ? (
                <FlashMessage
                    message="Rückzahlung wurde erfasst."
                    description={`Rückzahlung ${refundCreated} wurde gespeichert und im Finanzjournal berücksichtigt.`}
                />
            ) : null}

            {correctionError ? (
                <FlashMessage
                    tone="danger"
                    durationMs={5000}
                    message="Rechnungskorrektur konnte nicht gespeichert werden."
                    description={getCorrectionErrorMessage(correctionError)}
                />
            ) : null}

            {zugferdCreated ? (
                <FlashMessage message="ZUGFeRD-Rechnung wurde erstellt und geprüft." />
            ) : null}

            {zugferdEmailSent ? (
                <FlashMessage
                    message="ZUGFeRD-Rechnung wurde per E-Mail gesendet."
                    description={`ZUGFeRD-Rechnung wurde per E-Mail an ${zugferdEmailSent} gesendet.`}
                />
            ) : null}

            {zugferdError ? (
                <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                            <FileWarning className="size-5" />
                        </div>
                        <div>
                            <p className="font-extrabold text-red-950">
                                {getZugferdErrorTitle(zugferdError)}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-red-800">
                                {getZugferdErrorMessage(zugferdError)}
                            </p>
                            {zugferdMissingFields.length > 0 ? (
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-red-800">
                                    {zugferdMissingFields.map((field) => (
                                        <li key={field}>{field}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {documentDeleted ? (
                <FlashMessage
                    message="Dokument wurde gelöscht."
                    description="Das Pflichtdokument wurde aus der Verkaufsakte entfernt und kann bei Bedarf neu hochgeladen werden."
                />
            ) : null}

            {documentUploaded ? (
                <FlashMessage
                    message="Dokument wurde hochgeladen."
                    description="Das Dokument wurde gespeichert und der Verkaufsakte zugeordnet."
                />
            ) : null}

            {generatedDocumentType ? (
                <FlashMessage
                    message="Dokument wurde erfolgreich erzeugt."
                    description="Die PDF wurde gespeichert und ist unten im Bereich „Automatische Dokumente“ verfügbar."
                />
            ) : null}

            {travelExpenseCreated ? (
                <FlashMessage
                    message="Reisekosten wurden erfasst."
                    description="Das Reisekostenformular wurde erzeugt und mit dieser Verkaufsakte verknüpft."
                />
            ) : null}

            {exportDataSaved ? (
                <FlashMessage message="Export- / Verbringungsdaten wurden gespeichert." />
            ) : null}

            {exportDataError ? (
                <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                            <FileWarning className="size-5" />
                        </div>
                        <div>
                            <p className="font-extrabold text-red-950">
                                Bitte fülle alle Export- / Verbringungsdaten aus.
                            </p>
                            <p className="mt-1 text-sm font-semibold text-red-800">
                                Zielort, Zielland, Gelangensmonat, Gelangensjahr,
                                Übergabedatum und Art der Verbringung sind erforderlich.
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {exportArrivalError ? (
                <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                            <FileWarning className="size-5" />
                        </div>
                        <div>
                            <p className="font-extrabold text-red-950">
                                Monat des Gelangens ist ungültig.
                            </p>
                            <p className="mt-1 text-sm font-semibold text-red-800">
                                Erlaubt ist nur der Verkaufsmonat oder der unmittelbar folgende Monat.
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}

            {paymentSaved ? (
                <FlashMessage
                    message={getPaymentSavedMessage(paymentSaved)}
                    description="Zahlungsstatus, Summen und Historie wurden aktualisiert."
                />
            ) : null}

            {paymentError ? (
                <FlashMessage
                    tone="danger"
                    durationMs={5000}
                    message="Zahlung konnte nicht gespeichert werden."
                    description={getPaymentErrorMessage(paymentError)}
                />
            ) : null}

            {recordSaved ? (
                <FlashMessage
                    message={recordSaved === "customer" ? "Kundendaten wurden gespeichert." : "Fahrzeugdaten wurden gespeichert."}
                    description="Die Verkaufsakte zeigt die aktualisierten Stammdaten. Bereits erzeugte Rechnungs-PDFs bleiben unverändert."
                />
            ) : null}

            {recordError ? (
                <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 shadow-sm">
                    <p className="font-extrabold text-red-950">
                        Stammdaten konnten nicht gespeichert werden.
                    </p>
                    <p className="mt-1 text-sm font-semibold text-red-800">
                        {getRecordErrorMessage(recordError)}
                    </p>
                </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailStatCard
                    label="Verkaufstyp"
                    value={getSaleTypeLabel(sale.sale_type)}
                    description={formatDate(sale.sale_date)}
                    icon={Receipt}
                    tone={getSaleTypeTone(sale.sale_type)}
                />
                <DetailStatCard
                    label="Aktenstatus"
                    value={getSaleDocumentStatusLabel(saleDocumentStatus)}
                    description="aus Pflichtdokumenten berechnet"
                    icon={CheckCircle2}
                    tone={isRequirementComplete ? "success" : "danger"}
                />
                <DetailStatCard
                    label="Zahlung"
                    value={getPaymentStatusLabel(sale.payment_status)}
                    description={formatCurrency(sale.gross_amount)}
                    icon={Wallet}
                    tone={getPaymentStatusTone(sale.payment_status)}
                />
                <DetailStatCard
                    label="Pflichtdokumente"
                    value={`${sale.available_required_documents_count} von ${sale.required_documents_count}`}
                    description={
                        isRequirementComplete
                            ? "Verkaufsakte vollständig"
                            : `${missingRequirementCount} Anforderungen offen`
                    }
                    icon={FileWarning}
                    tone={isRequirementComplete ? "success" : "danger"}
                />
            </section>

            <section className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="space-y-6">
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <SectionTitle
                                    icon={UserRound}
                                    title="Kunde"
                                    description="Käuferdaten aus der Verkaufsakte."
                                />
                                <SaleCustomerEditDialog
                                    saleId={sale.id}
                                    customer={sale.customer}
                                />
                            </div>

                            <div className="mt-5 space-y-3">
                                <InfoRow label="Name" value={sale.customer.name} />
                                <InfoRow
                                    label="Adresse"
                                    value={[
                                        sale.customer.street,
                                        [sale.customer.postal_code, sale.customer.city]
                                            .filter(Boolean)
                                            .join(" "),
                                        sale.customer.country,
                                    ]
                                        .filter(Boolean)
                                        .join(", ")}
                                />
                                <InfoRow label="E-Mail" value={sale.customer.email ?? "—"} />
                                <InfoRow label="Telefon" value={sale.customer.phone ?? "—"} />
                                <InfoRow
                                    label="Steuernummer"
                                    value={sale.customer.tax_number ?? "—"}
                                />
                                <InfoRow label="USt-ID" value={sale.customer.vat_id ?? "—"} />
                                <BzstVatValidationLink />
                            </div>

                            {showBzstVerification ? (
                                <BzstVatVerificationCard
                                    saleId={sale.id}
                                    vatId={sale.customer.vat_id}
                                    documents={sale.documents}
                                />
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <SectionTitle
                                    icon={Truck}
                                    title="Fahrzeug"
                                    description="Fahrzeugdaten und Rohgewinn."
                                />
                                <SaleVehicleEditDialog
                                    saleId={sale.id}
                                    vehicle={sale.vehicle}
                                />
                            </div>

                            <div className="mt-5 space-y-3">
                                <InfoRow label="Fahrzeug" value={sale.vehicle.name} />
                                <InfoRow label="Fahrzeugtyp" value={sale.vehicle.vehicle_type} />
                                <InfoRow label="VIN" value={sale.vehicle.vin} />
                                <InfoRow
                                    label="Kennzeichen"
                                    value={sale.vehicle.license_plate ?? "—"}
                                />
                                <InfoRow
                                    label="Baujahr"
                                    value={sale.vehicle.construction_year?.toString() ?? "—"}
                                />
                                <InfoRow
                                    label="Einkauf netto"
                                    value={formatCurrency(sale.vehicle.purchase_price_net)}
                                />
                                <InfoRow
                                    label="Nebenkosten netto"
                                    value={formatCurrency(sale.vehicle.additional_costs_net)}
                                />
                                <InfoRow
                                    label="Rohgewinn netto"
                                    value={formatCurrency(sale.profit_net)}
                                    strong
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card
                        id="required-documents"
                        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm"
                    >
                        <CardContent className="p-5">
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <SectionTitle
                                    icon={Route}
                                    title="Reisekosten & Nebenkosten"
                                    description="Erfasse Fahrtkosten, Hotel, Verpflegung oder sonstige Kosten zu diesem Verkauf."
                                />
                                <div className="flex shrink-0 items-center rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-cyan-700">
                                    Verkaufsbezug
                                </div>
                            </div>

                            <p className="mt-4 text-sm font-medium leading-6 text-slate-600">
                                Diese Kosten können später für Auswertung, Dokumentation und Abrechnung genutzt werden.
                            </p>

                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <Button
                                    asChild
                                    className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                                >
                                    <Link href={travelExpenseHref}>
                                        <Route className="mr-2 size-4" />
                                        Reisekosten erfassen
                                    </Link>
                                </Button>

                                <Button
                                    asChild
                                    variant="outline"
                                    className="rounded-2xl border-slate-200 bg-white font-bold"
                                >
                                    <Link href="/dashboard/travel-expenses">
                                        Alle Reisekosten öffnen
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                    </div>

                    <div className="space-y-6">
                        <Card
                            id="invoice-payments"
                            className="scroll-mt-24 rounded-[1.75rem] border border-slate-900/20 bg-white/90 shadow-sm"
                        >
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={Receipt}
                                    title="Rechnungen & Zahlung"
                                    description="Normale Rechnung, Proforma-Rechnung und PDF."
                                />

                                <SaleInvoiceTypeActions
                                    saleId={sale.id}
                                    existingInvoiceTypes={existingInvoiceTypes}
                                    damageNotes={sale.vehicle.damage_notes}
                                    allowDamageNotesOnInvoice={Boolean(sale.vehicle.damage_notes?.trim())}
                                    includeDamageNotesOnInvoice={
                                        sale.include_damage_notes_on_invoice
                                    }
                                    hasSignatureStampAssets={sale.has_signature_stamp_assets}
                                    initialIncludeSignatureStamp={sale.invoices.some(
                                        (invoice) => invoice.include_signature_stamp,
                                    )}
                                />

                                {sale.invoices.length > 0 ? (
                                    <div className="mt-6 divide-y-2 divide-slate-900/20">
                                        {sale.invoices.map((invoice) => (
                                            <div key={invoice.id} className="py-5 first:pt-0 last:pb-0">
                                                <InvoiceCard
                                                    saleId={sale.id}
                                                    invoice={invoice}
                                                    datevStatus={sale.datev_status}
                                                    highlighted={highlightInvoiceId === invoice.id}
                                                    isZugferdServiceConfigured={
                                                        isZugferdServiceConfigured
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="mt-6 border-t-2 border-slate-900/20 pt-5">
                                        <EmptyBox text="Für diesen Verkauf wurde noch keine Rechnung erzeugt." />
                                    </div>
                                )}

                                <div className="mt-6 border-t-2 border-slate-900/30 pt-6">
                                    <SaleCorrectionsCard
                                        saleId={sale.id}
                                        originalInvoice={
                                            sale.invoices.find(
                                                (invoice) => invoice.invoice_type === "standard",
                                            ) ?? null
                                        }
                                        invoices={sale.invoices}
                                        refunds={sale.refunds}
                                        summary={sale.correction_summary}
                                    />
                                </div>

                                <div className="mt-6 border-t-2 border-slate-900/30 pt-6">
                                    <SalePaymentsCard
                                        saleId={sale.id}
                                        totalAmount={sale.gross_amount}
                                        paidAmount={sale.paid_amount}
                                        remainingAmount={sale.remaining_amount}
                                        paymentStatus={sale.payment_status}
                                        payments={sale.payments}
                                    />
                                </div>

                                <div className="mt-6 border-t-2 border-slate-900/30 pt-6">
                                    <SectionTitle
                                        icon={Mail}
                                        title="Versandhistorie"
                                        description="Per E-Mail gesendete Rechnungen und Dokumente aus dieser Verkaufsakte."
                                    />
                                    <div className="mt-4">
                                        <EmailHistoryTable
                                            key={emailHistory[0]?.id ?? "empty"}
                                            emails={emailHistory}
                                            saleId={sale.id}
                                            hasMore={emailHistoryHasMore}
                                            emptyText="Für diese Verkaufsakte wurden noch keine E-Mails versendet."
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="mx-auto w-full space-y-6">

                    <SaleExportDetailsForm details={exportDetails} />

                    {generatedDocuments.length > 0 ? (
                        <SaleGeneratedDocumentsCard
                            saleId={sale.id}
                            saleNumber={sale.sale_number}
                            documents={generatedDocuments}
                            generatedDocumentType={generatedDocumentType}
                        />
                    ) : null}

                    <Card className="overflow-hidden rounded-[1.75rem] border border-slate-900/20 bg-white/90 shadow-sm">
                        <CardContent className="p-0">
                            <div className="border-b-2 border-slate-900 p-5">
                                <SectionTitle
                                    icon={FileWarning}
                                    title="Pflichtdokumente"
                                    description="Fehlende Unterlagen direkt hochladen und automatisch der Verkaufsakte zuordnen."
                                />

                                {sale.sale_type !== "export_third_country" ? (
                                    <div className="mt-4">
                                        <SendStampDocumentsDialog
                                            saleId={sale.id}
                                            saleType={sale.sale_type}
                                            customer={{
                                                name: sale.customer.name,
                                                email: sale.customer.email,
                                                preferred_language:
                                                    sale.customer.preferred_language,
                                                country: sale.customer.country,
                                            }}
                                            vehicleLabel={sale.vehicle.name}
                                            documents={sale.documents}
                                        />
                                    </div>
                                ) : null}

                                <div
                                    className={
                                        isRequirementComplete
                                            ? "mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-4"
                                            : "mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4"
                                    }
                                >
                                    <div className="flex items-start gap-3">
                                        {isRequirementComplete ? (
                                            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
                                        ) : (
                                            <FileWarning className="mt-0.5 size-5 shrink-0 text-amber-700" />
                                        )}

                                        <div>
                                            <p
                                                className={
                                                    isRequirementComplete
                                                        ? "font-extrabold text-emerald-950"
                                                        : "font-extrabold text-amber-950"
                                                }
                                            >
                                                {isRequirementComplete
                                                    ? "Pflichtanforderungen vollständig"
                                                    : `${sale.required_documents_count - sale.missing_required_documents_count} von ${sale.required_documents_count} Pflichtdokumenten erfüllt, ${missingRequirementCount} Anforderung(en) offen`}
                                            </p>
                                            {isRequirementComplete ? (
                                                <p className="mt-1 text-sm font-semibold text-emerald-800">
                                                    Alle Pflichtdokumente und relevanten Kundendaten sind vorhanden.
                                                </p>
                                            ) : (
                                                <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                                                    Fehlt: {missingRequirementLabels.join(", ")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="divide-y-2 divide-slate-900/20">
                                {sale.required_documents.map((requiredDocument) => (
                                    <div
                                        key={requiredDocument.documentType}
                                        id={`document-${requiredDocument.documentType}`}
                                        className="bg-white p-5"
                                    >
                                        <div className="rounded-3xl border border-slate-900/15 bg-slate-50/70 p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    {requiredDocument.isAvailable ? (
                                                        <CheckCircle2 className="size-5 text-emerald-700" />
                                                    ) : (
                                                        <FileWarning className="size-5 text-amber-700" />
                                                    )}

                                                    <p className="font-extrabold text-slate-950">
                                                        {requiredDocument.label}
                                                    </p>
                                                </div>
                                                {requiredDocument.helperText ? (
                                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                                        {requiredDocument.helperText}
                                                    </p>
                                                ) : null}

                                                {requiredDocument.document ? (
                                                    <div className="mt-2 space-y-2">
                                                        <p className="text-sm font-semibold text-slate-600">
                                                            {getSaleDocumentDisplayFileName(
                                                                requiredDocument.document,
                                                                sale.sale_number,
                                                            )}
                                                        </p>

                                                        <div className="flex flex-wrap gap-2">
                                                            <Button
                                                                asChild
                                                                variant="outline"
                                                                size="sm"
                                                                className="rounded-xl font-bold"
                                                            >
                                                                <Link
                                                                    href={`/api/documents/${requiredDocument.document.id}/file`}
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
                                                                    href={`/api/documents/${requiredDocument.document.id}/file?download=1`}
                                                                >
                                                                    <Download className="mr-1 size-3.5" />
                                                                    Download
                                                                </Link>
                                                            </Button>

                                                            {requiredDocument.document.source === "uploaded" ? (
                                                                <DeleteSaleDocumentForm
                                                                    saleId={sale.id}
                                                                    documentId={requiredDocument.document.id}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <StatusBadge
                                                tone={requiredDocument.isAvailable ? "success" : "danger"}
                                            >
                                                {requiredDocument.isAvailable ? "Vorhanden" : "Fehlt"}
                                            </StatusBadge>
                                        </div>
                                        </div>

                                        {requiredDocument.uploadOptions ? (
                                            <div className="mt-4 grid gap-3 border-t-2 border-slate-900/20 pt-4 md:grid-cols-2">
                                                {requiredDocument.uploadOptions.map((uploadOption) => {
                                                    const isExistingOption =
                                                        requiredDocument.document?.document_type ===
                                                        uploadOption.documentType;

                                                    return (
                                                        <SaleDocumentUploadForm
                                                            key={uploadOption.documentType}
                                                            saleId={sale.id}
                                                            documentType={uploadOption.documentType}
                                                            documentLabel={uploadOption.label}
                                                                existingDocumentId={
                                                                    isExistingOption
                                                                        ? requiredDocument.document?.id ?? null
                                                                        : null
                                                                }
                                                            existingFileName={
                                                                isExistingOption
                                                                    ? getSaleDocumentDisplayFileName(
                                                                          requiredDocument.document,
                                                                          sale.sale_number,
                                                                      )
                                                                    : null
                                                            }
                                                        />
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="mt-4 border-t-2 border-slate-900/20 pt-4">
                                                <SaleDocumentUploadForm
                                                    saleId={sale.id}
                                                    documentType={requiredDocument.documentType}
                                                    documentLabel={requiredDocument.label}
                                                    existingDocumentId={requiredDocument.document?.id ?? null}
                                                    existingFileName={getSaleDocumentDisplayFileName(
                                                        requiredDocument.document,
                                                        sale.sale_number,
                                                    )}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
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
                                    title="Alle Dokumente"
                                    description="Alle Dokumente, die mit diesem Verkauf verknüpft sind."
                                />
                            </div>

                            {visibleDocuments.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {visibleDocuments.map((document) => (
                                        <div
                                            key={document.id}
                                            id={`document-${document.document_type}`}
                                            className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    {getSaleDocumentDisplayFileName(document, sale.sale_number)}
                                                </p>
                                                <p className="mt-1 text-sm font-medium text-slate-500">
                                                    {getDocumentTypeLabel(document.document_type)} · {document.status}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge
                                                    tone={document.status === "available" ? "success" : "warning"}
                                                >
                                                    {document.status === "available" ? "Verfügbar" : "Prüfen"}
                                                </StatusBadge>

                                                {document.file_path ? (
                                                    <>
                                                        <Button
                                                            asChild
                                                            variant="outline"
                                                            size="sm"
                                                            className="rounded-xl font-bold"
                                                        >
                                                            <Link href={`/api/documents/${document.id}/file`} target="_blank">
                                                                Öffnen
                                                            </Link>
                                                        </Button>

                                                        <Button
                                                            asChild
                                                            variant="outline"
                                                            size="sm"
                                                            className="rounded-xl font-bold"
                                                        >
                                                            <Link href={`/api/documents/${document.id}/file?download=1`}>
                                                                <Download className="mr-1 size-3.5" />
                                                                Download
                                                            </Link>
                                                        </Button>
                                                        {document.source === "uploaded" ? (
                                                            <DeleteSaleDocumentForm
                                                                saleId={sale.id}
                                                                documentId={document.id}
                                                            />
                                                        ) : null}
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyBox text="Noch keine Dokumente vorhanden." />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}

function InvoiceCard({
                         saleId,
                         invoice,
                         datevStatus,
                         highlighted,
                         isZugferdServiceConfigured,
                     }: {
    saleId: string;
    invoice: SaleDetailInvoice;
    datevStatus: SaleDetailType["datev_status"];
    highlighted?: boolean;
    isZugferdServiceConfigured: boolean;
}) {
    const hasValidatedZugferd =
        invoice.zugferd_validation_status === "valid" &&
        Boolean(invoice.zugferd_file_path);
    const hasUnvalidatedZugferd =
        Boolean(invoice.zugferd_file_path) && !hasValidatedZugferd;

    return (
        <TemporaryHighlight active={highlighted}>
        <div className="rounded-3xl border border-slate-900/20 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h3 className="text-lg font-extrabold leading-tight text-slate-950">
                        {getInvoiceTypeLabel(invoice.invoice_type)}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        {formatDate(invoice.invoice_date)}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={getPaymentStatusTone(invoice.payment_status)}>
                        {getPaymentStatusLabel(invoice.payment_status)}
                    </StatusBadge>

                    <StatusBadge tone={getDatevStatusTone(datevStatus)}>
                        {`DATEV: ${getDatevStatusLabel(datevStatus)}`}
                    </StatusBadge>
                </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
                <MiniAmount label="Netto" value={formatCurrency(invoice.net_amount)} />
                <MiniAmount label="MwSt." value={formatCurrency(invoice.vat_amount)} />
                <MiniAmount
                    label="Brutto"
                    value={formatCurrency(invoice.gross_amount)}
                />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
                <Button
                    asChild
                    variant="outline"
                    className="rounded-2xl bg-white font-bold"
                >
                    <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
                        <ExternalLink className="mr-2 size-4" />
                        PDF öffnen
                    </Link>
                </Button>

                <Button
                    asChild
                    className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                >
                    <Link href={`/api/invoices/${invoice.id}/pdf?download=1`}>
                        <Download className="mr-2 size-4" />
                        Herunterladen
                    </Link>
                </Button>

                <RegenerateInvoicePdfForm saleId={saleId} invoiceId={invoice.id} />

                <SendInvoiceEmailForm saleId={saleId} invoiceId={invoice.id} />

                {invoice.invoice_type === "standard" ? (
                    <SendInvoiceDatevEmailForm
                        saleId={saleId}
                        invoiceId={invoice.id}
                    />
                ) : null}

                {invoice.invoice_type !== "proforma" ? (
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl bg-white font-bold"
                    >
                        <a href="#payments">
                            <Wallet className="mr-2 size-4" />
                            Zahlung erfassen
                        </a>
                    </Button>
                ) : null}
            </div>

            {invoice.email_sent_at && invoice.email_sent_to ? (
                <p className="mt-3 text-xs font-bold text-slate-500">
                    Zuletzt gesendet am {formatDate(invoice.email_sent_at)} an{" "}
                    {invoice.email_sent_to}
                </p>
            ) : null}

            {invoice.invoice_type === "standard" ? (
                <div className="mt-5 rounded-3xl border border-cyan-100 bg-white p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <FileCheck2 className="size-4 text-cyan-700" />
                                <p className="font-extrabold text-slate-950">
                                    E-Rechnung (ZUGFeRD)
                                </p>
                            </div>
                            <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
                                Erstellt eine standardkonforme PDF/A-3-Rechnung mit eingebetteten XML-Rechnungsdaten.
                            </p>
                        </div>
                        {hasValidatedZugferd ? (
                            <StatusBadge tone="success">ZUGFeRD geprüft</StatusBadge>
                        ) : null}
                    </div>

                    {hasValidatedZugferd && invoice.zugferd_generated_at ? (
                        <p className="mt-3 text-xs font-bold text-slate-500">
                            Erstellt am {formatDate(invoice.zugferd_generated_at)}
                            {" · ZUGFeRD 2.5 · EN 16931 · PDF/A-3b"}
                        </p>
                    ) : null}

                    {hasUnvalidatedZugferd ? (
                        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                            Vorhandene ZUGFeRD-Datei ist nicht geprüft oder nicht
                            standardkonform. Bitte neu erstellen und prüfen.
                        </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                        <ZugferdInvoiceActions
                            saleId={saleId}
                            invoiceId={invoice.id}
                            isValidated={hasValidatedZugferd}
                            isServiceConfigured={isZugferdServiceConfigured}
                        />

                        {hasValidatedZugferd ? (
                            <Button
                                asChild
                                variant="outline"
                                className="rounded-2xl bg-white font-bold"
                            >
                                <Link href={`/api/invoices/${invoice.id}/zugferd`}>
                                    <Download className="mr-2 size-4" />
                                    ZUGFeRD herunterladen
                                </Link>
                            </Button>
                        ) : null}
                    </div>

                    {invoice.zugferd_email_sent_at &&
                    invoice.zugferd_email_sent_to ? (
                        <p className="mt-3 text-xs font-bold text-slate-500">
                            Zuletzt als ZUGFeRD gesendet am{" "}
                            {formatDate(invoice.zugferd_email_sent_at)} an{" "}
                            {invoice.zugferd_email_sent_to}
                        </p>
                    ) : null}

                    {!isZugferdServiceConfigured ? (
                        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                            ZUGFeRD-Erstellung ist noch nicht eingerichtet. Bitte
                            zuerst den validierenden ZUGFeRD-Service konfigurieren.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
        </TemporaryHighlight>
    );
}

function getInvoiceEmailErrorMessage(errorCode: string): string {
    const messages: Record<string, string> = {
        missingEmail:
            "Beim Kunden ist keine E-Mail-Adresse hinterlegt. Bitte ergänze zuerst die E-Mail-Adresse in den Kundendaten.",
        missingPdf:
            "Für diese Rechnung wurde noch kein PDF erzeugt. Bitte generiere zuerst das PDF.",
        mailNotConfigured:
            "E-Mail-Versand ist noch nicht eingerichtet. Bitte RESEND_API_KEY und die Rechnungs-Absender-E-Mail in den Einstellungen konfigurieren.",
        sendFailed:
            "Rechnung konnte nicht per E-Mail gesendet werden. Bitte versuche es erneut.",
    };

    return messages[errorCode] ?? messages.sendFailed;
}

function getDatevInvoiceErrorMessage(errorCode: string): string {
    const messages: Record<string, string> = {
        missingPdf:
            "Für diese Rechnung wurde noch kein PDF erzeugt. Bitte generiere zuerst das PDF.",
        standardOnly:
            "Der separate DATEV-Versand ist nur für normale Rechnungen verfügbar.",
        mailNotConfigured:
            "E-Mail-Versand ist noch nicht eingerichtet. Bitte die Rechnungs-Absender-E-Mail in den Einstellungen konfigurieren.",
        sendFailed:
            "Die Rechnung konnte nicht separat an DATEV gesendet werden. Bitte versuche es erneut.",
    };

    return messages[errorCode] ?? messages.sendFailed;
}

function getZugferdErrorTitle(errorCode: string): string {
    if (errorCode === "missingData") {
        return "ZUGFeRD konnte nicht erstellt werden.";
    }

    if (errorCode === "validationFailed") {
        return "ZUGFeRD konnte nicht validiert werden.";
    }

    if (errorCode === "zugferdSendFailed" || errorCode === "sendFailed") {
        return "ZUGFeRD-Rechnung konnte nicht per E-Mail gesendet werden.";
    }

    return "ZUGFeRD-Rechnung konnte nicht erstellt werden.";
}

function getZugferdErrorMessage(errorCode: string): string {
    const messages: Record<string, string> = {
        missingData: "Bitte ergänze folgende Pflichtdaten:",
        missingEmail:
            "Beim Kunden ist keine E-Mail-Adresse hinterlegt. Bitte ergänze zuerst die E-Mail-Adresse in den Kundendaten.",
        missingZugferd: "Bitte erstelle zuerst die ZUGFeRD-Rechnung.",
        notValidated:
            "Die ZUGFeRD-Rechnung wurde noch nicht erfolgreich validiert. Bitte erstelle und prüfe sie zuerst.",
        serviceNotConfigured:
            "ZUGFeRD-Service ist noch nicht eingerichtet. Bitte ZUGFERD_SERVICE_URL und ZUGFERD_SERVICE_API_KEY konfigurieren.",
        serviceUnauthorized:
            "Der ZUGFeRD-Service hat die Anfrage abgelehnt. Bitte prüfe ZUGFERD_SERVICE_API_KEY in Vercel und Render.",
        payloadTooLarge:
            "Die Rechnungsdatei ist zu groß für den ZUGFeRD-Service.",
        serviceTimeout:
            "Der ZUGFeRD-Service hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.",
        serviceUnavailable:
            "Der ZUGFeRD-Service ist aktuell nicht erreichbar. Bitte versuche es erneut.",
        serviceError:
            "Der ZUGFeRD-Service konnte die Rechnung nicht verarbeiten. Bitte versuche es erneut.",
        validationFailed: "ZUGFeRD konnte nicht validiert werden.",
        mailNotConfigured:
            "E-Mail-Versand ist noch nicht eingerichtet. Bitte RESEND_API_KEY und die Rechnungs-Absender-E-Mail in den Einstellungen konfigurieren.",
        createFailed:
            "ZUGFeRD-Rechnung konnte nicht erstellt werden. Bitte prüfe die Daten und versuche es erneut.",
        zugferdSendFailed:
            "ZUGFeRD-Rechnung konnte nicht per E-Mail gesendet werden. Bitte versuche es erneut.",
        sendFailed:
            "ZUGFeRD-Rechnung konnte nicht per E-Mail gesendet werden. Bitte versuche es erneut.",
    };

    return messages[errorCode] ?? messages.createFailed;
}

function getPaymentSavedMessage(value: string): string {
    const messages: Record<string, string> = {
        created: "Zahlung wurde erfasst.",
        updated: "Zahlung wurde geändert.",
        voided: "Zahlung wurde storniert.",
    };

    return messages[value] ?? "Zahlung wurde gespeichert.";
}

function getPaymentErrorMessage(value: string): string {
    const messages: Record<string, string> = {
        invalidAmount: "Bitte gib einen gültigen Betrag größer als 0 ein.",
        invalidMethod: "Bitte wähle Bar oder Bank als Zahlungsart.",
        overpaymentNeedsConfirmation:
            "Diese Zahlung überschreitet den Restbetrag. Bitte bestätige die Überzahlung bewusst im Dialog.",
        createFailed:
            "Zahlung konnte nicht angelegt werden. Bitte versuche es erneut.",
        updateFailed:
            "Zahlung konnte nicht geändert werden. Bitte versuche es erneut.",
        voidFailed:
            "Zahlung konnte nicht storniert werden. Bitte versuche es erneut.",
        missingVoidReason: "Bitte gib einen Grund für die Stornierung an.",
        notFound: "Die Zahlung wurde nicht gefunden oder ist bereits storniert.",
    };

    return messages[value] ?? "Bitte prüfe die Eingaben und versuche es erneut.";
}

function getCorrectionErrorMessage(value: string): string {
    const messages: Record<string, string> = {
        missingData: "Bitte wähle eine Rechnung und einen Korrekturgrund.",
        cancellationFailed:
            "Die Stornorechnung konnte nicht erstellt werden. Prüfe, ob die Rechnung bereits vollständig korrigiert wurde.",
        invalidRefund:
            "Bitte gib Betrag, Datum, Rückzahlungsart und Grund vollständig an.",
        refundFailed:
            "Die Rückzahlung konnte nicht erfasst werden. Prüfe den offenen Rückzahlungsbedarf.",
    };

    return messages[value] ?? "Bitte prüfe die Eingaben und versuche es erneut.";
}

function getRecordErrorMessage(value: string): string {
    const decodedValue = decodeURIComponent(value);
    const messages: Record<string, string> = {
        invalidCustomerType: "Bitte wähle eine gültige Käuferart.",
        customerAddressMissing: "Straße, PLZ und Ort sind Pflichtfelder.",
        companyNameMissing: "Bitte gib einen Firmennamen ein.",
        privateNameMissing: "Bitte gib Vorname und Nachname ein.",
        invalidPhone: "Bitte gib eine gültige Telefonnummer ein.",
        saleCustomerMismatch: "Der Kunde gehört nicht zu dieser Verkaufsakte.",
        customerUpdateFailed:
            "Kundendaten konnten nicht gespeichert werden. Bitte versuche es erneut.",
        vehicleRequiredMissing:
            "Hersteller, Modell, Typ und VIN sind Pflichtfelder.",
        vehiclePriceInvalid: "Bitte prüfe die Preisangaben.",
        damageNotesMissing: "Bitte erfasse zuerst eine Schadensbeschreibung.",
        saleVehicleMismatch: "Das Fahrzeug gehört nicht zu dieser Verkaufsakte.",
    };

    return messages[decodedValue] ?? decodedValue;
}

function SectionTitle({
                          icon: Icon,
                          title,
                          description,
                      }: {
    icon: typeof Receipt;
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

function MiniAmount({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p className="mt-1 font-extrabold text-slate-950">{value}</p>
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
    icon: typeof Receipt;
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
