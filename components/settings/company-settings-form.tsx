"use client";

import { type ChangeEvent, useActionState, useEffect, useRef, useState } from "react";
import {
    Building2,
    CheckCircle2,
    FileSignature,
    ImageIcon,
    Mail,
    MapPin,
    Landmark,
    Save,
    ShieldCheck,
    Stamp,
    Trash2,
    Upload,
} from "lucide-react";

import {
    removeCompanySignatureAssetAction,
    removeCompanyTermsPdfAction,
    updateCompanySettingsAction,
    uploadCompanySignatureAssetAction,
    uploadCompanyTermsPdfAction,
    type UpdateCompanySettingsState,
} from "@/app/dashboard/settings/actions";
import type { CompanySettings } from "@/lib/settings/company-settings-queries";
import {
    getImageAssetTooLargeMessage,
    getInvalidTermsPdfMessage,
    getUnsupportedImageAssetTypeMessage,
    imageAssetAcceptMimeTypes,
    isAllowedTermsPdfFile,
    isAllowedImageAssetFile,
    maxImageAssetFileSizeBytes,
    maxTermsPdfFileSizeBytes,
    termsPdfAcceptMimeTypes,
} from "@/lib/documents/upload-validation";
import { formatDate } from "@/lib/format/date";
import { FlashMessage } from "@/components/shared/flash-message";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanySettingsFormProps = {
    company: CompanySettings;
    companySaved?: boolean;
    signatureUploaded?: boolean;
    stampUploaded?: boolean;
    assetUploadError?: string;
    termsUploaded?: boolean;
    termsRemoved?: boolean;
    termsUploadError?: string;
};

function createInitialState(company: CompanySettings): UpdateCompanySettingsState {
    return {
        success: false,
        message: "",
        values: {
            legal_name: company.legal_name ?? "",
            street: company.street ?? "",
            postal_code: company.postal_code ?? "",
            city: company.city ?? "",
            country: company.country ?? "Deutschland",
            email: company.email ?? "",
            website: company.website ?? "",
            phone: company.phone ?? "",
            mobile_phone_1: company.mobile_phone_1 ?? "",
            mobile_phone_2: company.mobile_phone_2 ?? "",
            vat_id: company.vat_id ?? "",
            tax_number: company.tax_number ?? "",
            commercial_register_number: company.commercial_register_number ?? "",
            bank_name: company.bank_name ?? "",
            bank_blz: company.bank_blz ?? "",
            bank_iban: company.bank_iban ?? "",
            bank_bic: company.bank_bic ?? "",
            bank_account_holder: company.bank_account_holder ?? company.legal_name ?? "",
        },
    };
}

export function CompanySettingsForm({
    company,
    companySaved = false,
    signatureUploaded = false,
    stampUploaded = false,
    assetUploadError,
    termsUploaded = false,
    termsRemoved = false,
    termsUploadError,
}: CompanySettingsFormProps) {
    const [state, formAction, isPending] = useActionState(
        updateCompanySettingsAction,
        createInitialState(company),
    );
    const statusMessageRef = useRef<HTMLDivElement | null>(null);

    const values = state.values;

    useEffect(() => {
        const hasErrorMessage =
            Boolean(state.message && !state.success) ||
            Boolean(assetUploadError) ||
            Boolean(termsUploadError);
        const hasSuccessMessage = companySaved || Boolean(state.message && state.success);

        if (!hasErrorMessage && !hasSuccessMessage) return;

        statusMessageRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
        statusMessageRef.current?.focus({ preventScroll: true });
    }, [assetUploadError, companySaved, state.message, state.success, termsUploadError]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Einstellungen"
                title="Firmendaten"
                description="Stammdaten für Rechnungen, Dokumente, Exporte und interne Prozesse verwalten."
            />

            {companySaved ? (
                <div
                    ref={statusMessageRef}
                    role="status"
                    tabIndex={-1}
                    className="scroll-mt-4 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 shadow-sm outline-none"
                >
                    <CheckCircle2 className="mr-2 inline size-4" />
                    Firmendaten wurden erfolgreich gespeichert.
                </div>
            ) : null}

            {signatureUploaded ? (
                <FlashMessage message="Digitale Unterschrift wurde hochgeladen." />
            ) : null}

            {stampUploaded ? (
                <FlashMessage message="Firmenstempel wurde hochgeladen." />
            ) : null}

            {termsUploaded ? (
                <FlashMessage message="AGB-PDF wurde hochgeladen." />
            ) : null}

            {termsRemoved ? (
                <FlashMessage message="AGB-PDF wurde entfernt." />
            ) : null}

            {assetUploadError ? (
                <div
                    ref={companySaved ? undefined : statusMessageRef}
                    role="alert"
                    tabIndex={-1}
                    className="scroll-mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 shadow-sm outline-none"
                >
                    {getAssetUploadErrorMessage(assetUploadError)}
                </div>
            ) : null}

            {termsUploadError ? (
                <div
                    ref={assetUploadError || companySaved ? undefined : statusMessageRef}
                    role="alert"
                    tabIndex={-1}
                    className="scroll-mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 shadow-sm outline-none"
                >
                    {getTermsUploadErrorMessage(termsUploadError)}
                </div>
            ) : null}

            <form action={formAction} className="space-y-6">
                {state.message ? (
                    <div
                        ref={!assetUploadError && !termsUploadError && !companySaved ? statusMessageRef : undefined}
                        role={state.success ? "status" : "alert"}
                        tabIndex={-1}
                        className={
                            state.success
                                ? "scroll-mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 outline-none"
                                : "scroll-mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 outline-none"
                        }
                    >
                        {state.success ? (
                            <CheckCircle2 className="mr-2 inline size-4" />
                        ) : null}
                        {state.message}
                    </div>
                ) : null}

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Building2}
                            title="Unternehmen"
                            description="Offizielle Firmendaten für Belege und Dokumente."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Firmenname *"
                                name="legal_name"
                                defaultValue={values.legal_name}
                                required
                            />

                            <FormField
                                label="Land"
                                name="country"
                                defaultValue={values.country}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={MapPin}
                            title="Adresse"
                            description="Anschrift des Unternehmens."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Straße *"
                                name="street"
                                defaultValue={values.street}
                                required
                            />

                            <FormField
                                label="Postleitzahl *"
                                name="postal_code"
                                defaultValue={values.postal_code}
                                required
                            />

                            <FormField
                                label="Ort *"
                                name="city"
                                defaultValue={values.city}
                                required
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Mail}
                            title="Kontakt"
                            description="Kontaktangaben für Dokumente und Kommunikation."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="E-Mail"
                                name="email"
                                type="email"
                                defaultValue={values.email}
                            />

                            <FormField
                                label="Website"
                                name="website"
                                defaultValue={values.website}
                            />

                            <FormField
                                label="Telefon"
                                name="phone"
                                defaultValue={values.phone}
                            />

                            <FormField
                                label="Mobile 1"
                                name="mobile_phone_1"
                                defaultValue={values.mobile_phone_1}
                            />

                            <FormField
                                label="Mobile 2"
                                name="mobile_phone_2"
                                defaultValue={values.mobile_phone_2}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={ShieldCheck}
                            title="Steuerdaten"
                            description="USt-ID, Steuernummer und Handelsregisterkennung für Rechnungen."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="USt-ID"
                                name="vat_id"
                                defaultValue={values.vat_id}
                            />

                            <FormField
                                label="Steuernummer"
                                name="tax_number"
                                defaultValue={values.tax_number}
                            />

                            <FormField
                                label="Handelsregisternummer"
                                name="commercial_register_number"
                                defaultValue={values.commercial_register_number}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Landmark}
                            title="Bankverbindung"
                            description="Diese Bankdaten werden zentral auf Rechnungen und E-Rechnungsdaten verwendet."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Kontoinhaber"
                                name="bank_account_holder"
                                defaultValue={values.bank_account_holder}
                            />

                            <FormField
                                label="Bankname *"
                                name="bank_name"
                                defaultValue={values.bank_name}
                                required
                            />

                            <FormField
                                label="IBAN *"
                                name="bank_iban"
                                defaultValue={values.bank_iban}
                                required
                            />

                            <FormField
                                label="BIC"
                                name="bank_bic"
                                defaultValue={values.bank_bic}
                            />

                            <FormField
                                label="BLZ"
                                name="bank_blz"
                                defaultValue={values.bank_blz}
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending ? "Speichert..." : "Firmendaten speichern"}
                        </Button>
                    </div>
                </div>
            </form>

            <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="space-y-5 p-5">
                    <SectionTitle
                        icon={FileSignature}
                        title="Unterschrift & Stempel"
                        description="Lade hier die digitale Unterschrift und den Firmenstempel hoch. Beide können später optional in Rechnungen und Dokumente eingefügt werden."
                    />

                    <div className="grid gap-4 lg:grid-cols-2">
                        <CompanyAssetUploadCard
                            assetType="signature"
                            title="Unterschrift"
                            description="Digitale Unterschrift als PNG, JPG oder WEBP."
                            icon={FileSignature}
                            imagePath={company.signature_image_path}
                        />
                        <CompanyAssetUploadCard
                            assetType="stamp"
                            title="Firmenstempel"
                            description="Firmenstempel als PNG, JPG oder WEBP."
                            icon={Stamp}
                            imagePath={company.stamp_image_path}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="space-y-5 p-5">
                    <SectionTitle
                        icon={FileSignature}
                        title="Allgemeine Geschäftsbedingungen"
                        description="Hier können die aktuell gültigen AGB als PDF hinterlegt werden. Die Datei wird bei neu erzeugten Rechnungen hinter den Rechnungsseiten angefügt."
                    />

                    <CompanyTermsPdfCard company={company} />
                </CardContent>
            </Card>
        </div>
    );
}

function SectionTitle({
                          icon: Icon,
                          title,
                          description,
                      }: {
    icon: typeof Building2;
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

function CompanyTermsPdfCard({ company }: { company: CompanySettings }) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const hasTermsPdf = Boolean(company.terms_pdf_path);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget;
        const file = input.files?.[0];

        setErrorMessage(null);

        if (!file) {
            setErrorMessage("Bitte wähle eine PDF-Datei aus.");
            return;
        }

        if (file.size > maxTermsPdfFileSizeBytes || !isAllowedTermsPdfFile(file)) {
            setErrorMessage(getInvalidTermsPdfMessage());
            input.value = "";
            return;
        }

        input.form?.requestSubmit();
    }

    return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-wide text-slate-400">
                        Aktuelle Datei
                    </p>
                    {hasTermsPdf ? (
                        <>
                            <p className="mt-1 truncate text-lg font-extrabold text-slate-950">
                                {company.terms_pdf_filename ?? "AGB.pdf"}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                Aktualisiert am{" "}
                                {company.terms_pdf_uploaded_at
                                    ? formatDate(company.terms_pdf_uploaded_at)
                                    : "unbekannt"}
                            </p>
                        </>
                    ) : (
                        <p className="mt-1 text-sm font-bold text-slate-500">
                            Es sind derzeit keine AGB hinterlegt.
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {hasTermsPdf ? (
                        <Button
                            asChild
                            variant="outline"
                            className="h-10 rounded-xl bg-white font-bold"
                        >
                            <a href="/api/company-assets/terms" target="_blank">
                                Öffnen / Herunterladen
                            </a>
                        </Button>
                    ) : null}

                    <form action={uploadCompanyTermsPdfAction}>
                        <label className="inline-flex h-10 cursor-pointer items-center rounded-xl bg-cyan-700 px-4 text-sm font-extrabold text-white transition hover:bg-cyan-800">
                            <Upload className="mr-2 size-4" />
                            {hasTermsPdf ? "AGB ersetzen" : "AGB-PDF hochladen"}
                            <input
                                name="file"
                                type="file"
                                accept={termsPdfAcceptMimeTypes}
                                required
                                className="sr-only"
                                onChange={handleFileChange}
                            />
                        </label>
                    </form>

                    {hasTermsPdf ? (
                        <form
                            action={removeCompanyTermsPdfAction}
                            onSubmit={(event) => {
                                if (
                                    !window.confirm(
                                        "AGB-PDF wirklich entfernen? Neu erzeugte Rechnungen enthalten dann keine AGB-Seiten mehr.",
                                    )
                                ) {
                                    event.preventDefault();
                                }
                            }}
                        >
                            <Button
                                type="submit"
                                variant="outline"
                                className="h-10 rounded-xl border-red-100 bg-white font-bold text-red-700 hover:bg-red-50"
                            >
                                <Trash2 className="mr-2 size-4" />
                                AGB entfernen
                            </Button>
                        </form>
                    ) : null}
                </div>
            </div>

            {errorMessage ? (
                <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                    {errorMessage}
                </p>
            ) : null}
        </div>
    );
}

function FormField({
                       label,
                       name,
                       type = "text",
                       required = false,
                       defaultValue,
                   }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
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
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </div>
    );
}

function CompanyAssetUploadCard({
                                    assetType,
                                    title,
                                    description,
                                    icon: Icon,
                                    imagePath,
                                }: {
    assetType: "signature" | "stamp";
    title: string;
    description: string;
    icon: typeof FileSignature;
    imagePath: string | null;
}) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const input = event.currentTarget;
        const file = input.files?.[0];

        setErrorMessage(null);

        if (!file) {
            setErrorMessage("Bitte wähle eine Datei aus.");
            return;
        }

        if (file.size > maxImageAssetFileSizeBytes) {
            setErrorMessage(getImageAssetTooLargeMessage());
            input.value = "";
            return;
        }

        if (!isAllowedImageAssetFile(file)) {
            setErrorMessage(getUnsupportedImageAssetTypeMessage());
            input.value = "";
            return;
        }

        input.form?.requestSubmit();
    }

    return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700">
                    <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                    <h3 className="font-extrabold text-slate-950">{title}</h3>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                        {description}
                    </p>
                </div>
            </div>

            <div className="mt-4 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-4">
                {imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={`/api/company-assets/${assetType}?refresh=${encodeURIComponent(
                            imagePath,
                        )}`}
                        alt={title}
                        className="max-h-28 max-w-full object-contain"
                    />
                ) : (
                    <div className="text-center">
                        <ImageIcon className="mx-auto size-7 text-slate-300" />
                        <p className="mt-2 text-sm font-bold text-slate-400">
                            Noch nicht hinterlegt
                        </p>
                    </div>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                <form action={uploadCompanySignatureAssetAction}>
                    <input type="hidden" name="asset_type" value={assetType} />
                    <label className="inline-flex h-10 cursor-pointer items-center rounded-xl bg-cyan-700 px-4 text-sm font-extrabold text-white transition hover:bg-cyan-800">
                        <Upload className="mr-2 size-4" />
                        {imagePath ? "Ersetzen" : `${title} hochladen`}
                        <input
                            name="file"
                            type="file"
                            accept={imageAssetAcceptMimeTypes}
                            required
                            className="sr-only"
                            onChange={handleFileChange}
                        />
                    </label>
                </form>

                {imagePath ? (
                    <form action={removeCompanySignatureAssetAction}>
                        <input type="hidden" name="asset_type" value={assetType} />
                        <Button
                            type="submit"
                            variant="outline"
                            className="h-10 rounded-xl border-red-100 bg-white font-bold text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="mr-2 size-4" />
                            Entfernen
                        </Button>
                    </form>
                ) : null}
            </div>

            {errorMessage ? (
                <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                    {errorMessage}
                </p>
            ) : null}
        </div>
    );
}

function getAssetUploadErrorMessage(errorCode: string): string {
    if (errorCode === "fileTooLarge") {
        return getImageAssetTooLargeMessage();
    }

    if (errorCode === "unsupportedType") {
        return getUnsupportedImageAssetTypeMessage();
    }

    if (errorCode === "missingFile") {
        return "Bitte wähle eine Datei aus.";
    }

    return "Unterschrift oder Stempel konnte nicht hochgeladen werden. Bitte versuche es erneut.";
}

function getTermsUploadErrorMessage(errorCode: string): string {
    if (errorCode === "invalidFile") {
        return getInvalidTermsPdfMessage();
    }

    if (errorCode === "removeFailed") {
        return "AGB-PDF konnte nicht entfernt werden. Bitte versuche es erneut.";
    }

    return "AGB-PDF konnte nicht hochgeladen werden. Bitte versuche es erneut.";
}
