"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, type ChangeEventHandler } from "react";
import {
    ArrowLeft,
    CalendarDays,
    ClipboardList,
    FileText,
    Plus,
    Save,
    Truck,
    UserRound,
} from "lucide-react";

import { createPurchaseCaseAction } from "@/app/dashboard/ankauf/new/actions";
import { updatePurchaseCaseAction } from "@/app/dashboard/ankauf/[purchaseId]/edit/actions";
import type { PurchaseFormData } from "@/lib/purchases/purchase-form-data";
import type { PurchaseCasePaymentStatus } from "@/lib/purchases/purchase-queries";
import { EMAIL_LANGUAGE_OPTIONS } from "@/lib/customers/email-languages";
import { PersonTypeCards } from "@/components/customers/person-type-cards";
import { BzstVatValidationLink } from "@/components/shared/bzst-vat-validation-link";
import { SearchCombobox, type SearchComboboxOption } from "@/components/ui/search-combobox";
import { VehicleDocumentUploadFields } from "@/components/vehicles/vehicle-document-upload-fields";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState = {
    success: false,
    message: "",
};

type PurchaseFormInitialValues = {
    id?: string;
    vehicle_id?: string | null;
    seller_customer_id?: string | null;
    purchase_date?: string | null;
    net_amount?: number | null;
    vat_rate?: number | null;
    payment_status?: PurchaseCasePaymentStatus | null;
    notes?: string | null;
};

type PurchaseFormProps = {
    formData: PurchaseFormData;
    mode?: "create" | "edit";
    initialValues?: PurchaseFormInitialValues;
};

type SelectionMode = "existing" | "new";

export function PurchaseForm({
    formData,
    mode = "create",
    initialValues,
}: PurchaseFormProps) {
    const action =
        mode === "edit" ? updatePurchaseCaseAction : createPurchaseCaseAction;
    const [state, formAction, isPending] = useActionState(action, initialState);
    const [vehicleMode, setVehicleMode] = useState<SelectionMode>("existing");
    const [sellerMode, setSellerMode] = useState<SelectionMode>("existing");
    const [sellerType, setSellerType] = useState<"company" | "private">("company");
    const [newSellerVatId, setNewSellerVatId] = useState("");
    const today = new Date().toISOString().slice(0, 10);
    const backHref =
        mode === "edit" && initialValues?.id
            ? `/dashboard/ankauf/${initialValues.id}`
            : "/dashboard/ankauf";

    const vehicleOptions = useMemo<SearchComboboxOption[]>(
        () =>
            formData.vehicles.map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.label,
                description: vehicle.description,
                disabled: vehicle.disabled,
                keywords: [
                    vehicle.internal_number,
                    vehicle.manufacturer,
                    vehicle.model,
                    vehicle.vehicle_type,
                    vehicle.vin,
                    vehicle.construction_year?.toString() ?? "",
                ],
            })),
        [formData.vehicles],
    );
    const sellerOptions = useMemo<SearchComboboxOption[]>(
        () =>
            formData.sellers.map((seller) => ({
                value: seller.id,
                label: seller.label,
                description: [
                    seller.city,
                    seller.country,
                    seller.email,
                    seller.type === "company" ? "Unternehmen" : "Privatperson",
                ]
                    .filter(Boolean)
                    .join(" · "),
                keywords: [
                    seller.company_name,
                    seller.owner_name,
                    seller.first_name,
                    seller.last_name,
                    seller.city,
                    seller.country,
                    seller.email,
                    seller.phone,
                    seller.vat_id,
                ].filter((value): value is string => Boolean(value)),
            })),
        [formData.sellers],
    );

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Fahrzeug ankaufen"
                title={mode === "edit" ? "Fahrzeugankauf bearbeiten" : "Ankauf erfassen"}
                description={
                    mode === "edit"
                        ? "Bearbeite Ankaufsdaten, Verkäufer, Fahrzeug und Dokumente."
                        : "Erfasse Fahrzeug, Verkäufer, Ankauf und Dokumente in einem Ablauf."
                }
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href={backHref}>
                            <ArrowLeft className="mr-2 size-4" />
                            Zurück
                        </Link>
                    </Button>
                }
            />

            <form action={formAction} className="space-y-6">
                {initialValues?.id ? (
                    <input type="hidden" name="purchase_id" value={initialValues.id} />
                ) : null}
                <input type="hidden" name="vehicle_mode" value={vehicleMode} />
                <input type="hidden" name="seller_mode" value={sellerMode} />

                {state.message ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                        {state.message}
                    </div>
                ) : null}

                {mode === "create" ? (
                    <ProgressBar />
                ) : null}

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Truck}
                            title="1. Fahrzeug auswählen oder anlegen"
                            description="Wähle ein bestehendes geeignetes Fahrzeug oder erfasse es direkt neu."
                        />
                        {mode === "create" ? (
                            <ModeTabs
                                name="vehicle-mode-ui"
                                value={vehicleMode}
                                firstLabel="Bestehendes Fahrzeug"
                                secondLabel="Neues Fahrzeug"
                                onChange={setVehicleMode}
                            />
                        ) : null}
                        {vehicleMode === "existing" || mode === "edit" ? (
                            <SearchCombobox
                                name="vehicle_id"
                                label="Fahrzeug"
                                options={vehicleOptions}
                                defaultValue={initialValues?.vehicle_id ?? ""}
                                required
                                placeholder="Interne Nummer, VIN, Hersteller oder Modell suchen..."
                                emptyText="Kein geeignetes Fahrzeug gefunden."
                                maxVisibleItems={60}
                            />
                        ) : (
                            <VehicleCreateFields />
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={UserRound}
                            title="2. Verkäufer auswählen oder anlegen"
                            description="Verkäufer werden im bestehenden Kunden-/Geschäftspartnerbestand geführt."
                        />
                        {mode === "create" ? (
                            <ModeTabs
                                name="seller-mode-ui"
                                value={sellerMode}
                                firstLabel="Bestehender Verkäufer"
                                secondLabel="Neuer Verkäufer"
                                onChange={setSellerMode}
                            />
                        ) : null}
                        {sellerMode === "existing" || mode === "edit" ? (
                            <SearchCombobox
                                name="seller_customer_id"
                                label="Verkäufer"
                                options={sellerOptions}
                                defaultValue={initialValues?.seller_customer_id ?? ""}
                                required
                                placeholder="Name, Firma, Ort, E-Mail oder USt-ID suchen..."
                                emptyText="Kein Verkäufer gefunden."
                                maxVisibleItems={60}
                            />
                        ) : (
                            <SellerCreateFields
                                sellerType={sellerType}
                                onSellerTypeChange={(nextSellerType) => {
                                    setSellerType(nextSellerType);
                                    if (nextSellerType === "private") setNewSellerVatId("");
                                }}
                                vatId={newSellerVatId}
                                onVatIdChange={setNewSellerVatId}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={CalendarDays}
                            title="3. Ankauf erfassen"
                            description="Ankaufsdatum, Betrag, Steuer und interne Hinweise."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Ankaufsdatum *"
                                name="purchase_date"
                                type="date"
                                defaultValue={initialValues?.purchase_date ?? today}
                                required
                            />
                            <FormField
                                label="Einkaufspreis netto *"
                                name="net_amount"
                                type="number"
                                defaultValue={
                                    initialValues?.net_amount !== undefined &&
                                    initialValues.net_amount !== null
                                        ? String(initialValues.net_amount)
                                        : ""
                                }
                                placeholder="z. B. 25000"
                                required
                            />
                            <FormField
                                label="MwSt. %"
                                name="vat_rate"
                                type="number"
                                defaultValue={
                                    initialValues?.vat_rate !== undefined &&
                                    initialValues.vat_rate !== null
                                        ? String(initialValues.vat_rate)
                                        : "19"
                                }
                                placeholder="19"
                            />
                            <div className="space-y-2">
                                <Label htmlFor="payment_status" className="font-bold text-slate-700">
                                    Zahlungsstatus *
                                </Label>
                                <select
                                    id="payment_status"
                                    name="payment_status"
                                    defaultValue={initialValues?.payment_status ?? "open"}
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                >
                                    <option value="open">Offen</option>
                                    <option value="partial">Teilweise bezahlt</option>
                                    <option value="paid">Bezahlt</option>
                                </select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {mode === "create" ? (
                    <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                        <CardContent className="space-y-5 p-5">
                            <SectionTitle
                                icon={FileText}
                                title="4. Dokumente hochladen"
                                description="Fahrzeugschein und Einkaufsrechnung werden mit Ankauf und Fahrzeug verknüpft."
                            />
                            <VehicleDocumentUploadFields
                                fields={[
                                    {
                                        name: "vehicle_registration_file",
                                        label: "Fahrzeugschein",
                                        description: "PDF, JPG oder PNG.",
                                    },
                                    {
                                        name: "purchase_invoice_file",
                                        label: "Einkaufsrechnung",
                                        description: "PDF, JPG oder PNG.",
                                    },
                                ]}
                            />
                        </CardContent>
                    </Card>
                ) : null}

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={ClipboardList}
                            title={mode === "create" ? "5. Zusammenfassung & Notizen" : "Notizen"}
                            description="Prüfe die Angaben und speichere den Ankauf erst am Ende."
                        />
                        <SummaryGrid
                            vehicleMode={mode === "edit" ? "existing" : vehicleMode}
                            sellerMode={mode === "edit" ? "existing" : sellerMode}
                        />
                        <Textarea
                            id="notes"
                            name="notes"
                            defaultValue={initialValues?.notes ?? ""}
                            placeholder="Interne Hinweise zum Ankauf..."
                            className="min-h-28 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                        />
                    </CardContent>
                </Card>

                <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
                    <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                        <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="h-12 rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href={backHref}>Abbrechen</Link>
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending
                                ? "Speichert..."
                                : mode === "edit"
                                  ? "Änderungen speichern"
                                  : "Ankauf speichern"}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function VehicleCreateFields() {
    const [damageNotes, setDamageNotes] = useState("");
    const [showDamageOnInvoice, setShowDamageOnInvoice] = useState(false);
    const hasDamageNotes = damageNotes.trim().length > 0;

    const handleDamageNotesChange: ChangeEventHandler<HTMLTextAreaElement> = (event) => {
        const nextDamageNotes = event.currentTarget.value;
        setDamageNotes(nextDamageNotes);

        if (!nextDamageNotes.trim()) {
            setShowDamageOnInvoice(false);
        }
    };

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Interne Nummer" name="new_vehicle_internal_number" />
            <FormField label="Hersteller *" name="new_vehicle_manufacturer" required />
            <FormField label="Modell *" name="new_vehicle_model" required />
            <FormField label="Typ *" name="new_vehicle_type" required />
            <FormField label="Fahrgestellnummer / VIN *" name="new_vehicle_vin" required />
            <FormField label="Baujahr" name="new_vehicle_construction_year" type="number" />
            <FormField label="Kilometerstand" name="new_vehicle_mileage" type="number" />
            <FormField label="Farbe" name="new_vehicle_color" />
            <FormField label="Fahrzeugkategorie" name="new_vehicle_category" />
            <div className="md:col-span-2">
                <Label htmlFor="new_vehicle_damage_notes" className="font-bold text-slate-700">
                    Schäden
                </Label>
                <Textarea
                    id="new_vehicle_damage_notes"
                    name="new_vehicle_damage_notes"
                    value={damageNotes}
                    onChange={handleDamageNotesChange}
                    placeholder="Bekannte Schäden oder Mängel am Fahrzeug eintragen."
                    className="mt-2 min-h-24 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                />
                <label
                    className={
                        hasDamageNotes
                            ? "mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
                            : "mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500"
                    }
                >
                    <input
                        type="checkbox"
                        name="new_vehicle_show_damage_on_invoice"
                        value="yes"
                        checked={showDamageOnInvoice}
                        disabled={!hasDamageNotes}
                        onChange={(event) => setShowDamageOnInvoice(event.currentTarget.checked)}
                        className="mt-1 size-4 rounded border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span>
                        Schäden auf Rechnung ausweisen
                        {!hasDamageNotes ? (
                            <span className="mt-1 block text-xs font-bold text-slate-500">
                                Erst verfügbar, wenn im Feld „Schäden“ ein Hinweis eingetragen ist.
                            </span>
                        ) : null}
                    </span>
                </label>
            </div>
        </div>
    );
}

function SellerCreateFields({
    sellerType,
    onSellerTypeChange,
    vatId,
    onVatIdChange,
}: {
    sellerType: "company" | "private";
    onSellerTypeChange: (type: "company" | "private") => void;
    vatId: string;
    onVatIdChange: (value: string) => void;
}) {
    return (
        <div className="space-y-5 rounded-[1.75rem] border border-emerald-200 bg-emerald-50/70 p-4 md:p-5">
            <div>
                <h3 className="text-lg font-extrabold text-emerald-950">
                    Neuen Verkäufer direkt anlegen
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">
                    Erfasse Firma oder Privatperson hier im Ankauf. Der Verkäufer wird als Geschäftspartner gespeichert und mit dem Ankauf verknüpft.
                </p>
            </div>

            <PersonTypeCards
                value={sellerType}
                onChange={onSellerTypeChange}
                inputName="new_seller_type_choice"
            />
            <input type="hidden" name="new_seller_type" value={sellerType} />
            <div className="rounded-[1.5rem] border border-emerald-100 bg-white/90 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                {sellerType === "company" ? (
                    <>
                        <FormField label="Firma *" name="new_seller_company_name" required />
                        <FormField label="Ansprechpartner" name="new_seller_owner_name" />
                    </>
                ) : (
                    <>
                        <FormField label="Vorname *" name="new_seller_first_name" required />
                        <FormField label="Nachname *" name="new_seller_last_name" required />
                    </>
                )}
                <FormField label="Straße und Hausnummer *" name="new_seller_street" required />
                <FormField label="PLZ *" name="new_seller_postal_code" required />
                <FormField label="Ort *" name="new_seller_city" required />
                <FormField label="Land" name="new_seller_country" defaultValue="Deutschland" />
                <FormField label="E-Mail" name="new_seller_email" type="email" />
                <FormField label="Telefon" name="new_seller_phone" type="tel" />
                <div className="space-y-2">
                    <Label htmlFor="new_seller_preferred_language" className="font-bold text-slate-700">
                        Sprache
                    </Label>
                    <select
                        id="new_seller_preferred_language"
                        name="new_seller_preferred_language"
                        defaultValue="de"
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                    >
                        {EMAIL_LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                {sellerType === "private" ? (
                    <FormField label="Steuernummer" name="new_seller_tax_number" />
                ) : null}
                {sellerType === "company" ? (
                    <>
                        <div className="space-y-2">
                            <FormField
                                label="USt-ID | VAT | NIP"
                                name="new_seller_vat_id"
                                value={vatId}
                                onChange={(event) => onVatIdChange(event.target.value)}
                            />
                            <BzstVatValidationLink />
                        </div>
                        <FormField label="Steuernummer" name="new_seller_tax_number" />
                        <FormField label="Handelsregister" name="new_seller_commercial_register_number" />
                        {vatId.trim() ? (
                            <>
                                <FileField label="Beweisbild 1" name="bzst_evidence_1" />
                                <FileField label="Beweisbild 2" name="bzst_evidence_2" />
                            </>
                        ) : null}
                    </>
                ) : null}
                </div>
            </div>
        </div>
    );
}

function ProgressBar() {
    const steps = ["Fahrzeug", "Verkäufer", "Ankauf", "Dokumente", "Speichern"];

    return (
        <div className="grid gap-2 rounded-[1.75rem] border border-cyan-100 bg-cyan-50 p-3 text-xs font-extrabold text-cyan-800 md:grid-cols-5">
            {steps.map((step, index) => (
                <div key={step} className="rounded-2xl bg-white px-3 py-2">
                    {index + 1}. {step}
                </div>
            ))}
        </div>
    );
}

function ModeTabs({
    value,
    firstLabel,
    secondLabel,
    onChange,
}: {
    name: string;
    value: SelectionMode;
    firstLabel: string;
    secondLabel: string;
    onChange: (value: SelectionMode) => void;
}) {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <ModeCard
                active={value === "existing"}
                label={firstLabel}
                onClick={() => onChange("existing")}
            />
            <ModeCard
                active={value === "new"}
                label={secondLabel}
                icon={Plus}
                onClick={() => onChange("new")}
            />
        </div>
    );
}

function ModeCard({
    active,
    label,
    icon: Icon,
    onClick,
}: {
    active: boolean;
    label: string;
    icon?: typeof Plus;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                active
                    ? "rounded-3xl border border-cyan-300 bg-cyan-50 p-4 text-left font-extrabold text-cyan-900 ring-4 ring-cyan-100"
                    : "rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left font-extrabold text-slate-700 hover:border-cyan-200 hover:bg-cyan-50"
            }
        >
            <span className="flex items-center gap-2">
                {Icon ? <Icon className="size-4" /> : null}
                {label}
            </span>
        </button>
    );
}

function SummaryGrid({
    vehicleMode,
    sellerMode,
}: {
    vehicleMode: SelectionMode;
    sellerMode: SelectionMode;
}) {
    return (
        <div className="grid gap-3 text-sm md:grid-cols-3">
            <SummaryBox label="Fahrzeug" value={vehicleMode === "new" ? "wird neu angelegt" : "bestehendes Fahrzeug"} />
            <SummaryBox label="Verkäufer" value={sellerMode === "new" ? "wird neu angelegt" : "bestehender Verkäufer"} />
            <SummaryBox label="Dokumente" value="Fahrzeugschein / Einkaufsrechnung optional" />
        </div>
    );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 font-extrabold text-slate-950">{value}</p>
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

function FormField({
    label,
    name,
    type = "text",
    required = false,
    defaultValue,
    placeholder,
    value,
    onChange,
}: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string | number;
    placeholder?: string;
    value?: string;
    onChange?: ChangeEventHandler<HTMLInputElement>;
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
                step={type === "number" ? "0.01" : undefined}
                required={required}
                defaultValue={defaultValue}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </div>
    );
}

function FileField({ label, name }: { label: string; name: string }) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
            </Label>
            <Input
                id={name}
                name={name}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 px-1.5 py-1.5 font-medium file:mr-3 file:h-9 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-0 file:text-sm file:font-bold file:leading-9 file:text-cyan-800"
            />
        </div>
    );
}
