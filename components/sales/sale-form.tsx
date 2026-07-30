"use client";

import Link from "next/link";
import {
    useActionState,
    useRef,
    useState,
    useTransition,
    type ChangeEventHandler,
    type FormEventHandler,
} from "react";
import {
    Building2,
    CalendarDays,
    Globe2,
    Info,
    Receipt,
    Save,
    Truck,
    UserRound,
} from "lucide-react";

import {
    createSaleAction,
    updateSaleBuyerTaxDataAction,
} from "@/app/dashboard/sales/new/actions";
import type { CustomerRow } from "@/lib/customers/customer-queries";
import { EMAIL_LANGUAGE_OPTIONS } from "@/lib/customers/email-languages";
import {
    getAllowedArrivalPeriods,
    getArrivalYearOptions,
} from "@/lib/sales/export-date-rules";
import type { VehicleRow } from "@/lib/vehicles/vehicle-queries";
import { getVehicleDisplayName } from "@/lib/vehicles/vehicle-helpers";
import { formatCurrency } from "@/lib/format/currency";
import {
    captureFormSnapshot,
    restoreFormSnapshot,
    type FormSnapshot,
} from "@/lib/forms/form-snapshot";
import { phoneInputPattern, sanitizePhoneInput } from "@/lib/validation/phone";
import {
    getSaleTaxConfiguration,
    normalizeSaleBuyerType,
    type SaleBuyerType,
} from "@/utils/sale-tax-rules";
import { useFormActionFeedback } from "@/components/forms/use-form-action-feedback";
import { CustomerCombobox } from "@/components/customers/customer-combobox";
import { VehicleCombobox } from "@/components/vehicles/vehicle-combobox";
import { BzstVatValidationLink } from "@/components/shared/bzst-vat-validation-link";
import { ActionMessage } from "@/components/shared/action-message";
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

type BuyerMode = "existing" | "new";
type VehicleMode = "existing" | "new";
type NewCustomerType = "company" | "private";
type SaleType = "inland" | "eu" | "export_third_country";

type SaleFormProps = {
    customers: CustomerRow[];
    vehicles: VehicleRow[];
    defaultVehicleId?: string | null;
    defaultCustomerId?: string | null;
};

type CustomerTaxDataOverride = {
    taxNumber: string | null;
    vatId: string | null;
};

function parseDecimalInput(value: string): number | null {
    const normalizedValue = value.trim().replace(",", ".");
    const numberValue = Number(normalizedValue);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

export function SaleForm({
                             customers,
                             vehicles,
                             defaultVehicleId = null,
                             defaultCustomerId = null,
                         }: SaleFormProps) {
    const [state, formAction, isPending] = useActionState(
        createSaleAction,
        initialState,
    );
    const errorMessageRef = useRef<HTMLDivElement | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const lastSubmittedFormSnapshotRef = useRef<FormSnapshot | null>(null);

    const [buyerMode, setBuyerMode] = useState<BuyerMode>(
        defaultCustomerId || customers.length > 0 ? "existing" : "new",
    );
    const [vehicleMode, setVehicleMode] = useState<VehicleMode>(
        defaultVehicleId || vehicles.length > 0 ? "existing" : "new",
    );

    const [newCustomerType, setNewCustomerType] =
        useState<NewCustomerType>("company");
    const [newCustomerVatId, setNewCustomerVatId] = useState("");
    const [newVehicleDamageNotes, setNewVehicleDamageNotes] = useState("");

    const today = new Date().toISOString().slice(0, 10);
    const [saleType, setSaleType] = useState<SaleType>("inland");
    const [saleDate, setSaleDate] = useState(today);
    const [selectedCustomerId, setSelectedCustomerId] = useState(
        defaultCustomerId ?? "",
    );
    const [customerTaxDataOverrides, setCustomerTaxDataOverrides] = useState<
        Record<string, CustomerTaxDataOverride>
    >({});
    const [selectedVehicleId, setSelectedVehicleId] = useState(
        defaultVehicleId ?? "",
    );
    const [exportDestinationCity, setExportDestinationCity] = useState("");
    const [exportDestinationCountry, setExportDestinationCountry] = useState("");
    const [destinationCityManuallyChanged, setDestinationCityManuallyChanged] =
        useState(false);
    const [
        destinationCountryManuallyChanged,
        setDestinationCountryManuallyChanged,
    ] = useState(false);
    const [netAmount, setNetAmount] = useState("");
    const [vatRate, setVatRate] = useState("19");
    const requiresExportDetails =
        saleType === "eu" || saleType === "export_third_country";
    const selectedCustomer =
        customers.find((customer) => customer.id === selectedCustomerId) ?? null;
    const selectedCustomerTaxDataOverride = selectedCustomer
        ? customerTaxDataOverrides[selectedCustomer.id] ?? null
        : null;
    const effectiveSelectedCustomerTaxNumber =
        selectedCustomerTaxDataOverride?.taxNumber ?? selectedCustomer?.tax_number;
    const effectiveSelectedCustomerVatId =
        selectedCustomerTaxDataOverride?.vatId ?? selectedCustomer?.vat_id;
    const selectedVehicle =
        vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
    const selectedBuyerType: SaleBuyerType =
        buyerMode === "new"
            ? newCustomerType
            : normalizeSaleBuyerType(selectedCustomer?.type);
    const taxConfiguration = getSaleTaxConfiguration({
        buyerType: selectedBuyerType,
        deliveryType: saleType,
        billingCountry: selectedCustomer?.country,
    });
    const selectedCustomerMissingTaxNumber =
        buyerMode === "existing" &&
        taxConfiguration.showTaxNumber &&
        Boolean(selectedCustomer) &&
        !effectiveSelectedCustomerTaxNumber;
    const selectedCustomerMissingVatId =
        buyerMode === "existing" &&
        taxConfiguration.showVatId &&
        Boolean(selectedCustomer) &&
        !effectiveSelectedCustomerVatId;
    const requiresNewCustomerTaxNumber =
        buyerMode === "new" && taxConfiguration.showTaxNumber;
    const requiresNewCustomerVatId =
        buyerMode === "new" && taxConfiguration.showVatId;

    const allowedArrivalPeriods = getAllowedArrivalPeriods(saleDate);
    const allowedArrivalYears = getArrivalYearOptions();
    const previewNetAmount = parseDecimalInput(netAmount) ?? 0;
    const previewVatRate = parseDecimalInput(vatRate) ?? 0;
    const previewVatAmount = roundMoney(previewNetAmount * (previewVatRate / 100));
    const previewGrossAmount = roundMoney(previewNetAmount + previewVatAmount);

    useFormActionFeedback({
        message: state.message,
        success: state.success,
        messageRef: errorMessageRef,
        restoreLastSubmission: () => {
            const snapshot = lastSubmittedFormSnapshotRef.current;
            const form = formRef.current;

            if (!snapshot || !form) return;

            window.requestAnimationFrame(() => restoreFormSnapshot(form, snapshot));
        },
    });

    function handleSaleTypeChange(nextSaleType: SaleType) {
        const nextTaxConfiguration = getSaleTaxConfiguration({
            buyerType: selectedBuyerType,
            deliveryType: nextSaleType,
            billingCountry: selectedCustomer?.country,
        });

        setSaleType(nextSaleType);
        setVatRate(String(nextTaxConfiguration.defaultVatRate));

        if (nextSaleType !== "inland" && selectedCustomer) {
            applyCustomerAddress(selectedCustomer);
        }
    }

    function handleBuyerModeChange(nextBuyerMode: BuyerMode) {
        const nextBuyerType =
            nextBuyerMode === "new"
                ? newCustomerType
                : normalizeSaleBuyerType(selectedCustomer?.type);

        setBuyerMode(nextBuyerMode);
        setVatRate(
            String(
                getSaleTaxConfiguration({
                    buyerType: nextBuyerType,
                    deliveryType: saleType,
                    billingCountry: selectedCustomer?.country,
                }).defaultVatRate,
            ),
        );
    }

    function handleNewCustomerTypeChange(nextCustomerType: NewCustomerType) {
        setNewCustomerType(nextCustomerType);
        if (nextCustomerType === "private") setNewCustomerVatId("");
        setVatRate(
            String(
                getSaleTaxConfiguration({
                    buyerType: nextCustomerType,
                    deliveryType: saleType,
                }).defaultVatRate,
            ),
        );
    }

    function applyCustomerAddress(customer: CustomerRow | null) {
        if (!customer) return;

        if (!destinationCityManuallyChanged) {
            setExportDestinationCity(customer.city ?? "");
        }

        if (!destinationCountryManuallyChanged) {
            setExportDestinationCountry(customer.country ?? "");
        }
    }

    function handleSelectedCustomerChange(customerId: string) {
        setSelectedCustomerId(customerId);
        const customer = customers.find((item) => item.id === customerId) ?? null;
        const nextTaxConfiguration = getSaleTaxConfiguration({
            buyerType: customer?.type,
            deliveryType: saleType,
            billingCountry: customer?.country,
        });

        setVatRate(String(nextTaxConfiguration.defaultVatRate));

        if (requiresExportDetails) {
            applyCustomerAddress(customer);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Neuer Verkauf"
                title="Verkauf anlegen"
                description="Fahrzeug verkaufen, Käufer zuordnen, Rechnung vorbereiten und Fahrzeugstatus automatisch aktualisieren."
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href="/dashboard/sales">Zurück</Link>
                    </Button>
                }
            />

            <form
                ref={formRef}
                action={formAction}
                className="space-y-6"
                onSubmit={(event) => {
                    lastSubmittedFormSnapshotRef.current = captureFormSnapshot(
                        event.currentTarget,
                    );
                }}
            >
                <input type="hidden" name="vehicle_mode" value={vehicleMode} />
                {state.message ? (
                    <ActionMessage
                        ref={errorMessageRef}
                        title={state.message}
                        tone={state.success ? "success" : "danger"}
                    />
                ) : null}

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Truck}
                            title="1. Fahrzeug auswählen oder anlegen"
                            description="Wähle ein verkaufsfähiges Fahrzeug aus dem Bestand oder erfasse es direkt neu."
                        />

                        <ModeTabs
                            name="vehicle_mode_ui"
                            value={vehicleMode}
                            firstValue="existing"
                            secondValue="new"
                            firstLabel="Bestehendes Fahrzeug"
                            secondLabel="Neues Fahrzeug"
                            onChange={(value) => {
                                setVehicleMode(value);
                                if (value === "new") setSelectedVehicleId("");
                            }}
                        />

                        {vehicleMode === "existing" ? (
                            <div className="space-y-4">
                                <VehicleCombobox
                                    vehicles={vehicles}
                                    name="vehicle_id"
                                    label="Fahrzeug *"
                                    value={selectedVehicleId}
                                    required
                                    placeholder="VIN, Bestandsnummer, Hersteller, Modell oder Kennzeichen suchen..."
                                    emptyText="Kein verkaufsfähiges Fahrzeug gefunden."
                                    onChange={setSelectedVehicleId}
                                />

                                {selectedVehicle ? (
                                    <>
                                        <SelectedVehicleSummary vehicle={selectedVehicle} />
                                        <DamageInvoiceOption
                                            visible={Boolean(
                                                selectedVehicle.damage_notes?.trim(),
                                            )}
                                            description="Die beim ausgewählten Fahrzeug hinterlegten Schäden werden auf der Rechnung ausgegeben."
                                        />
                                    </>
                                ) : null}

                                {vehicles.length === 0 ? (
                                    <p className="text-sm font-bold text-amber-700">
                                        Es gibt aktuell keine verfügbaren Fahrzeuge im Bestand.
                                        Du kannst das Fahrzeug direkt in diesem Verkaufsprozess neu
                                        erfassen.
                                    </p>
                                ) : null}
                            </div>
                        ) : (
                            <NewVehicleFields
                                damageNotes={newVehicleDamageNotes}
                                onDamageNotesChange={setNewVehicleDamageNotes}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={UserRound}
                            title="2. Käufer auswählen oder anlegen"
                            description="Wähle einen bestehenden Käufer aus oder lege ihn direkt im Verkauf neu an."
                        />

                        <ModeTabs
                            name="buyer_mode"
                            value={buyerMode}
                            firstValue="existing"
                            secondValue="new"
                            firstLabel="Bestehender Käufer"
                            secondLabel="Neuer Käufer"
                            onChange={(value) => {
                                handleBuyerModeChange(value);
                                if (value === "new") setSelectedCustomerId("");
                            }}
                        />

                        {buyerMode === "existing" ? (
                            <div className="space-y-2">
                                <CustomerCombobox
                                    customers={customers}
                                    name="buyer_customer_id"
                                    label="Käufer *"
                                    value={selectedCustomerId}
                                    required
                                    placeholder="Käufer nach Name, Firma, E-Mail oder Ort suchen..."
                                    onChange={handleSelectedCustomerChange}
                                />

                                {selectedCustomer ? (
                                    <SelectedCustomerSummary customer={selectedCustomer} />
                                ) : null}

                                {customers.length === 0 ? (
                                    <p className="text-sm font-bold text-amber-700">
                                        Es gibt noch keine Kunden. Wähle „Neuen Käufer direkt
                                        anlegen“, um den Käufer im Verkauf zu erfassen.
                                    </p>
                                ) : null}

                                {selectedCustomerMissingTaxNumber ? (
                                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                                        Für Inland-Verkäufe muss beim Kunden eine
                                        Steuernummer hinterlegt sein.
                                    </p>
                                ) : null}

                                {selectedCustomerMissingVatId ? (
                                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                                        Für EU-Verkäufe muss beim Kunden eine
                                        USt-IdNr. hinterlegt sein.
                                    </p>
                                ) : null}

                                {selectedCustomer &&
                                (selectedCustomerMissingTaxNumber || selectedCustomerMissingVatId) ? (
                                    <ExistingBuyerTaxDataEditor
                                        key={selectedCustomer.id}
                                        customer={selectedCustomer}
                                        requireTaxNumber={selectedCustomerMissingTaxNumber}
                                        requireVatId={selectedCustomerMissingVatId}
                                        onSaved={(savedTaxData) => {
                                            setCustomerTaxDataOverrides((currentOverrides) => ({
                                                ...currentOverrides,
                                                [selectedCustomer.id]: savedTaxData,
                                            }));
                                        }}
                                    />
                                ) : null}
                            </div>
                        ) : (
                            <div className="space-y-5 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
                                <div>
                                    <h3 className="text-lg font-extrabold text-emerald-950">
                                        Neuer Käufer
                                    </h3>
                                    <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">
                                        Diese Daten werden als Kunde gespeichert und anschließend
                                        automatisch für Rechnung, Übergabeprotokoll und weitere
                                        Dokumente verwendet.
                                    </p>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="cursor-pointer rounded-2xl border border-white bg-white p-4 shadow-sm transition has-[:checked]:border-cyan-300 has-[:checked]:ring-4 has-[:checked]:ring-cyan-100">
                                        <input
                                            type="radio"
                                            name="new_customer_type"
                                            value="company"
                                            checked={newCustomerType === "company"}
                                            onChange={() => handleNewCustomerTypeChange("company")}
                                            className="sr-only"
                                        />
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                                                <Building2 className="size-5" />
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-slate-950">Firma</p>
                                                <p className="text-sm font-medium text-slate-500">
                                                    Händler, GmbH, Exportkunde
                                                </p>
                                            </div>
                                        </div>
                                    </label>

                                    <label className="cursor-pointer rounded-2xl border border-white bg-white p-4 shadow-sm transition has-[:checked]:border-cyan-300 has-[:checked]:ring-4 has-[:checked]:ring-cyan-100">
                                        <input
                                            type="radio"
                                            name="new_customer_type"
                                            value="private"
                                            checked={newCustomerType === "private"}
                                            onChange={() => handleNewCustomerTypeChange("private")}
                                            className="sr-only"
                                        />
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                                                <UserRound className="size-5" />
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-slate-950">
                                                    Privatperson
                                                </p>
                                                <p className="text-sm font-medium text-slate-500">
                                                    Einzelperson als Käufer
                                                </p>
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    {newCustomerType === "company" ? (
                                        <>
                                            <FormField
                                                label="Firmenname *"
                                                name="new_customer_company_name"
                                                required
                                            />
                                            <FormField
                                                label="Inhaber / Ansprechpartner"
                                                name="new_customer_owner_name"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <FormField
                                                label="Vorname *"
                                                name="new_customer_first_name"
                                                required
                                            />
                                            <FormField
                                                label="Nachname *"
                                                name="new_customer_last_name"
                                                required
                                            />
                                        </>
                                    )}

                                    <FormField
                                        label="Straße und Hausnummer *"
                                        name="new_customer_street"
                                        required
                                    />
                                    <FormField
                                        label="PLZ *"
                                        name="new_customer_postal_code"
                                        required
                                    />
                                    <FormField
                                        label="Ort *"
                                        name="new_customer_city"
                                        required
                                    />
                                    <FormField
                                        label="Land"
                                        name="new_customer_country"
                                        defaultValue="Deutschland"
                                    />
                                    <FormField
                                        label="E-Mail"
                                        name="new_customer_email"
                                        type="email"
                                    />
                                    <EmailLanguageField />
                                    {newCustomerType === "private" ? (
                                        <FormField
                                            label={getRequiredLabel(
                                                "Steuernummer",
                                                requiresNewCustomerTaxNumber,
                                            )}
                                            name="new_customer_tax_number"
                                            required={requiresNewCustomerTaxNumber}
                                        />
                                    ) : null}
                                    <FormField
                                        label="Telefon"
                                        name="new_customer_phone"
                                        type="tel"
                                        pattern={phoneInputPattern}
                                        title="Bitte gib eine gültige Telefonnummer ein."
                                        onInput={(event) => {
                                            event.currentTarget.value = sanitizePhoneInput(
                                                event.currentTarget.value,
                                            );
                                        }}
                                    />
                                    {newCustomerType === "company" ? (
                                        <>
                                            <FormField
                                                label={getRequiredLabel(
                                                    "Steuernummer",
                                                    requiresNewCustomerTaxNumber,
                                                )}
                                                name="new_customer_tax_number"
                                                required={requiresNewCustomerTaxNumber}
                                            />
                                            <FormField
                                                label={getRequiredLabel(
                                                    "USt-ID | VAT | NIP",
                                                    requiresNewCustomerVatId,
                                                )}
                                                name="new_customer_vat_id"
                                                value={newCustomerVatId}
                                                onChange={(event) =>
                                                    setNewCustomerVatId(event.target.value)
                                                }
                                                required={requiresNewCustomerVatId}
                                            />
                                            <div className="md:col-span-2">
                                                <BzstVatValidationLink />
                                            </div>
                                            <FormField
                                                label="Handelsregister"
                                                name="new_customer_commercial_register_number"
                                            />
                                            {newCustomerVatId.trim() ? (
                                                <>
                                                    <FileField label="Beweisbild 1" name="bzst_evidence_1" />
                                                    <FileField label="Beweisbild 2" name="bzst_evidence_2" />
                                                </>
                                            ) : null}
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Globe2}
                            title="3. Umsatzsteuer und Verkaufstyp"
                            description="Der Verkaufstyp bestimmt automatisch die Pflichtdokumente."
                        />

                        <div className="grid gap-3 md:grid-cols-3">
                            <SaleTypeOption
                                value="inland"
                                title="Inland"
                                description="Normaler Verkauf innerhalb Deutschlands."
                                checked={saleType === "inland"}
                                onChange={handleSaleTypeChange}
                            />
                            <SaleTypeOption
                                value="eu"
                                title="EU-Verkauf"
                                description="Gelangensbestätigung und Verbringungsnachweis nötig."
                                checked={saleType === "eu"}
                                onChange={handleSaleTypeChange}
                            />
                            <SaleTypeOption
                                value="export_third_country"
                                title="Drittlandexport"
                                description="ABD, Ausgangsvermerk und Exportdokumente nötig."
                                checked={saleType === "export_third_country"}
                                onChange={handleSaleTypeChange}
                            />
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start gap-3">
                                <Info className="mt-0.5 size-5 shrink-0 text-cyan-700" />
                                <p className="text-sm font-semibold leading-6 text-slate-700">
                                    {taxConfiguration.hint}
                                </p>
                            </div>
                        </div>

                        <div
                            className={
                                requiresExportDetails
                                    ? "rounded-3xl border border-amber-200 bg-amber-50 p-4"
                                    : "rounded-3xl border border-cyan-100 bg-cyan-50 p-4"
                            }
                        >
                            <div className="flex items-start gap-3">
                                <Info
                                    className={
                                        requiresExportDetails
                                            ? "mt-0.5 size-5 shrink-0 text-amber-700"
                                            : "mt-0.5 size-5 shrink-0 text-cyan-700"
                                    }
                                />
                                <p
                                    className={
                                        requiresExportDetails
                                            ? "text-sm font-semibold leading-6 text-amber-950"
                                            : "text-sm font-semibold leading-6 text-cyan-950"
                                    }
                                >
                                    {requiresExportDetails
                                        ? "Für EU-Verkäufe und Drittlandexporte sind diese Angaben erforderlich, damit Gelangensbestätigung und Verbringungsnachweis erstellt werden können."
                                        : "Bei Inland-Verkäufen sind Export- und Verbringungsdaten optional."}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Globe2}
                            title="4. Export / EU-Lieferung"
                            description={
                                requiresExportDetails
                                    ? "Pflichtangaben für Gelangensbestätigung und Verbringungsnachweis."
                                    : "Optionale Angaben für Gelangensbestätigung und Verbringungsnachweis."
                            }
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label={getRequiredLabel(
                                    "Zielort / Empfangsort",
                                    requiresExportDetails,
                                )}
                                name="export_destination_city"
                                required={requiresExportDetails}
                                value={exportDestinationCity}
                                onChange={(event) => {
                                    setDestinationCityManuallyChanged(true);
                                    setExportDestinationCity(event.target.value);
                                }}
                                placeholder="z. B. Wien"
                            />

                            <FormField
                                label={getRequiredLabel(
                                    "Zielland / Empfangsland",
                                    requiresExportDetails,
                                )}
                                name="export_destination_country"
                                required={requiresExportDetails}
                                value={exportDestinationCountry}
                                onChange={(event) => {
                                    setDestinationCountryManuallyChanged(true);
                                    setExportDestinationCountry(event.target.value);
                                }}
                                placeholder="z. B. Österreich"
                            />

                            {requiresExportDetails && selectedCustomer ? (
                                <div className="md:col-span-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 rounded-2xl border-cyan-200 bg-white font-bold text-cyan-800 hover:bg-cyan-50"
                                        onClick={() => {
                                            setDestinationCityManuallyChanged(false);
                                            setDestinationCountryManuallyChanged(false);
                                            setExportDestinationCity(selectedCustomer.city ?? "");
                                            setExportDestinationCountry(selectedCustomer.country ?? "");
                                        }}
                                    >
                                        Aus Rechnungsadresse übernehmen
                                    </Button>
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <Label
                                    htmlFor="export_arrival_month"
                                    className="font-bold text-slate-700"
                                >
                                    {getRequiredLabel(
                                        "Monat des Gelangens",
                                        requiresExportDetails,
                                    )}
                                </Label>
                                <select
                                    id="export_arrival_month"
                                    name="export_arrival_month"
                                    required={requiresExportDetails}
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                    defaultValue=""
                                >
                                    <option value="">Bitte wählen</option>
                                    {allowedArrivalPeriods.map((period) => (
                                        <option key={`${period.month}-${period.year}`} value={period.month}>
                                            {period.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label
                                    htmlFor="export_arrival_year"
                                    className="font-bold text-slate-700"
                                >
                                    {getRequiredLabel(
                                        "Jahr des Gelangens",
                                        requiresExportDetails,
                                    )}
                                </Label>
                                <select
                                    id="export_arrival_year"
                                    name="export_arrival_year"
                                    required={requiresExportDetails}
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                    defaultValue=""
                                >
                                    <option value="">Bitte wählen</option>
                                    {allowedArrivalYears.map((year) => (
                                        <option key={year || "empty"} value={year}>
                                            {year}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <FormField
                                label={getRequiredLabel(
                                    "Verbringungs- / Übergabedatum",
                                    requiresExportDetails,
                                )}
                                name="export_transport_date"
                                type="date"
                                required={requiresExportDetails}
                            />

                            <div className="space-y-2">
                                <Label
                                    htmlFor="export_transport_type"
                                    className="font-bold text-slate-700"
                                >
                                    {getRequiredLabel(
                                        "Art der Verbringung",
                                        requiresExportDetails,
                                    )}
                                </Label>
                                <select
                                    id="export_transport_type"
                                    name="export_transport_type"
                                    required={requiresExportDetails}
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                    defaultValue=""
                                >
                                    <option value="">Bitte wählen</option>
                                    <option value="self_pickup">
                                        Abnehmer befördert selbst
                                    </option>
                                    <option value="customer_forwarder">
                                        Spedition / Beauftragter des Abnehmers
                                    </option>
                                    <option value="seller_transport">
                                        Lieferung durch WAW
                                    </option>
                                    <option value="other">Sonstiges</option>
                                </select>
                            </div>

                            <FormField
                                label={getRequiredLabel(
                                    "Empfänger / Unterzeichner",
                                    requiresExportDetails,
                                )}
                                name="export_receiver_name"
                                required={requiresExportDetails}
                                placeholder="Name der unterschreibenden Person"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Receipt}
                            title="5. Verkaufsdaten"
                            description="Preis, Datum, MwSt. und automatische Rechnungsnummer."
                        />

                        <div className="grid gap-4 md:grid-cols-3">
                            <FormField
                                label="Verkaufspreis netto *"
                                name="net_amount"
                                type="number"
                                step="0.01"
                                value={netAmount}
                                onChange={(event) => setNetAmount(event.target.value)}
                                required
                            />
                            <FormField
                                label="MwSt.-Satz"
                                name="vat_rate"
                                type="number"
                                step="0.01"
                                value={vatRate}
                                onChange={(event) => {
                                    if (taxConfiguration.forceVatRate) return;
                                    setVatRate(event.target.value);
                                }}
                                readOnly={taxConfiguration.forceVatRate}
                                description={
                                    taxConfiguration.forceVatRate
                                        ? "Der MwSt.-Satz wird für diese Kombination automatisch festgelegt."
                                        : undefined
                                }
                            />
                            <FormField
                                label="Verkaufsdatum *"
                                name="sale_date"
                                type="date"
                                value={saleDate}
                                onChange={(event) => setSaleDate(event.target.value)}
                                required
                            />
                        </div>

                        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                            <AmountPreview label="Netto" value={previewNetAmount} />
                            <AmountPreview label="MwSt." value={previewVatAmount} />
                            <AmountPreview label="Brutto" value={previewGrossAmount} />
                        </div>

                        <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-cyan-100 bg-cyan-50 p-4">
                            <input
                                type="checkbox"
                                name="create_invoice"
                                value="yes"
                                defaultChecked
                                className="mt-1 size-4 rounded border-cyan-300 text-cyan-700"
                            />
                            <div>
                                <p className="font-extrabold text-cyan-950">
                                    Rechnung automatisch erzeugen
                                </p>
                                <p className="mt-1 text-sm font-medium text-cyan-800">
                                    Erstellt direkt einen Rechnungsdatensatz mit der nächsten
                                    Rechnungsnummer und speichert die PDF.
                                </p>
                            </div>
                        </label>

                        <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-slate-200 bg-white p-4">
                            <input
                                type="checkbox"
                                name="include_signature_stamp"
                                value="yes"
                                className="mt-1 size-4 rounded border-slate-300 text-cyan-700"
                            />
                            <div>
                                <p className="font-extrabold text-slate-950">
                                    Unterschrift & Stempel einfügen
                                </p>
                                <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                                    Fügt die in den Einstellungen hinterlegte digitale
                                    Unterschrift und den Firmenstempel in die automatisch
                                    erzeugte Rechnung ein.
                                </p>
                            </div>
                        </label>

                        <div className="grid gap-4 md:grid-cols-[1fr_0.6fr]">
                            <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
                                <input
                                    type="checkbox"
                                    name="create_cashbook_entry"
                                    value="yes"
                                    defaultChecked
                                    className="mt-1 size-4 rounded border-emerald-300 text-emerald-700"
                                />
                                <div>
                                    <p className="font-extrabold text-emerald-950">
                                        Zahlung direkt im Kassenbuch erfassen
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-emerald-800">
                                        Erstellt automatisch eine Einnahme mit dem Bruttobetrag.
                                    </p>
                                </div>
                            </label>

                            <div className="space-y-2">
                                <Label
                                    htmlFor="payment_method"
                                    className="font-bold text-slate-700"
                                >
                                    Zahlungsart
                                </Label>
                                <select
                                    id="payment_method"
                                    name="payment_method"
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                    defaultValue="bank"
                                >
                                    <option value="bank">Bank</option>
                                    <option value="cash">Bar</option>
                                </select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={CalendarDays}
                            title="6. Prüfung und Notizen"
                            description="Interne Hinweise zum Verkauf."
                        />

                        <div className="space-y-2">
                            <Label htmlFor="notes" className="font-bold text-slate-700">
                                Notizen
                            </Label>
                            <Textarea
                                id="notes"
                                name="notes"
                                placeholder="z. B. Zahlungsvereinbarung, Exporthinweise, offene Dokumente..."
                                className="min-h-32 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                            />
                        </div>

                        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 md:grid-cols-2">
                            <p>
                                Kunde:{" "}
                                <span className="font-extrabold text-slate-950">
                                    {buyerMode === "existing"
                                        ? selectedCustomer
                                            ? getCustomerSummaryName(selectedCustomer)
                                            : "noch nicht gewählt"
                                        : "wird neu angelegt"}
                                </span>
                            </p>
                            <p>
                                Fahrzeug:{" "}
                                <span className="font-extrabold text-slate-950">
                                    {vehicleMode === "existing"
                                        ? selectedVehicle
                                            ? getVehicleDisplayName(selectedVehicle)
                                            : "noch nicht gewählt"
                                        : "wird neu angelegt"}
                                </span>
                            </p>
                            <p>Verkaufstyp: {getSaleTypeLabel(saleType)}</p>
                            <p>Brutto: {formatCurrency(previewGrossAmount)}</p>
                        </div>
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
                            <Link href="/dashboard/sales">Abbrechen</Link>
                        </Button>

                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending ? "Speichert..." : "Verkauf speichern"}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function ExistingBuyerTaxDataEditor({
    customer,
    requireTaxNumber,
    requireVatId,
    onSaved,
}: {
    customer: CustomerRow;
    requireTaxNumber: boolean;
    requireVatId: boolean;
    onSaved: (taxData: CustomerTaxDataOverride) => void;
}) {
    const [taxNumber, setTaxNumber] = useState(customer.tax_number ?? "");
    const [vatId, setVatId] = useState(customer.vat_id ?? "");
    const [state, setState] = useState({
        success: false,
        message: "",
    });
    const [isPending, startTransition] = useTransition();

    function handleSave() {
        startTransition(async () => {
            const result = await updateSaleBuyerTaxDataAction({
                customerId: customer.id,
                taxNumber,
                vatId,
            });

            setState({
                success: result.success,
                message: result.message,
            });

            if (result.success) {
                onSaved({
                    taxNumber: result.taxNumber,
                    vatId: result.vatId,
                });
            }
        });
    }

    return (
        <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/80 p-4">
            <div>
                <h3 className="text-base font-extrabold text-amber-950">
                    Steuerdaten beim Käufer ergänzen
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                    Die Daten werden direkt im Kundenstamm gespeichert. Danach kannst du den Verkauf ohne Wechsel in die Kundenverwaltung speichern.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor={`buyer-tax-number-${customer.id}`} className="font-bold text-slate-700">
                        Steuernummer{requireTaxNumber ? " *" : ""}
                    </Label>
                    <Input
                        id={`buyer-tax-number-${customer.id}`}
                        value={taxNumber}
                        onChange={(event) => setTaxNumber(event.target.value)}
                        placeholder="Steuernummer eintragen"
                        className="h-11 rounded-2xl border-amber-200 bg-white font-medium"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor={`buyer-vat-id-${customer.id}`} className="font-bold text-slate-700">
                        USt-ID | VAT | NIP{requireVatId ? " *" : ""}
                    </Label>
                    <Input
                        id={`buyer-vat-id-${customer.id}`}
                        value={vatId}
                        onChange={(event) => setVatId(event.target.value)}
                        placeholder="z. B. DE123456789"
                        className="h-11 rounded-2xl border-amber-200 bg-white font-medium"
                    />
                </div>
            </div>

            {state.message ? (
                <p
                    role="status"
                    className={
                        state.success
                            ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"
                            : "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
                    }
                >
                    {state.message}
                </p>
            ) : null}

            <Button
                type="button"
                disabled={isPending}
                onClick={handleSave}
                className="h-11 rounded-2xl bg-amber-700 px-4 font-extrabold text-white hover:bg-amber-800"
            >
                {isPending ? "Speichert..." : "Steuerdaten beim Kunden speichern"}
            </Button>
        </div>
    );
}

function SaleTypeOption({
                            value,
                            title,
                            description,
                            checked,
                            onChange,
                        }: {
    value: SaleType;
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: SaleType) => void;
}) {
    return (
        <label className="cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-emerald-200 hover:bg-emerald-50/60 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50 has-[:checked]:ring-4 has-[:checked]:ring-emerald-100">
            <input
                type="radio"
                name="sale_type"
                value={value}
                checked={checked}
                onChange={() => onChange(value)}
                className="sr-only"
            />
            <p className="font-extrabold text-slate-950">{title}</p>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                {description}
            </p>
        </label>
    );
}

function ModeTabs<TValue extends string>({
    name,
    value,
    firstValue,
    secondValue,
    firstLabel,
    secondLabel,
    onChange,
}: {
    name: string;
    value: TValue;
    firstValue: TValue;
    secondValue: TValue;
    firstLabel: string;
    secondLabel: string;
    onChange: (value: TValue) => void;
}) {
    return (
        <div className="grid gap-3 md:grid-cols-2" role="radiogroup">
            <ModeOption
                name={name}
                value={firstValue}
                label={firstLabel}
                checked={value === firstValue}
                onChange={onChange}
            />
            <ModeOption
                name={name}
                value={secondValue}
                label={secondLabel}
                checked={value === secondValue}
                onChange={onChange}
            />
        </div>
    );
}

function ModeOption<TValue extends string>({
    name,
    value,
    label,
    checked,
    onChange,
}: {
    name: string;
    value: TValue;
    label: string;
    checked: boolean;
    onChange: (value: TValue) => void;
}) {
    return (
        <label className="cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-cyan-200 hover:bg-cyan-50/60 has-[:checked]:border-cyan-300 has-[:checked]:bg-cyan-50 has-[:checked]:ring-4 has-[:checked]:ring-cyan-100">
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => onChange(value)}
                className="sr-only"
            />
            <p className="font-extrabold text-slate-950">{label}</p>
        </label>
    );
}

function SelectedCustomerSummary({ customer }: { customer: CustomerRow }) {
    return (
        <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-4 text-sm font-semibold leading-6 text-cyan-950">
            <p className="text-base font-extrabold">{getCustomerSummaryName(customer)}</p>
            <p>
                {[customer.street, customer.postal_code, customer.city, customer.country]
                    .filter(Boolean)
                    .join(", ")}
            </p>
            <p>
                {[customer.type === "company" ? "Firma" : "Privatperson", customer.email, customer.phone]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            {customer.vat_id ? <p>USt-ID: {customer.vat_id}</p> : null}
        </div>
    );
}

function SelectedVehicleSummary({ vehicle }: { vehicle: VehicleRow }) {
    return (
        <div className="rounded-3xl border border-cyan-100 bg-cyan-50 p-4 text-sm font-semibold leading-6 text-cyan-950">
            <p className="text-base font-extrabold">
                {getVehicleDisplayName(vehicle)}
            </p>
            <p>
                {[`VIN: ${vehicle.vin}`, vehicle.construction_year ? `Baujahr: ${vehicle.construction_year}` : null]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            <p>
                {[vehicle.license_plate ? `Kennzeichen: ${vehicle.license_plate}` : null, getVehicleStatusLabel(vehicle.status)]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            {vehicle.damage_notes ? <p>Schäden: {vehicle.damage_notes}</p> : null}
        </div>
    );
}

function DamageInvoiceOption({
    visible,
    description,
}: {
    visible: boolean;
    description: string;
}) {
    if (!visible) return null;

    return (
        <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <input
                type="checkbox"
                name="include_damage_notes_on_invoice"
                value="yes"
                className="mt-1 size-4 rounded border-amber-300 text-amber-700"
            />
            <span>
                <span className="block font-extrabold text-amber-950">
                    Schäden auf Rechnung aufführen
                </span>
                <span className="mt-1 block text-sm font-medium leading-6 text-amber-900">
                    {description}
                </span>
            </span>
        </label>
    );
}

function NewVehicleFields({
    damageNotes,
    onDamageNotesChange,
}: {
    damageNotes: string;
    onDamageNotesChange: (value: string) => void;
}) {
    const hasDamageNotes = damageNotes.trim().length > 0;

    return (
        <div className="space-y-5 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div>
                <h3 className="text-lg font-extrabold text-emerald-950">
                    Neues Fahrzeug
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">
                    Das Fahrzeug wird erst beim Speichern des Verkaufs angelegt und direkt
                    mit der Verkaufsakte verknüpft.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <FormField label="Hersteller *" name="new_vehicle_manufacturer" required />
                <FormField label="Modell *" name="new_vehicle_model" required />
                <FormField label="Fahrzeugtyp *" name="new_vehicle_vehicle_type" required />
                <FormField label="FIN / VIN *" name="new_vehicle_vin" required />
                <FormField label="Kennzeichen" name="new_vehicle_license_plate" />
                <FormField
                    label="Baujahr"
                    name="new_vehicle_construction_year"
                    type="number"
                    placeholder="z. B. 2021"
                />
                <FormField
                    label="Kilometerstand"
                    name="new_vehicle_mileage"
                    type="number"
                    placeholder="z. B. 185000"
                />
                <FormField label="Farbe" name="new_vehicle_color" />
                <FormField label="Fahrzeugkategorie" name="new_vehicle_vehicle_category" />
                <FormField
                    label="Einkaufspreis netto *"
                    name="new_vehicle_purchase_price_net"
                    type="number"
                    step="0.01"
                    required
                />
                <FormField
                    label="Nebenkosten netto"
                    name="new_vehicle_additional_costs_net"
                    type="number"
                    step="0.01"
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="new_vehicle_damage_notes" className="font-bold text-slate-700">
                    Schäden
                </Label>
                <Textarea
                    id="new_vehicle_damage_notes"
                    name="new_vehicle_damage_notes"
                    value={damageNotes}
                    onChange={(event) => onDamageNotesChange(event.target.value)}
                    placeholder="Bekannte Schäden oder Mängel am Fahrzeug eintragen."
                    className="min-h-28 rounded-2xl border-slate-200 bg-white font-medium"
                />
            </div>

            <DamageInvoiceOption
                visible={hasDamageNotes}
                description="Die hier eingetragenen Schäden werden auf der Rechnung ausgegeben."
            />

            <div className="space-y-2">
                <Label htmlFor="new_vehicle_notes" className="font-bold text-slate-700">
                    Fahrzeugnotizen
                </Label>
                <Textarea
                    id="new_vehicle_notes"
                    name="new_vehicle_notes"
                    placeholder="Interne Hinweise zum Fahrzeug."
                    className="min-h-24 rounded-2xl border-slate-200 bg-white font-medium"
                />
            </div>
        </div>
    );
}

function getRequiredLabel(label: string, required: boolean): string {
    return required ? `${label} *` : label;
}

function getCustomerSummaryName(customer: CustomerRow): string {
    if (customer.type === "company") return customer.company_name ?? "Unbekannte Firma";

    return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unbekannte Privatperson";
}

function getVehicleStatusLabel(status: VehicleRow["status"]): string {
    if (status === "in_stock") return "Im Bestand";
    if (status === "reserved") return "Reserviert";
    if (status === "sold") return "Verkauft";

    return status;
}

function getSaleTypeLabel(saleType: SaleType): string {
    if (saleType === "eu") return "EU-Verkauf";
    if (saleType === "export_third_country") return "Drittlandexport";

    return "Inland";
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

function AmountPreview({ label, value }: { label: string; value: number }) {
    return (
        <div className="min-w-0 rounded-2xl border border-white bg-white p-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p className="mt-1 truncate text-lg font-extrabold text-slate-950">
                {formatCurrency(value)}
            </p>
        </div>
    );
}

function EmailLanguageField() {
    return (
        <div className="space-y-2">
            <Label
                htmlFor="new_customer_preferred_language"
                className="font-bold text-slate-700"
            >
                Sprache für E-Mails
            </Label>
            <select
                id="new_customer_preferred_language"
                name="new_customer_preferred_language"
                defaultValue="de"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
            >
                {EMAIL_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <p className="text-xs font-semibold leading-5 text-slate-500">
                Diese Sprache wird für automatisch versendete E-Mails verwendet.
            </p>
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
                       step,
                       value,
                       onChange,
                       readOnly,
                       description,
                       pattern,
                       title,
                       onInput,
                   }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
    placeholder?: string;
    step?: string;
    value?: string;
    onChange?: ChangeEventHandler<HTMLInputElement>;
    readOnly?: boolean;
    description?: string;
    pattern?: string;
    title?: string;
    onInput?: FormEventHandler<HTMLInputElement>;
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
                required={required}
                defaultValue={defaultValue}
                placeholder={placeholder}
                step={step}
                value={value}
                onChange={onChange}
                readOnly={readOnly}
                pattern={pattern}
                title={title}
                onInput={onInput}
                className={
                    readOnly
                        ? "h-12 rounded-2xl border-slate-200 bg-slate-100 font-medium text-slate-600"
                        : "h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                }
            />
            {description ? (
                <p className="text-xs font-semibold leading-5 text-slate-500">
                    {description}
                </p>
            ) : null}
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
