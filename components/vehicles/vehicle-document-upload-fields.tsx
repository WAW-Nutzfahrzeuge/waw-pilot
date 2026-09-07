"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileUp, ScanLine, X } from "lucide-react";

import { DocumentScannerDialog } from "@/components/documents/document-scanner-dialog";
import { Button } from "@/components/ui/button";
import {
    getDocumentTooLargeMessage,
    getUnsupportedVehicleDocumentTypeMessage,
    isAllowedVehicleDocumentFile,
    maxDocumentFileSizeBytes,
    vehicleDocumentAcceptMimeTypes,
} from "@/lib/documents/upload-validation";
import { formatFileSize } from "@/lib/documents/document-helpers";

type VehicleDocumentUploadFieldsProps = {
    fields: {
        name: string;
        label: string;
        description: string;
    }[];
};

export function VehicleDocumentUploadFields({
                                                fields,
                                            }: VehicleDocumentUploadFieldsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
                <VehicleDocumentUploadField key={field.name} {...field} />
            ))}
        </div>
    );
}

function VehicleDocumentUploadField({
                                        name,
                                        label,
                                        description,
                                    }: VehicleDocumentUploadFieldsProps["fields"][number]) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [cameraAvailable, setCameraAvailable] = useState(false);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setCameraAvailable(Boolean(navigator.mediaDevices?.getUserMedia));
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, []);

    function validateFile(file: File): boolean {
        if (!isAllowedVehicleDocumentFile(file)) {
            setErrorMessage(getUnsupportedVehicleDocumentTypeMessage());
            return false;
        }

        if (file.size > maxDocumentFileSizeBytes) {
            setErrorMessage(getDocumentTooLargeMessage());
            return false;
        }

        setErrorMessage(null);
        return true;
    }

    function handleFileChange() {
        const file = inputRef.current?.files?.[0] ?? null;

        if (!file) {
            setSelectedFile(null);
            setErrorMessage(null);
            return;
        }

        if (!validateFile(file)) {
            resetFileInput();
            return;
        }

        setSelectedFile(file);
    }

    function handleScanComplete(file: File) {
        const input = inputRef.current;

        if (!input || !validateFile(file)) return;

        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        setSelectedFile(file);
    }

    function resetFileInput() {
        if (inputRef.current) {
            inputRef.current.value = "";
        }

        setSelectedFile(null);
    }

    return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-cyan-700">
                    <FileUp className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950">{label}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                        {description}
                    </p>
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                    type="button"
                    className="h-10 rounded-2xl bg-slate-950 font-bold text-white hover:bg-slate-800"
                    onClick={() => inputRef.current?.click()}
                >
                    Hochladen
                </Button>

                {selectedFile ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-2xl border-slate-200 bg-white font-bold"
                        onClick={resetFileInput}
                    >
                        <X className="mr-2 size-4" />
                        Entfernen
                    </Button>
                ) : null}

                {cameraAvailable ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-2xl border-cyan-200 bg-cyan-50 font-bold text-cyan-800 hover:bg-cyan-100"
                        onClick={() => setScannerOpen(true)}
                    >
                        <ScanLine className="mr-2 size-4" />
                        Scannen
                    </Button>
                ) : null}
            </div>

            <input
                ref={inputRef}
                id={inputId}
                name={name}
                type="file"
                accept={vehicleDocumentAcceptMimeTypes}
                className="sr-only"
                onChange={handleFileChange}
            />

            {selectedFile ? (
                <p className="mt-3 truncate text-sm font-bold text-emerald-700">
                    {selectedFile.name} · {formatFileSize(selectedFile.size)}
                </p>
            ) : (
                <p className="mt-3 text-xs font-semibold text-slate-500">
                    PDF, JPG, JPEG oder PNG bis 5 MB.
                </p>
            )}

            {errorMessage ? (
                <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    {errorMessage}
                </p>
            ) : null}

            <DocumentScannerDialog
                open={scannerOpen}
                onOpenChange={setScannerOpen}
                onScanComplete={handleScanComplete}
            />
        </div>
    );
}
