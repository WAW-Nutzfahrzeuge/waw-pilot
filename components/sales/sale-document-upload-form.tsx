"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { CheckCircle2, Crop, FileUp, Loader2 } from "lucide-react";

import { uploadSaleDocumentAction } from "@/app/dashboard/sales/[saleId]/actions";
import { DocumentCropDialog } from "@/components/documents/document-crop-dialog";
import { Button } from "@/components/ui/button";
import { isConvertibleVehicleDocumentImage } from "@/lib/documents/client-image-compression";
import {
    documentAcceptMimeTypes,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
} from "@/lib/documents/upload-validation";

type SaleDocumentUploadFormProps = {
    saleId: string;
    documentType: string;
    documentLabel: string;
    existingDocumentId?: string | null;
    existingFileName?: string | null;
};

function isNextRedirectError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const maybeRedirectError = error as {
        message?: unknown;
        digest?: unknown;
    };

    return [maybeRedirectError.message, maybeRedirectError.digest].some(
        (value) => typeof value === "string" && value.includes("NEXT_REDIRECT"),
    );
}

export function SaleDocumentUploadForm({
                                           saleId,
                                           documentType,
                                           documentLabel,
                                           existingDocumentId = null,
                                           existingFileName = null,
                                       }: SaleDocumentUploadFormProps) {
    const inputId = useId();
    const formRef = useRef<HTMLFormElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cropInputRef = useRef<HTMLInputElement>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [cropOpen, setCropOpen] = useState(false);
    const [cropImageFile, setCropImageFile] = useState<File | null>(null);
    const [isPending, startTransition] = useTransition();

    const hasExistingDocument = Boolean(existingDocumentId);
    const displayFileName = selectedFileName ?? existingFileName;

    useEffect(() => {
        if (!cropOpen && cropInputRef.current) {
            cropInputRef.current.value = "";
        }
    }, [cropOpen]);

    function uploadFile(file: File) {
        const formElement = formRef.current;

        if (!formElement) return;

        if (!isAllowedDocumentFile(file)) {
            setErrorMessage(getUnsupportedDocumentTypeMessage());
            setSelectedFileName(null);
            return;
        }

        const formData = new FormData(formElement);
        formData.set("file", file);

        setErrorMessage(null);
        setSelectedFileName(file.name);

        startTransition(async () => {
            try {
                await uploadSaleDocumentAction(formData);
            } catch (error) {
                if (isNextRedirectError(error)) {
                    throw error;
                }

                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Datei konnte nicht hochgeladen werden.",
                );
                setSelectedFileName(null);
            }
        });
    }

    function handleFileChange() {
        const file = fileInputRef.current?.files?.[0] ?? null;

        if (!(file instanceof File) || file.size === 0) {
            setErrorMessage("Bitte wähle eine Datei aus.");
            return;
        }

        uploadFile(file);
    }

    function handleCropFileChange() {
        const file = cropInputRef.current?.files?.[0] ?? null;

        if (!file) return;

        if (!isConvertibleVehicleDocumentImage(file)) {
            setErrorMessage("Bitte wähle zum Zuschneiden ein JPG- oder PNG-Bild aus.");
            setCropImageFile(null);
            return;
        }

        setErrorMessage(null);
        setCropImageFile(file);
        setCropOpen(true);
    }

    return (
        <form
            ref={formRef}
            className={
                hasExistingDocument
                    ? "mt-4 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm"
                    : "mt-4 rounded-3xl border border-amber-100 bg-amber-50/70 p-4 shadow-sm"
            }
        >
            <input type="hidden" name="sale_id" value={saleId} />
            <input type="hidden" name="document_type" value={documentType} />
            <input type="hidden" name="document_label" value={documentLabel} />

            {existingDocumentId ? (
                <input
                    type="hidden"
                    name="existing_document_id"
                    value={existingDocumentId}
                />
            ) : null}

            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                {documentLabel}
            </p>

            <div
                className={
                    hasExistingDocument
                        ? "group flex cursor-pointer items-center gap-4 rounded-2xl border border-emerald-200 bg-white px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                        : "group flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-amber-300 bg-white px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md"
                }
            >
                <span
                    className={
                        isPending
                            ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"
                            : hasExistingDocument
                                ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"
                                : "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 transition group-hover:bg-amber-200"
                    }
                >
                    {isPending ? (
                        <Loader2 className="size-5 animate-spin" />
                    ) : hasExistingDocument ? (
                        <CheckCircle2 className="size-5" />
                    ) : (
                        <FileUp className="size-5" />
                    )}
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-slate-950">
                        {isPending
                            ? "Datei wird hochgeladen..."
                            : hasExistingDocument
                                ? "Dokument ersetzen"
                                : selectedFileName
                                    ? "Datei wird vorbereitet..."
                                    : "Datei auswählen"}
                    </span>

                    <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                        {isPending
                            ? selectedFileName ?? "Bitte kurz warten"
                            : hasExistingDocument
                                ? displayFileName ?? "Aktuell gespeicherte Datei ersetzen"
                                : selectedFileName ?? "PDF, PNG, JPG oder WEBP"}
                    </span>
                </span>

                <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => fileInputRef.current?.click()}
                    className={
                        hasExistingDocument
                            ? "h-10 shrink-0 rounded-xl bg-emerald-700 px-3 text-xs font-extrabold text-white transition hover:bg-emerald-800"
                            : "h-10 shrink-0 rounded-xl bg-slate-950 px-3 text-xs font-extrabold text-white transition hover:bg-slate-800"
                    }
                >
                    {hasExistingDocument ? "Ersetzen" : "Hochladen"}
                </Button>

                <input
                    ref={fileInputRef}
                    id={inputId}
                    name="file"
                    type="file"
                    accept={documentAcceptMimeTypes}
                    className="sr-only"
                    disabled={isPending}
                    onChange={handleFileChange}
                />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    disabled={isPending}
                    className="h-10 rounded-xl border-cyan-200 bg-cyan-50 font-bold text-cyan-800 hover:bg-cyan-100"
                    onClick={() => cropInputRef.current?.click()}
                >
                    <Crop className="size-4" />
                    Bild auswählen & zuschneiden
                </Button>
                <input
                    ref={cropInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    disabled={isPending}
                    onChange={handleCropFileChange}
                />
            </div>

            {errorMessage ? (
                <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    {errorMessage}
                </p>
            ) : null}

            <DocumentCropDialog
                open={cropOpen}
                imageFile={cropImageFile}
                onOpenChange={setCropOpen}
                onCropComplete={uploadFile}
            />
        </form>
    );
}
