"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { CalendarDays, FileText, Save, Truck } from "lucide-react";

import { createVehicleAction } from "@/app/dashboard/vehicles/new/actions";
import type { CustomerRow } from "@/lib/customers/customer-queries";
import {
    captureFormSnapshot,
    restoreFormSnapshot,
    type FormSnapshot,
} from "@/lib/forms/form-snapshot";
import { useFormActionFeedback } from "@/components/forms/use-form-action-feedback";
import { ActionMessage } from "@/components/shared/action-message";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VehicleDocumentUploadFields } from "@/components/vehicles/vehicle-document-upload-fields";
import { CustomerCombobox } from "@/components/customers/customer-combobox";

const initialState = {
    success: false,
    message: "",
};

type VehicleFormProps = {
    customers: CustomerRow[];
};

export function VehicleForm({
                                customers,
                            }: VehicleFormProps) {
    const [state, formAction, isPending] = useActionState(
        createVehicleAction,
        initialState,
    );
    const formRef = useRef<HTMLFormElement | null>(null);
    const messageRef = useRef<HTMLDivElement | null>(null);
    const lastSubmittedSnapshotRef = useRef<FormSnapshot | null>(null);

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
                eyebrow="Neuer Fahrzeugankauf"
                title="Fahrzeug ankaufen / erfassen"
                description="Fahrzeugdaten, Einkaufspreis, Dokumente und optional Verkäufer-Kunde speichern."
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href="/dashboard/vehicles">Zurück</Link>
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
                            icon={Truck}
                            title="Stammdaten"
                            description="Technische Basisdaten des Fahrzeugs."
                        />

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <FormField label="Hersteller *" name="manufacturer" required />
                            <FormField label="Modell *" name="model" required />
                            <FormField label="Fahrzeugtyp *" name="vehicle_type" required />
                            <FormField label="FIN / VIN *" name="vin" required />
                            <FormField
                                label="Vorheriges Kennzeichen (optional)"
                                name="license_plate"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={CalendarDays}
                            title="Zulassung & Zustand"
                            description="Baujahr und bekannte Schäden erfassen."
                        />

                        <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                                label="Baujahr"
                                name="construction_year"
                                type="number"
                                placeholder="z. B. 2019"
                            />
                            <FormField
                                label="Ankaufsdatum"
                                name="purchase_date"
                                type="date"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="damage_notes" className="font-bold text-slate-700">
                                Schäden
                            </Label>
                            <Textarea
                                id="damage_notes"
                                name="damage_notes"
                                placeholder="Bekannte Schäden oder Mängel am Fahrzeug eintragen."
                                className="min-h-28 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                            />
                            <p className="text-xs font-semibold text-slate-500">
                                Bekannte Schäden oder Mängel am Fahrzeug eintragen.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={FileText}
                            title="Dokumente"
                            description="Fahrzeugschein und Einkaufsrechnung direkt mit dem Fahrzeug speichern."
                        />

                        <VehicleDocumentUploadFields
                            fields={[
                                {
                                    name: "vehicle_registration_file",
                                    label: "Fahrzeugschein",
                                    description: "PDF, JPG, JPEG oder PNG auswählen.",
                                },
                                {
                                    name: "purchase_invoice_file",
                                    label: "Einkaufsrechnung",
                                    description: "PDF, JPG, JPEG oder PNG auswählen.",
                                },
                            ]}
                        />
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Preise & Verkäufer
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Einkaufspreis und optionale Kundenzuordnung.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <FormField
                                label="Einkaufspreis netto *"
                                name="purchase_price_net"
                                type="number"
                                step="0.01"
                                required
                            />
                            <div className="space-y-2 md:col-span-2 xl:col-span-3">
                                <CustomerCombobox
                                    customers={customers}
                                    name="seller_customer_id"
                                    label="Verkäufer-Kunde"
                                    placeholder="Name, Firma, Ort, E-Mail oder USt-ID suchen..."
                                    emptyText="Kein Verkäufer gefunden."
                                />
                                <p className="text-xs font-semibold text-slate-500">
                                    Wenn du einen Verkäufer auswählst, wird zusätzlich ein Ankauf
                                    in der Tabelle purchases gespeichert.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-950">
                                Notizen
                            </h2>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Interne Hinweise zum Fahrzeug, Zustand oder Ankauf.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes" className="font-bold text-slate-700">
                                Notizen
                            </Label>
                            <Textarea
                                id="notes"
                                name="notes"
                                placeholder="z. B. Zustand, Ausstattung, offene Punkte..."
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
                            <Link href="/dashboard/vehicles">Abbrechen</Link>
                        </Button>

                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending ? "Speichert..." : "Fahrzeug speichern"}
                        </Button>
                    </div>
                </div>
            </form>
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
                       step,
                   }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
    placeholder?: string;
    step?: string;
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
                className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </div>
    );
}
