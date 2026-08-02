"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import { Mail, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";

import {
    sendStampDocumentsEmailAction,
    type SendStampDocumentsEmailState,
} from "@/app/dashboard/sales/[saleId]/stamp-documents-email-actions";
import {
    EMAIL_LANGUAGE_OPTIONS,
    getSuggestedEmailLanguage,
    type EmailLanguage,
} from "@/lib/customers/email-languages";
import {
    getAvailableStampDocuments,
    getMissingStampDocumentLabels,
    getStampDocumentsEmailTemplate,
    type StampDocumentCandidate,
} from "@/lib/sales/stamp-documents";
import type { SaleType } from "@/lib/sales/sale-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SendStampDocumentsDialogProps = {
    saleId: string;
    customer: {
        name: string;
        email: string | null;
        preferred_language: string | null;
        country: string | null;
    };
    vehicleLabel: string;
    documents: StampDocumentCandidate[];
    saleType: SaleType;
};

const initialState: SendStampDocumentsEmailState = {
    success: false,
    message: "",
};

export function SendStampDocumentsDialog({
                                             saleId,
                                             customer,
                                             vehicleLabel,
                                             documents,
                                             saleType,
                                         }: SendStampDocumentsDialogProps) {
    const availableDocuments = useMemo(
        () => getAvailableStampDocuments(documents, saleType),
        [documents, saleType],
    );
    const missingDocumentLabels = useMemo(
        () => getMissingStampDocumentLabels(documents, saleType),
        [documents, saleType],
    );
    const suggestedLanguage = getSuggestedEmailLanguage({
        country: customer.country,
        preferredLanguage: customer.preferred_language,
    });
    const initialTemplate = getStampDocumentsEmailTemplate({
        language: suggestedLanguage,
        customerName: customer.name,
        vehicleLabel,
        documentLabels: availableDocuments.map((document) => document.label),
    });
    const [open, setOpen] = useState(false);
    const [language, setLanguage] = useState<EmailLanguage>(suggestedLanguage);
    const [recipientEmail, setRecipientEmail] = useState(customer.email ?? "");
    const [subject, setSubject] = useState(initialTemplate.subject);
    const [body, setBody] = useState(initialTemplate.text);
    const [selectedDocumentIds, setSelectedDocumentIds] = useState(
        () => new Set(availableDocuments.map((document) => document.id)),
    );
    const [state, formAction, isPending] = useActionState(
        sendStampDocumentsEmailAction,
        initialState,
    );
    const router = useRouter();
    const successHandledRef = useRef(false);

    useEffect(() => {
        if (!state.success || successHandledRef.current) return;

        successHandledRef.current = true;
        setOpen(false);

        const url = new URL(window.location.href);
        url.searchParams.set("stampEmailSent", "1");
        url.hash = "";
        router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: true });
    }, [router, state.success]);

    const canSend =
        availableDocuments.length > 0 &&
        selectedDocumentIds.size > 0 &&
        recipientEmail.trim().length > 0 &&
        !isPending;

    function updateLanguage(nextLanguage: EmailLanguage) {
        setLanguage(nextLanguage);
        const template = getStampDocumentsEmailTemplate({
            language: nextLanguage,
            customerName: customer.name,
            vehicleLabel,
            documentLabels: availableDocuments
                .filter((document) => selectedDocumentIds.has(document.id))
                .map((document) => document.label),
        });
        setSubject(template.subject);
        setBody(template.text);
    }

    function toggleDocument(documentId: string) {
        setSelectedDocumentIds((currentIds) => {
            const nextIds = new Set(currentIds);

            if (nextIds.has(documentId)) {
                nextIds.delete(documentId);
            } else {
                nextIds.add(documentId);
            }

            return nextIds;
        });
    }

    return (
        <>
            <Button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
            >
                <Mail className="mr-2 size-4" />
                Dokumente zum Stempeln senden
            </Button>

            {open ? (
                <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
                    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] bg-white p-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-extrabold text-slate-950">
                                    Dokumente zum Stempeln senden
                                </h2>
                                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                                    Prüfe Empfänger, Sprache, Text und Anhänge vor dem Versand.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-10 rounded-2xl"
                                onClick={() => setOpen(false)}
                                aria-label="Dialog schließen"
                            >
                                <X className="size-4" />
                            </Button>
                        </div>

                        {state.message ? (
                            <div
                                className={
                                    state.success
                                        ? "mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700"
                                        : "mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700"
                                }
                            >
                                {state.message}
                            </div>
                        ) : null}

                        {!customer.email ? (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                                Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.
                            </div>
                        ) : null}

                        {availableDocuments.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                                Für diesen Verkauf sind noch keine Dokumente zum Stempeln vorhanden.
                            </div>
                        ) : null}

                        <form action={formAction} className="mt-5 space-y-5">
                            <input type="hidden" name="sale_id" value={saleId} />
                            {Array.from(selectedDocumentIds).map((documentId) => (
                                <input
                                    key={documentId}
                                    type="hidden"
                                    name="document_ids"
                                    value={documentId}
                                />
                            ))}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="stamp-doc-recipient">Empfänger</Label>
                                    <Input
                                        id="stamp-doc-recipient"
                                        name="recipient_email"
                                        type="email"
                                        value={recipientEmail}
                                        onChange={(event) =>
                                            setRecipientEmail(event.target.value)
                                        }
                                        placeholder="kunde@example.com"
                                        className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="stamp-doc-language">Sprache</Label>
                                    <select
                                        id="stamp-doc-language"
                                        name="language"
                                        value={language}
                                        onChange={(event) =>
                                            updateLanguage(event.target.value as EmailLanguage)
                                        }
                                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                    >
                                        {EMAIL_LANGUAGE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="stamp-doc-subject">Betreff</Label>
                                <Input
                                    id="stamp-doc-subject"
                                    name="subject"
                                    value={subject}
                                    onChange={(event) => setSubject(event.target.value)}
                                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-semibold"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="stamp-doc-body">E-Mail-Text</Label>
                                <Textarea
                                    id="stamp-doc-body"
                                    name="body"
                                    value={body}
                                    onChange={(event) => setBody(event.target.value)}
                                    className="min-h-56 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                                    <p className="font-extrabold text-emerald-950">
                                        Vorhandene Anhänge
                                    </p>
                                    <div className="mt-3 space-y-2">
                                        {availableDocuments.map((document) => (
                                            <label
                                                key={document.id}
                                                className="flex cursor-pointer items-start gap-2 rounded-xl bg-white p-2 text-sm font-bold text-slate-700"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedDocumentIds.has(document.id)}
                                                    onChange={() => toggleDocument(document.id)}
                                                    className="mt-1 size-4 rounded border-emerald-300 text-emerald-700"
                                                />
                                                <span>
                                                    <span className="block text-emerald-800">
                                                        {document.label}
                                                    </span>
                                                    <span className="block break-all text-xs text-slate-500">
                                                        {document.file_name}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                        {availableDocuments.length === 0 ? (
                                            <p className="text-sm font-bold text-emerald-800">
                                                Keine passenden Dateien vorhanden.
                                            </p>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                                    <p className="font-extrabold text-amber-950">
                                        Fehlende Dokumente
                                    </p>
                                    <div className="mt-3 space-y-2">
                                        {missingDocumentLabels.map((label) => (
                                            <p
                                                key={label}
                                                className="rounded-xl bg-white p-2 text-sm font-bold text-amber-800"
                                            >
                                                {label} ist noch nicht vorhanden.
                                            </p>
                                        ))}
                                        {missingDocumentLabels.length === 0 ? (
                                            <p className="text-sm font-bold text-amber-800">
                                                Keine der erwarteten Dateien fehlt.
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 rounded-2xl font-bold"
                                    onClick={() => setOpen(false)}
                                >
                                    Abbrechen
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={!canSend}
                                    className="h-11 rounded-2xl bg-cyan-700 px-5 font-extrabold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Send className="mr-2 size-4" />
                                    {isPending ? "Wird gesendet..." : "E-Mail senden"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </>
    );
}
