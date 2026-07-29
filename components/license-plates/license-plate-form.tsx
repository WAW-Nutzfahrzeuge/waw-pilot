"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import {
    ArrowLeft,
    BadgeCheck,
    CalendarDays,
    ClipboardList,
    FileText,
    Save,
    Truck,
} from "lucide-react";

import { createLicensePlateCaseAction } from "@/app/dashboard/plates/new/actions";
import { updateLicensePlateCaseAction } from "@/app/dashboard/plates/[plateCaseId]/edit/actions";
import type { LicensePlateFormData } from "@/lib/license-plates/license-plate-form-data";
import type { LicensePlateType } from "@/lib/license-plates/license-plate-queries";
import {
    captureFormSnapshot,
    restoreFormSnapshot,
    type FormSnapshot,
} from "@/lib/forms/form-snapshot";
import { useFormActionFeedback } from "@/components/forms/use-form-action-feedback";
import { ActionMessage } from "@/components/shared/action-message";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerCombobox } from "@/components/customers/customer-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState = {
    success: false,
    message: "",
};

type LicensePlateFormInitialValues = {
    id?: string;
    plate_type?: LicensePlateType;
    duration_days?: number | null;
    vehicle_id?: string | null;
    customer_id?: string | null;
    sale_id?: string | null;
    requested_at?: string | null;
    valid_from?: string | null;
    license_plate_number?: string | null;
    registration_office?: string | null;
    notes?: string | null;
};

type LicensePlateFormProps = {
    formData: LicensePlateFormData;
    mode?: "create" | "edit";
    initialValues?: LicensePlateFormInitialValues;
};

export function LicensePlateForm({
                                     formData,
                                     mode = "create",
                                     initialValues,
                                 }: LicensePlateFormProps) {
    const action =
        mode === "edit"
            ? updateLicensePlateCaseAction
            : createLicensePlateCaseAction;

    const [state, formAction, isPending] = useActionState(action, initialState);
    const formRef = useRef<HTMLFormElement | null>(null);
    const messageRef = useRef<HTMLDivElement | null>(null);
    const lastSubmittedSnapshotRef = useRef<FormSnapshot | null>(null);

    const [plateType, setPlateType] = useState<LicensePlateType>(
        initialValues?.plate_type ?? "short_term",
    );

    const today = new Date().toISOString().slice(0, 10);

    const backHref =
        mode === "edit" && initialValues?.id
            ? `/dashboard/plates/${initialValues.id}`
            : "/dashboard/plates";

    useFormActionFeedback({
        message: state.message,
        success: state.success,
        messageRef,
        restoreLastSubmission: () => {
            const form = formRef.current;
            const snapshot = lastSubmittedSnapshotRef.current;

            if (!form || !snapshot) return;

            window.requestAnimationFrame(() => restoreFormSnapshot(form, snapshot));
        },
    });

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kennzeichen"
                title={
                    mode === "edit"
                        ? "Kennzeichen-Vorgang bearbeiten"
                        : "Kennzeichen-Vorgang anlegen"
                }
                description={
                    mode === "edit"
                        ? "Bearbeite Kennzeichenart, Gültigkeit, Kennzeichen, Bezug und Notizen."
                        : "Erstelle einen Vorgang für Kurzzeit-, Export- oder Zollkennzeichen."
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

            <form
                ref={formRef}
                action={formAction}
                className="space-y-6"
                onSubmit={(event) => {
                    lastSubmittedSnapshotRef.current = captureFormSnapshot(
                        event.currentTarget,
                    );
                }}
            >
                {initialValues?.id ? (
                    <input
                        type="hidden"
                        name="plate_case_id"
                        value={initialValues.id}
                    />
                ) : null}

                {state.message ? (
                    <ActionMessage
                        ref={messageRef}
                        title={state.message}
                        tone={state.success ? "success" : "danger"}
                    />
                ) : null}

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={BadgeCheck}
                            title="Kennzeichenart"
                            description="Wähle aus, welcher Kennzeichen-Vorgang angelegt werden soll."
                        />

                        <div className="grid gap-3 md:grid-cols-3">
                            <RadioBox
                                name="plate_type"
                                value="short_term"
                                title="Kurzzeitkennzeichen"
                                description="3, 5 oder 6 Tage."
                                checked={plateType === "short_term"}
                                onChange={() => setPlateType("short_term")}
                            />
                            <RadioBox
                                name="plate_type"
                                value="export"
                                title="Exportkennzeichen"
                                description="Für Ausfuhr / Export."
                                checked={plateType === "export"}
                                onChange={() => setPlateType("export")}
                            />
                            <RadioBox
                                name="plate_type"
                                value="customs"
                                title="Zollkennzeichen"
                                description="Für Zoll-/Exportvorgänge."
                                checked={plateType === "customs"}
                                onChange={() => setPlateType("customs")}
                            />
                        </div>

                        {plateType === "short_term" ? (
                            <div className="space-y-2">
                                <Label
                                    htmlFor="duration_days"
                                    className="font-bold text-slate-700"
                                >
                                    Dauer *
                                </Label>
                                <select
                                    id="duration_days"
                                    name="duration_days"
                                    defaultValue={String(initialValues?.duration_days ?? 5)}
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100 md:w-72"
                                >
                                    <option value="3">3 Tage</option>
                                    <option value="5">5 Tage</option>
                                    <option value="6">6 Tage</option>
                                </select>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Truck}
                            title="Bezug"
                            description="Verknüpfe den Vorgang mit Fahrzeug und Kunde. Verkauf ist optional."
                        />

                        <div className="grid gap-4 md:grid-cols-3">
                            <SelectField
                                label="Verkauf"
                                name="sale_id"
                                placeholder="Kein Verkauf"
                                options={formData.sales}
                                defaultValue={initialValues?.sale_id ?? ""}
                            />
                            <SelectField
                                label="Fahrzeug *"
                                name="vehicle_id"
                                placeholder="Fahrzeug auswählen"
                                options={formData.vehicles}
                                defaultValue={initialValues?.vehicle_id ?? ""}
                                required
                            />
                            <div className="md:col-span-3">
                                <CustomerCombobox
                                    customers={formData.customers}
                                    name="customer_id"
                                    label="Kunde *"
                                    value={initialValues?.customer_id ?? ""}
                                    required
                                    placeholder="Kunde nach Name, Firma, E-Mail oder Ort suchen..."
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={CalendarDays}
                            title="Zeitraum"
                            description="Antragsdatum und gewünschter Gültigkeitsbeginn."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Antragsdatum *"
                                name="requested_at"
                                type="date"
                                defaultValue={initialValues?.requested_at ?? today}
                                required
                            />
                            <FormField
                                label="Gültig ab"
                                name="valid_from"
                                type="date"
                                defaultValue={initialValues?.valid_from ?? today}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={ClipboardList}
                            title="Details"
                            description="Kennzeichen, Zulassungsstelle und interne Notizen."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Kennzeichen"
                                name="license_plate_number"
                                placeholder="z. B. HH-AB 123"
                                defaultValue={initialValues?.license_plate_number ?? ""}
                            />
                            <FormField
                                label="Zulassungsstelle"
                                name="registration_office"
                                placeholder="z. B. Hamburg"
                                defaultValue={initialValues?.registration_office ?? ""}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label
                                htmlFor="notes"
                                className="font-bold text-slate-700"
                            >
                                Notizen
                            </Label>
                            <Textarea
                                id="notes"
                                name="notes"
                                defaultValue={initialValues?.notes ?? ""}
                                placeholder="Interne Hinweise zum Vorgang..."
                                className="min-h-28 rounded-2xl border-slate-200 bg-slate-50 font-medium"
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
                                    : "Vorgang speichern"}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function RadioBox({
                      name,
                      value,
                      title,
                      description,
                      checked,
                      onChange,
                  }: {
    name: string;
    value: LicensePlateType;
    title: string;
    description: string;
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <label className="cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-emerald-200 hover:bg-emerald-50/60 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50 has-[:checked]:ring-4 has-[:checked]:ring-emerald-100">
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={onChange}
                className="sr-only"
            />
            <p className="font-extrabold text-slate-950">{title}</p>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                {description}
            </p>
        </label>
    );
}

function SectionTitle({
                          icon: Icon,
                          title,
                          description,
                      }: {
    icon: typeof FileText;
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
                   }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
    placeholder?: string;
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
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </div>
    );
}

function SelectField({
                         label,
                         name,
                         placeholder,
                         options,
                         defaultValue = "",
                         required = false,
                     }: {
    label: string;
    name: string;
    placeholder: string;
    options: { id: string; label: string }[];
    defaultValue?: string;
    required?: boolean;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
            </Label>
            <select
                id={name}
                name={name}
                required={required}
                defaultValue={defaultValue}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
            >
                <option value="">{placeholder}</option>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
