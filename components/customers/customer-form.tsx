"use client";

import Link from "next/link";
import { useActionState, useState, type FormEventHandler } from "react";
import { Save } from "lucide-react";

import { createCustomerAction } from "@/app/dashboard/customers/new/actions";
import { EMAIL_LANGUAGE_OPTIONS } from "@/lib/customers/email-languages";
import { phoneInputPattern, sanitizePhoneInput } from "@/lib/validation/phone";
import { PersonTypeCards, type PersonType } from "@/components/customers/person-type-cards";
import { BzstVatValidationLink } from "@/components/shared/bzst-vat-validation-link";
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

export function CustomerForm() {
    const [state, formAction, isPending] = useActionState(
        createCustomerAction,
        initialState,
    );
    const [customerType, setCustomerType] = useState<PersonType>("company");

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Neuer Kunde"
                title="Kunde anlegen"
                description="Firmenkunden und Privatpersonen erfassen und direkt in Supabase speichern."
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href="/dashboard/customers">Zurück</Link>
                    </Button>
                }
            />

            <form action={formAction} className="space-y-6">
                {state.message ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                        {state.message}
                    </div>
                ) : null}

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Kundentyp
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Wähle, ob der Kunde eine Firma oder Privatperson ist.
                            </p>
                        </div>

                        <PersonTypeCards
                            value={customerType}
                            onChange={setCustomerType}
                            inputName="type"
                        />
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Stammdaten
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Name, Ansprechpartner und Kontaktdaten.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            {customerType === "company" ? (
                                <>
                                    <FormField label="Firma *" name="company_name" required />
                                    <FormField label="Ansprechpartner" name="owner_name" />
                                </>
                            ) : (
                                <>
                                    <FormField label="Vorname *" name="first_name" required />
                                    <FormField label="Nachname *" name="last_name" required />
                                </>
                            )}
                            <FormField label="E-Mail" name="email" type="email" />
                            <EmailLanguageField defaultValue="de" />
                            {customerType === "private" ? (
                                <FormField label="Steuernummer" name="tax_number" />
                            ) : null}
                            <FormField
                                label="Telefon"
                                name="phone"
                                type="tel"
                                pattern={phoneInputPattern}
                                title="Bitte gib eine gültige Telefonnummer ein."
                                onInput={(event) => {
                                    event.currentTarget.value = sanitizePhoneInput(
                                        event.currentTarget.value,
                                    );
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Adresse
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Rechnungs- und Kundendaten.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField label="Straße und Hausnummer *" name="street" required />
                            <FormField label="PLZ *" name="postal_code" required />
                            <FormField label="Ort *" name="city" required />
                            <FormField label="Land" name="country" defaultValue="Deutschland" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                {customerType === "company" ? "Steuer & Register" : "Notizen"}
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                {customerType === "company"
                                    ? "Optional für Rechnungen, Export und Pflichtprüfung."
                                    : "Interne Hinweise zum Kunden."}
                            </p>
                        </div>

                        {customerType === "company" ? (
                            <div className="grid gap-4 md:grid-cols-3">
                                <FormField label="Steuernummer" name="tax_number" />
                                <div className="space-y-2">
                                    <FormField label="USt-ID" name="vat_id" />
                                    <BzstVatValidationLink />
                                </div>
                                <FormField
                                    label="Handelsregister"
                                    name="commercial_register_number"
                                />
                            </div>
                        ) : null}

                        {customerType === "company" ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                <FileField label="Beweisbild 1" name="bzst_evidence_1" />
                                <FileField label="Beweisbild 2" name="bzst_evidence_2" />
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <Label htmlFor="notes" className="font-bold text-slate-700">
                                Notizen
                            </Label>
                            <Textarea
                                id="notes"
                                name="notes"
                                placeholder="Interne Hinweise zum Kunden..."
                                className="min-h-32 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                            />
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
                            <Link href="/dashboard/customers">Abbrechen</Link>
                        </Button>

                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending ? "Speichert..." : "Kunde speichern"}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function EmailLanguageField({ defaultValue = "de" }: { defaultValue?: string }) {
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
                defaultValue={defaultValue}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 font-medium text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
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
                       pattern,
                       title,
                       onInput,
                   }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
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
                pattern={pattern}
                title={title}
                onInput={onInput}
                className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-medium"
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
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-cyan-800"
            />
        </div>
    );
}
