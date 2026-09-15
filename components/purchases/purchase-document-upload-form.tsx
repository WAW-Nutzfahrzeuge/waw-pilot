"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";

import { uploadPurchaseDocumentAction } from "@/app/dashboard/ankauf/[purchaseId]/document-actions";
import { Button } from "@/components/ui/button";
import {
    documentAcceptMimeTypes,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
} from "@/lib/documents/upload-validation";

const initialState = {
    success: false,
    message: "",
};

type PurchaseDocumentUploadFormProps = {
    purchaseId: string;
    documentType: string;
    documentLabel: string;
    existingDocumentId: string | null;
    existingFileName: string | null;
};

export function PurchaseDocumentUploadForm({
                                               purchaseId,
                                               documentType,
                                               documentLabel,
                                               existingDocumentId,
                                               existingFileName,
                                           }: PurchaseDocumentUploadFormProps) {
    const [state, formAction, isPending] = useActionState(
        uploadPurchaseDocumentAction,
        initialState,
    );

    const formRef = useRef<HTMLFormElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [clientErrorMessage, setClientErrorMessage] = useState<string | null>(
        null,
    );

    const displayFileName = selectedFileName ?? existingFileName;
    const displayMessage = clientErrorMessage ?? state.message;

    function handleFileChange() {
        const files = Array.from(fileInputRef.current?.files ?? []);
        const file = files[0] ?? null;

        if (!file || files.some((selected) => selected.size <= 0)) {
            setClientErrorMessage("Bitte wähle eine Datei aus.");
            setSelectedFileName(null);
            return;
        }

        if (files.some((selected) => !isAllowedDocumentFile(selected))) {
            setClientErrorMessage(getUnsupportedDocumentTypeMessage());
            setSelectedFileName(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            return;
        }

        setClientErrorMessage(null);
        setSelectedFileName(
            files.length === 1 ? file.name : `${files.length} Dateien ausgewählt`,
        );

        window.setTimeout(() => {
            formRef.current?.requestSubmit();
        }, 0);
    }

    return (
        <form ref={formRef} action={formAction} className="mt-4 space-y-3">
            <input type="hidden" name="purchase_id" value={purchaseId} />
            <input type="hidden" name="document_type" value={documentType} />
            <input
                type="hidden"
                name="existing_document_id"
                value={existingDocumentId ?? ""}
            />

            <div
                className={
                    displayFileName
                        ? "group flex cursor-pointer items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                        : "group flex cursor-pointer items-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/40 hover:shadow-md"
                }
            >
                <span
                    className={
                        displayFileName
                            ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"
                            : "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700"
                    }
                >
                    {isPending ? (
                        <Loader2 className="size-5 animate-spin" />
                    ) : displayFileName ? (
                        <CheckCircle2 className="size-5" />
                    ) : (
                        <FileUp className="size-5" />
                    )}
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-slate-950">
                        {displayFileName
                            ? `${documentLabel} ersetzen`
                            : `${documentLabel} hochladen`}
                    </span>
                    <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                        {isPending
                            ? "Wird hochgeladen..."
                            : displayFileName ?? "PDF, PNG, JPG oder WEBP"}
                    </span>
                </span>

                <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 shrink-0 rounded-xl bg-slate-950 px-3 text-xs font-extrabold text-white transition hover:bg-slate-800"
                >
                    Hochladen
                </Button>

                <input
                    ref={fileInputRef}
                name="file"
                type="file"
                multiple
                    accept={documentAcceptMimeTypes}
                    className="sr-only"
                    disabled={isPending}
                    onChange={handleFileChange}
                />
            </div>

            {displayMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                    {displayMessage}
                </div>
            ) : null}
        </form>
    );
}
