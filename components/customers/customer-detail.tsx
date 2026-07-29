import Link from "next/link";
import {
    ArrowLeft,
    ArrowUpRight,
    Building2,
    Download,
    ExternalLink,
    FileText,
    PencilLine,
    Receipt,
    Save,
    Truck,
    UserRound,
    Wallet,
} from "lucide-react";

import type { CustomerDetail as CustomerDetailType } from "@/lib/customers/customer-detail-queries";
import {
    EMAIL_LANGUAGE_OPTIONS,
    getEmailLanguageLabel,
} from "@/lib/customers/email-languages";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { getDocumentTypeLabel } from "@/lib/documents/document-helpers";
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
import { Card, CardContent } from "@/components/ui/card";
import { updateCustomerMasterDataAction } from "@/app/dashboard/customers/[customerId]/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlashMessage } from "@/components/shared/flash-message";
import { phoneInputPattern } from "@/lib/validation/phone";
import { TemporaryHighlight } from "@/components/shared/temporary-highlight";

type CustomerDetailProps = {
    customer: CustomerDetailType;
    customerSaved?: boolean;
    customerCreated?: boolean;
    highlight?: boolean;
};

export function CustomerDetail({
                                   customer,
                                   customerSaved = false,
                                   customerCreated = false,
                                   highlight = false,
                               }: CustomerDetailProps) {
    const sellerVehicles = customer.vehicles.filter(
        (vehicle) => vehicle.role === "seller",
    );

    const buyerVehicles = customer.vehicles.filter(
        (vehicle) => vehicle.role === "buyer",
    );
    const bzstEvidenceCount = customer.documents.filter(
        (document) =>
            document.status === "available" &&
            (document.document_type === "bzst_vat_verification_primary" ||
                document.document_type === "bzst_vat_verification_secondary"),
    ).length;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kundenakte"
                title={customer.name}
                description="Detailansicht mit Stammdaten, Fahrzeugen, Verkäufen, Rechnungen und Dokumenten."
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href="/dashboard/customers">
                            <ArrowLeft className="mr-2 size-4" />
                            Zurück
                        </Link>
                    </Button>
                }
            />

            {customerSaved ? (
                <FlashMessage message="Kundendaten wurden gespeichert." />
            ) : null}

            {customerCreated ? (
                <FlashMessage message="Kunde wurde angelegt." />
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <CustomerStatCard
                    label="Kundentyp"
                    value={customer.type === "company" ? "Firma" : "Privatperson"}
                    description={customer.country ?? "—"}
                    icon={customer.type === "company" ? Building2 : UserRound}
                    tone="info"
                />
                <CustomerStatCard
                    label="Rechnungen"
                    value={customer.invoices.length}
                    description={formatCurrency(customer.total_revenue_gross)}
                    icon={Receipt}
                    tone="success"
                />
                <CustomerStatCard
                    label="Fahrzeuge"
                    value={customer.vehicles.length}
                    description={`${sellerVehicles.length} verkauft · ${buyerVehicles.length} gekauft`}
                    icon={Truck}
                    tone="neutral"
                />
                <CustomerStatCard
                    label="Dokumente"
                    value={customer.documents.length}
                    description="verknüpfte Dateien"
                    icon={FileText}
                    tone={customer.documents.length > 0 ? "success" : "warning"}
                />
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-6">
                    <TemporaryHighlight active={highlight}>
                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={customer.type === "company" ? Building2 : UserRound}
                                    title="Stammdaten"
                                    description="Kontakt- und Rechnungsdaten des Kunden."
                                />

                                <div className="mt-5 space-y-3">
                                    <InfoRow label="Name" value={customer.name} />
                                    <InfoRow
                                        label="Typ"
                                        value={customer.type === "company" ? "Firma" : "Privatperson"}
                                    />
                                    <InfoRow label="Adresse" value={customer.address || "—"} />
                                    <InfoRow label="E-Mail" value={customer.email ?? "—"} />
                                    <InfoRow
                                        label="E-Mail-Sprache"
                                        value={getEmailLanguageLabel(customer.preferred_language)}
                                    />
                                    <InfoRow label="Telefon" value={customer.phone ?? "—"} />
                                    <InfoRow
                                        label="Steuernummer"
                                        value={customer.tax_number ?? "Nicht hinterlegt"}
                                    />
                                    <InfoRow
                                        label="USt-ID"
                                        value={customer.vat_id ?? "Nicht hinterlegt"}
                                    />
                                    <InfoRow
                                        label="Angelegt am"
                                        value={formatDate(customer.created_at)}
                                    />
                                </div>

                                <div className="mt-6 rounded-3xl border border-cyan-100 bg-cyan-50/60 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700 shadow-sm">
                                            <PencilLine className="size-4" />
                                        </div>

                                        <div>
                                            <p className="text-sm font-extrabold text-cyan-950">
                                                Stammdaten bearbeiten
                                            </p>
                                            <p className="mt-1 text-xs font-semibold leading-5 text-cyan-800">
                                                Diese Angaben werden für Rechnungen, Gelangensbestätigung,
                                                Verbringungsnachweis und weitere PDF-Dokumente verwendet.
                                            </p>
                                        </div>
                                    </div>

                                    <form action={updateCustomerMasterDataAction} className="mt-4 space-y-4">
                                        <input type="hidden" name="customer_id" value={customer.id} />

                                        <div className="grid gap-4 md:grid-cols-2">
                                            <CustomerFormField
                                                label="Straße"
                                                name="street"
                                                defaultValue={customer.street ?? ""}
                                                placeholder="z. B. Musterstraße 1"
                                            />

                                            <CustomerFormField
                                                label="PLZ"
                                                name="postal_code"
                                                defaultValue={customer.postal_code ?? ""}
                                                placeholder="z. B. 20095"
                                            />

                                            <CustomerFormField
                                                label="Stadt"
                                                name="city"
                                                defaultValue={customer.city ?? ""}
                                                placeholder="z. B. Hamburg"
                                            />

                                            <CustomerFormField
                                                label="Land"
                                                name="country"
                                                defaultValue={customer.country ?? ""}
                                                placeholder="z. B. Deutschland"
                                            />

                                            <CustomerFormField
                                                label="E-Mail"
                                                name="email"
                                                type="email"
                                                defaultValue={customer.email ?? ""}
                                                placeholder="kunde@example.com"
                                            />

                                            <EmailLanguageSelect
                                                defaultValue={customer.preferred_language}
                                            />

                                            <CustomerFormField
                                                label="Telefon"
                                                name="phone"
                                                type="tel"
                                                defaultValue={customer.phone ?? ""}
                                                placeholder="+49 ..."
                                                pattern={phoneInputPattern}
                                                title="Bitte gib eine gültige Telefonnummer ein."
                                            />

                                            <CustomerFormField
                                                label="Steuernummer"
                                                name="tax_number"
                                                defaultValue={customer.tax_number ?? ""}
                                                placeholder="z. B. 12/345/67890"
                                            />

                                            <CustomerFormField
                                                label="USt-ID"
                                                name="vat_id"
                                                defaultValue={customer.vat_id ?? ""}
                                                placeholder="z. B. ATU12345678"
                                            />
                                        </div>

                                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                            <p className="text-xs font-bold leading-5 text-amber-900">
                                                Für Inland-Verkäufe muss die Steuernummer gepflegt sein.
                                                Für EU-Verkäufe muss die USt-ID gepflegt sein.
                                                Stadt und Land werden zusätzlich für Export- und Verbringungsdokumente verwendet.
                                            </p>
                                        </div>

                                        <div className="flex justify-end">
                                            <Button
                                                type="submit"
                                                className="h-11 rounded-2xl bg-cyan-700 px-5 font-extrabold text-white hover:bg-cyan-800"
                                            >
                                                <Save className="mr-2 size-4" />
                                                Stammdaten speichern
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            </CardContent>
                        </Card>
                    </TemporaryHighlight>

                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-5">
                            <SectionTitle
                                icon={Wallet}
                                title="Umsatz"
                                description="Summen aus den Rechnungen dieses Kunden."
                            />

                            <div className="mt-5 space-y-3">
                                <InfoRow
                                    label="Umsatz netto"
                                    value={formatCurrency(customer.total_revenue_net)}
                                    strong
                                />
                                <InfoRow
                                    label="Umsatz brutto"
                                    value={formatCurrency(customer.total_revenue_gross)}
                                    strong
                                />
                                <InfoRow
                                    label="Rechnungen"
                                    value={customer.invoices.length.toString()}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-0">
                            <div className="border-b border-slate-200 p-5">
                                <SectionTitle
                                    icon={Truck}
                                    title="Fahrzeuge"
                                    description="Fahrzeuge, bei denen dieser Kunde Verkäufer oder Käufer ist."
                                />
                            </div>

                            {customer.vehicles.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {customer.vehicles.map((vehicle) => (
                                        <div
                                            key={vehicle.id}
                                            className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    {vehicle.name}
                                                </p>
                                                <p className="mt-1 font-mono text-sm font-semibold text-slate-500">
                                                    {vehicle.vin}
                                                </p>
                                                <p className="mt-1 text-sm font-medium text-slate-500">
                                                    {vehicle.vehicle_type} · BJ{" "}
                                                    {vehicle.construction_year ?? "—"}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge
                                                    tone={vehicle.role === "seller" ? "warning" : "success"}
                                                >
                                                    {vehicle.role === "seller" ? "Verkäufer" : "Käufer"}
                                                </StatusBadge>

                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-xl font-bold"
                                                >
                                                    <Link href={`/dashboard/vehicles/${vehicle.id}`}>
                                                        Fahrzeugakte
                                                        <ArrowUpRight className="ml-1 size-3.5" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyBox text="Für diesen Kunden sind noch keine Fahrzeuge verknüpft." />
                                </div>
                            )}
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
                                    description="Verkaufsakten, in denen dieser Kunde Käufer ist."
                                />
                            </div>

                            {customer.sales.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {customer.sales.map((sale) => (
                                        <div
                                            key={sale.id}
                                            className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    {sale.vehicle_name}
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
                                    <EmptyBox text="Für diesen Kunden gibt es noch keine Verkaufsakte." />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="p-0">
                            <div className="border-b border-slate-200 p-5">
                                <SectionTitle
                                    icon={Receipt}
                                    title="Rechnungen"
                                    description="Alle Rechnungen dieses Kunden."
                                />
                            </div>

                            {customer.invoices.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {customer.invoices.map((invoice) => (
                                        <div
                                            key={invoice.id}
                                            className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="font-extrabold text-cyan-700">
                                                    {invoice.invoice_number}
                                                </p>
                                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                                    {formatDate(invoice.invoice_date)}
                                                </p>
                                                <p className="mt-1 text-sm font-extrabold text-slate-950">
                                                    {formatCurrency(invoice.gross_amount)}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge tone={getPaymentStatusTone(invoice.payment_status)}>
                                                    {getPaymentStatusLabel(invoice.payment_status)}
                                                </StatusBadge>

                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-xl font-bold"
                                                >
                                                    <Link href={`/api/invoices/${invoice.id}/pdf`}>
                                                        <Download className="mr-1 size-3.5" />
                                                        PDF
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyBox text="Für diesen Kunden gibt es noch keine Rechnungen." />
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
                                    description="Alle Dokumente, die diesem Kunden zugeordnet sind."
                                />
                                {bzstEvidenceCount > 0 ? (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <StatusBadge tone={bzstEvidenceCount === 2 ? "success" : "warning"}>
                                            BZSt-Beweisbilder: {bzstEvidenceCount} von 2 vorhanden
                                        </StatusBadge>
                                    </div>
                                ) : null}
                            </div>

                            {customer.documents.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {customer.documents.map((document) => (
                                        <div
                                            key={document.id}
                                            className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    {getCustomerDocumentDisplayName(document)}
                                                </p>
                                                <p className="mt-1 text-sm font-medium text-slate-500">
                                                    {getDocumentTypeLabel(document.document_type)} ·{" "}
                                                    {document.file_name}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge
                                                    tone={document.status === "available" ? "success" : "warning"}
                                                >
                                                    {document.status === "available"
                                                        ? "Verfügbar"
                                                        : "Prüfen"}
                                                </StatusBadge>

                                                {document.file_path ? (
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
                                                            <Link href={`/api/documents/${document.id}/file?download=1`}>
                                                                <Download className="mr-1 size-3.5" />
                                                                Download
                                                            </Link>
                                                        </Button>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-5">
                                    <EmptyBox text="Für diesen Kunden sind noch keine Dokumente vorhanden." />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}

function SectionTitle({
                          icon: Icon,
                          title,
                          description,
                      }: {
    icon: typeof UserRound;
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

function getCustomerDocumentDisplayName(
    document: CustomerDetailType["documents"][number],
): string {
    if (document.document_type === "bzst_vat_verification_primary") {
        return "Beweisbild 1";
    }

    if (document.document_type === "bzst_vat_verification_secondary") {
        return "Beweisbild 2";
    }

    return getDocumentTypeLabel(document.document_type);
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

function CustomerStatCard({
                              label,
                              value,
                              description,
                              icon: Icon,
                              tone,
                          }: {
    label: string;
    value: string | number;
    description: string;
    icon: typeof UserRound;
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

function CustomerFormField({
                               label,
                               name,
                               type = "text",
                               defaultValue,
                               placeholder,
                               pattern,
                               title,
                           }: {
    label: string;
    name: string;
    type?: string;
    defaultValue: string;
    placeholder?: string;
    pattern?: string;
    title?: string;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
            </Label>
            <Input
                id={name}
                name={name}
                type={type}
                defaultValue={defaultValue}
                placeholder={placeholder}
                pattern={pattern}
                title={title}
                className="h-11 rounded-2xl border-slate-200 bg-white font-semibold"
            />
        </div>
    );
}

function EmailLanguageSelect({ defaultValue }: { defaultValue: string }) {
    return (
        <div className="space-y-2">
            <Label
                htmlFor="preferred_language"
                className="font-bold text-slate-700"
            >
                Sprache für E-Mails
            </Label>
            <select
                id="preferred_language"
                name="preferred_language"
                defaultValue={defaultValue || "de"}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 font-semibold text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
            >
                {EMAIL_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <p className="text-xs font-semibold leading-5 text-cyan-800">
                Diese Sprache wird für automatisch versendete E-Mails verwendet.
            </p>
        </div>
    );
}

function EmptyBox({ text }: { text: string }) {
    return (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm font-bold text-slate-500">{text}</p>
        </div>
    );
}
