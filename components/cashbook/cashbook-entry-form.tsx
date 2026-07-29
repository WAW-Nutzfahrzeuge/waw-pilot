"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import {
    ArrowLeft,
    Banknote,
    CheckCircle2,
    Coins,
    FileText,
    FileUp,
    Save,
    Wallet,
} from "lucide-react";

import { createCashbookEntryAction } from "@/app/dashboard/cashbook/new/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    documentAcceptMimeTypes,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
} from "@/lib/documents/upload-validation";
import { financialCategories } from "@/lib/accounting/financial-categories";
import {
    captureFormSnapshot,
    restoreFormSnapshot,
    type FormSnapshot,
} from "@/lib/forms/form-snapshot";
import { useFormActionFeedback } from "@/components/forms/use-form-action-feedback";
import { ActionMessage } from "@/components/shared/action-message";

const initialState = {
    success: false,
    message: "",
};

export function CashbookEntryForm() {
    const [state, formAction, isPending] = useActionState(
        createCashbookEntryAction,
        initialState,
    );

    const fileInputRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const messageRef = useRef<HTMLDivElement | null>(null);
    const lastSubmittedSnapshotRef = useRef<FormSnapshot | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
        null,
    );

    const today = new Date().toISOString().slice(0, 10);

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

    function handleReceiptFileChange() {
        const file = fileInputRef.current?.files?.[0] ?? null;

        if (!file || file.size <= 0) {
            setSelectedFileName(null);
            setUploadErrorMessage("Bitte wähle eine Datei aus.");
            return;
        }

        if (!isAllowedDocumentFile(file)) {
            setSelectedFileName(null);
            setUploadErrorMessage(getUnsupportedDocumentTypeMessage());
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            return;
        }

        setUploadErrorMessage(null);
        setSelectedFileName(file.name);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kassenbuch"
                title="Finanzvorgang erfassen"
                description="Erfasse sonstige Bar- oder Bankvorgänge. Verkaufszahlungen werden in der Verkaufsakte erfasst."
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href="/dashboard/cashbook">
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
                            icon={Wallet}
                            title="Buchungstyp"
                            description="Wähle, ob es sich um eine Einnahme, Ausgabe, Bareinlage oder Barentnahme handelt."
                        />

                        <div className="grid gap-3 md:grid-cols-2">
                            <RadioBox
                                name="entry_type"
                                value="income"
                                title="Einnahme"
                                description="Sonstiger Geldeingang außerhalb einer Verkaufszahlung."
                                defaultChecked
                            />
                            <RadioBox
                                name="entry_type"
                                value="expense"
                                title="Ausgabe / Entnahme"
                                description="Geldausgang, z. B. Reparatur, Gebühren oder Einkauf."
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Coins}
                            title="Zahlungsart"
                            description="Trenne Bar- und Bankbewegungen sauber voneinander."
                        />

                        <div className="grid gap-3 md:grid-cols-2">
                            <RadioBox
                                name="payment_method"
                                value="cash"
                                title="Bar"
                                description="Bargeldbewegung im Kassenbuch."
                            />
                            <RadioBox
                                name="payment_method"
                                value="bank"
                                title="Bank"
                                description="Zahlung über Bankkonto."
                                defaultChecked
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Banknote}
                            title="Buchungsdaten"
                            description="Kategorie, Betrag und Buchungsdatum."
                        />

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="category" className="font-bold text-slate-700">
                                    Kategorie *
                                </Label>
                                <select
                                    id="category"
                                    name="category"
                                    required
                                    defaultValue="other"
                                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                >
                                    {financialCategories.map((category) => (
                                        <option key={category.code} value={category.code}>
                                            {category.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <FormField
                                label="Betrag *"
                                name="amount"
                                type="number"
                                step="0.01"
                                required
                            />

                            <FormField
                                label="Buchungsdatum *"
                                name="booking_date"
                                type="date"
                                defaultValue={today}
                                required
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={FileText}
                            title="Beschreibung"
                            description="Kurzer Buchungstext für die spätere Prüfung."
                        />

                        <div className="space-y-2">
                            <Label htmlFor="description" className="font-bold text-slate-700">
                                Beschreibung *
                            </Label>
                            <Textarea
                                id="description"
                                name="description"
                                required
                                placeholder="z. B. Reparaturrechnung MAN TGX, Zulassungsgebühr, Barzahlung Kunde..."
                                className="min-h-32 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={FileUp}
                            title="Beleg"
                            description="Optional PDF oder Bild hochladen, z. B. Rechnung, Quittung oder Zahlungsnachweis."
                        />

                        <div
                            className={
                                selectedFileName
                                    ? "group flex cursor-pointer items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                                    : "group flex cursor-pointer items-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/40 hover:shadow-md"
                            }
                        >
              <span
                  className={
                      selectedFileName
                          ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"
                          : "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700"
                  }
              >
                {selectedFileName ? (
                    <CheckCircle2 className="size-5" />
                ) : (
                    <FileUp className="size-5" />
                )}
              </span>

                            <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-slate-950">
                  {selectedFileName ? "Beleg ausgewählt" : "Beleg auswählen"}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                  {selectedFileName ?? "PDF, PNG, JPG oder WEBP"}
                </span>
              </span>

                            <Button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="h-10 shrink-0 rounded-xl bg-slate-950 px-3 text-xs font-extrabold text-white transition hover:bg-slate-800"
                            >
                Hochladen
              </Button>

                            <input
                                ref={fileInputRef}
                                name="receipt_file"
                                type="file"
                                accept={documentAcceptMimeTypes}
                                className="sr-only"
                                onChange={handleReceiptFileChange}
                            />
                        </div>

                        {uploadErrorMessage ? (
                            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                {uploadErrorMessage}
                            </p>
                        ) : null}
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
                            <Link href="/dashboard/cashbook">Abbrechen</Link>
                        </Button>

                        <Button
                            type="submit"
                            disabled={isPending}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending ? "Speichert..." : "Buchung speichern"}
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
                      defaultChecked = false,
                  }: {
    name: string;
    value: string;
    title: string;
    description: string;
    defaultChecked?: boolean;
}) {
    return (
        <label className="cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-emerald-200 hover:bg-emerald-50/60 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50 has-[:checked]:ring-4 has-[:checked]:ring-emerald-100">
            <input
                type="radio"
                name={name}
                value={value}
                defaultChecked={defaultChecked}
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
    icon: typeof Wallet;
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
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </div>
    );
}
