"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
    ArrowLeft,
    Download,
    ExternalLink,
    FileText,
    Save,
    Truck,
    Wallet,
} from "lucide-react";

import type { VehicleDetail } from "@/lib/vehicles/vehicle-detail-queries";
import {
    updateVehicleAction,
    type UpdateVehicleState,
} from "@/app/dashboard/vehicles/[vehicleId]/edit/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { DocumentCard } from "@/components/shared/document-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { VehicleDocumentUploadForm } from "@/components/vehicles/vehicle-document-upload-form";
import {
    formatFileSize,
    getDocumentSourceLabel,
} from "@/lib/documents/document-helpers";

type VehicleEditFormProps = {
    vehicle: VehicleDetail;
};

const initialState: UpdateVehicleState = {
    success: false,
    message: "",
};

function getNumberInputValue(value: number | null): string {
    if (value === null) return "";

    return String(value);
}

export function VehicleEditForm({ vehicle }: VehicleEditFormProps) {
    const updateVehicle = updateVehicleAction.bind(null, vehicle.id);
    const [state, formAction] = useActionState(updateVehicle, initialState);
    const [damageNotes, setDamageNotes] = useState(vehicle.damage_notes ?? "");
    const formRef = useRef<HTMLFormElement | null>(null);
    const messageRef = useRef<HTMLDivElement | null>(null);
    const lastSubmittedSnapshotRef = useRef<FormSnapshot | null>(null);
    const primaryDocumentTypes = [
        {
            type: "vehicle_registration" as const,
            label: "Fahrzeugschein",
            description: "Zulassungsdokument des Fahrzeugs.",
        },
        {
            type: "purchase_invoice" as const,
            label: "Einkaufsrechnung",
            description: "Rechnung oder Beleg zum Fahrzeugankauf.",
        },
    ];
    const primaryDocuments = primaryDocumentTypes.map((definition) => ({
        ...definition,
        document:
            vehicle.documents.find(
                (document) => document.document_type === definition.type,
            ) ?? null,
    }));

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
                eyebrow="Fahrzeugakte"
                title={`Fahrzeug bearbeiten · ${vehicle.manufacturer} ${vehicle.model}`}
                description="Stammdaten, Preise, Status und Notizen des Fahrzeugs ändern."
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href={`/dashboard/vehicles/${vehicle.id}`}>
                            <ArrowLeft className="mr-2 size-4" />
                            Zurück zur Akte
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
                {state.message ? (
                    <ActionMessage
                        ref={messageRef}
                        title={state.message}
                        tone={state.success ? "success" : "danger"}
                    />
                ) : null}

                <section className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
                    <div className="space-y-6">
                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={Truck}
                                    title="Fahrzeugdaten"
                                    description="Technische Stammdaten und interne Zuordnung."
                                />

                                <div className="mt-6 grid gap-4 md:grid-cols-2">
                                    <FormField label="Status" htmlFor="status" required>
                                        <select
                                            id="status"
                                            name="status"
                                            defaultValue={vehicle.status}
                                            required
                                            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                                        >
                                            <option value="in_stock">Im Bestand</option>
                                            <option value="reserved">Reserviert</option>
                                            <option value="sold">Verkauft</option>
                                        </select>
                                    </FormField>

                                    <FormField label="Hersteller" htmlFor="manufacturer" required>
                                        <Input
                                            id="manufacturer"
                                            name="manufacturer"
                                            defaultValue={vehicle.manufacturer}
                                            required
                                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                        />
                                    </FormField>

                                    <FormField label="Modell" htmlFor="model" required>
                                        <Input
                                            id="model"
                                            name="model"
                                            defaultValue={vehicle.model}
                                            required
                                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                        />
                                    </FormField>

                                    <FormField label="Fahrzeugtyp" htmlFor="vehicle_type" required>
                                        <Input
                                            id="vehicle_type"
                                            name="vehicle_type"
                                            defaultValue={vehicle.vehicle_type}
                                            required
                                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                        />
                                    </FormField>

                                    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 md:col-span-2">
                                        <p className="text-sm font-extrabold text-slate-700">
                                            Baujahr
                                        </p>
                                        <div className="mt-3">
                                            <FormField label="Baujahr" htmlFor="construction_year">
                                                <Input
                                                    id="construction_year"
                                                    name="construction_year"
                                                    type="number"
                                                    min="1900"
                                                    max="2100"
                                                    defaultValue={getNumberInputValue(vehicle.construction_year)}
                                                    className="h-12 rounded-2xl border-slate-200 bg-white font-semibold"
                                                />
                                            </FormField>
                                        </div>
                                    </div>

                                    <FormField label="Vorheriges Kennzeichen (optional)" htmlFor="license_plate">
                                        <Input
                                            id="license_plate"
                                            name="license_plate"
                                            defaultValue={vehicle.license_plate ?? ""}
                                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                        />
                                    </FormField>

                                    <div className="md:col-span-2">
                                        <FormField label="Fahrgestellnummer / VIN" htmlFor="vin" required>
                                            <Input
                                                id="vin"
                                                name="vin"
                                                defaultValue={vehicle.vin}
                                                required
                                                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-mono font-semibold"
                                            />
                                        </FormField>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={Wallet}
                                    title="Preise & Kalkulation"
                                    description="Einkauf, Verkauf und Rohgewinn-Basis."
                                />

                                <input
                                    type="hidden"
                                    name="additional_costs_net"
                                    value={vehicle.additional_costs_net}
                                />

                                <div className="mt-6 grid gap-4 md:grid-cols-2">
                                    <FormField label="Einkauf netto" htmlFor="purchase_price_net" required>
                                        <Input
                                            id="purchase_price_net"
                                            name="purchase_price_net"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            defaultValue={vehicle.purchase_price_net}
                                            required
                                            className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                        />
                                    </FormField>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="space-y-5 p-5">
                                <SectionTitle
                                    icon={FileText}
                                    title="Dokumente"
                                    description="Fahrzeugschein und Einkaufsrechnung öffnen, ersetzen oder entfernen."
                                />

                                <div className="space-y-4">
                                    {primaryDocuments.map(
                                        ({ type, label, description, document }) => (
                                            <DocumentCard
                                                key={type}
                                                title={label}
                                                description={description}
                                                meta={
                                                    document
                                                        ? `${document.file_name} · ${formatFileSize(document.file_size)} · ${getDocumentSourceLabel(document.source as "generated" | "uploaded")}`
                                                        : "Noch nicht hochgeladen"
                                                }
                                                status={
                                                    <StatusBadge
                                                        tone={
                                                            document?.status === "available"
                                                                ? "success"
                                                                : "warning"
                                                        }
                                                    >
                                                        {document?.status === "available"
                                                            ? "Verfügbar"
                                                            : "Fehlt"}
                                                    </StatusBadge>
                                                }
                                                icon={<FileText className="size-5" />}
                                                actions={
                                                    <>
                                                        {document?.file_path ? (
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
                                                                    <Link
                                                                        href={`/api/documents/${document.id}/file?download=1`}
                                                                    >
                                                                        <Download className="mr-1 size-3.5" />
                                                                        Download
                                                                    </Link>
                                                                </Button>
                                                            </>
                                                        ) : null}
                                                        <VehicleDocumentUploadForm
                                                            vehicleId={vehicle.id}
                                                            documentType={type}
                                                            documentLabel={label}
                                                            existingDocumentId={document?.id ?? null}
                                                        />
                                                    </>
                                                }
                                            />
                                        ),
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <SectionTitle
                                    icon={Truck}
                                    title="Notizen"
                                    description="Interne Hinweise zum Fahrzeug."
                                />

                                <div className="mt-6">
                                    <div className="mb-5">
                                        <label
                                            htmlFor="damage_notes"
                                            className="text-sm font-extrabold text-slate-700"
                                        >
                                            Schäden
                                        </label>
                                        <Textarea
                                            id="damage_notes"
                                            name="damage_notes"
                                            value={damageNotes}
                                            onChange={(event) =>
                                                setDamageNotes(event.currentTarget.value)
                                            }
                                            rows={5}
                                            className="mt-2 rounded-3xl border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-7 text-slate-950"
                                            placeholder="Bekannte Schäden oder Mängel am Fahrzeug eintragen."
                                        />
                                        <p className="mt-2 text-xs font-semibold text-slate-500">
                                            Bekannte Schäden oder Mängel am Fahrzeug eintragen.
                                        </p>
                                    </div>

                                    <label
                                        htmlFor="notes"
                                        className="text-sm font-extrabold text-slate-700"
                                    >
                                        Notizen
                                    </label>
                                    <textarea
                                        id="notes"
                                        name="notes"
                                        defaultValue={vehicle.notes ?? ""}
                                        rows={10}
                                        className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-7 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                                        placeholder="Interne Hinweise, Besonderheiten, Schäden, Absprachen..."
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="p-5">
                                <h2 className="text-lg font-extrabold text-slate-950">
                                    Speichern
                                </h2>
                                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                                    Änderungen wirken sich auf Fahrzeugakte,
                                    Fahrzeugbestand und Bestandsliste aus.
                                </p>

                                <div className="mt-5 flex flex-col gap-2">
                                    <SubmitButton />

                                    <Button
                                        asChild
                                        type="button"
                                        variant="outline"
                                        className="h-12 rounded-2xl border-slate-200 bg-white font-extrabold"
                                    >
                                        <Link href={`/dashboard/vehicles/${vehicle.id}`}>
                                            Abbrechen
                                        </Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </form>
        </div>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            disabled={pending}
            className="h-12 rounded-2xl bg-cyan-700 font-extrabold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
            <Save className="mr-2 size-4" />
            {pending ? "Wird gespeichert..." : "Fahrzeug speichern"}
        </Button>
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
                       htmlFor,
                       required = false,
                       children,
                   }: {
    label: string;
    htmlFor: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label htmlFor={htmlFor} className="text-sm font-extrabold text-slate-700">
                {label}
                {required ? <span className="ml-1 text-red-500">*</span> : null}
            </label>
            <div className="mt-2">{children}</div>
        </div>
    );
}
