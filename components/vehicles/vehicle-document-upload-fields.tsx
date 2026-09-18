"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Crop, FileUp, X } from "lucide-react";

import { DocumentCropDialog } from "@/components/documents/document-crop-dialog";
import { Button } from "@/components/ui/button";
import {
    convertVehicleDocumentImageToPdf,
    isConvertibleVehicleDocumentImage,
} from "@/lib/documents/client-image-compression";
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
    maxFileSizeBytes?: number;
    maxFileSizeMessage?: string;
};

export function VehicleDocumentUploadFields({
                                                fields,
                                                maxFileSizeBytes = maxDocumentFileSizeBytes,
                                                maxFileSizeMessage = getDocumentTooLargeMessage(),
                                            }: VehicleDocumentUploadFieldsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
                <VehicleDocumentUploadField
                    key={field.name}
                    {...field}
                    maxFileSizeBytes={maxFileSizeBytes}
                    maxFileSizeMessage={maxFileSizeMessage}
                />
            ))}
        </div>
    );
}

function VehicleDocumentUploadField({
                                        name,
                                        label,
                                        description,
                                        maxFileSizeBytes,
                                        maxFileSizeMessage,
                                    }: VehicleDocumentUploadFieldsProps["fields"][number] & {
    maxFileSizeBytes: number;
    maxFileSizeMessage: string;
}) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const cropInputRef = useRef<HTMLInputElement>(null);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [cropOpen, setCropOpen] = useState(false);
    const [cropImageFile, setCropImageFile] = useState<File | null>(null);
    const [cropQueue, setCropQueue] = useState<File[]>([]);
    const cropCompletedRef = useRef(false);

    useEffect(() => {
        if (!cropOpen && cropInputRef.current) {
            cropInputRef.current.value = "";
        }
    }, [cropOpen]);

    function openNextCrop(files: File[]) {
        const [nextFile, ...remainingFiles] = files;
        if (!nextFile) return;

        setCropQueue(remainingFiles);
        setCropImageFile(nextFile);
        setCropOpen(true);
    }

    function validateFile(file: File): boolean {
        if (!isAllowedVehicleDocumentFile(file)) {
            setErrorMessage(getUnsupportedVehicleDocumentTypeMessage());
            return false;
        }

        if (file.size > maxFileSizeBytes) {
            setErrorMessage(maxFileSizeMessage);
            return false;
        }

        setErrorMessage(null);
        return true;
    }

    function writeFilesToInput(files: File[]) {
        const input = inputRef.current;

        if (!input) return;

        const transfer = new DataTransfer();
        files.forEach((file) => transfer.items.add(file));
        input.files = transfer.files;
    }

    async function prepareSelectedFile(file: File): Promise<File | null> {
        if (!isAllowedVehicleDocumentFile(file)) {
            setErrorMessage(getUnsupportedVehicleDocumentTypeMessage());
            return null;
        }

        if (!isConvertibleVehicleDocumentImage(file) && file.size <= maxFileSizeBytes) {
            setInfoMessage(null);
            return file;
        }

        setIsCompressing(true);
        setInfoMessage(
            isConvertibleVehicleDocumentImage(file)
                ? "Bild wird in PDF umgewandelt..."
                : null,
        );

        try {
            const convertedFile = await convertVehicleDocumentImageToPdf(file, {
                maxSizeBytes: maxFileSizeBytes,
            });

            if (convertedFile.type === "application/pdf" && convertedFile.name !== file.name) {
                setInfoMessage(
                    `Bild wurde als PDF gespeichert (${formatFileSize(convertedFile.size)}).`,
                );
            } else {
                setInfoMessage(null);
            }

            return convertedFile;
        } catch {
            setInfoMessage(null);
            return file;
        } finally {
            setIsCompressing(false);
        }
    }

    async function handleFileChange() {
        const files = Array.from(inputRef.current?.files ?? []);

        if (files.length === 0) {
            setSelectedFiles([]);
            setErrorMessage(null);
            setInfoMessage(null);
            return;
        }

        const imageFiles = files.filter((file) => isConvertibleVehicleDocumentImage(file));
        const preparedFiles: File[] = [];
        for (const file of files) {
            if (isConvertibleVehicleDocumentImage(file)) continue;

            const preparedFile = await prepareSelectedFile(file);
            if (!preparedFile || !validateFile(preparedFile)) {
                resetFileInput();
                return;
            }
            preparedFiles.push(preparedFile);
        }

        writeFilesToInput(preparedFiles);
        setSelectedFiles(preparedFiles);

        if (imageFiles.length > 0) {
            openNextCrop(imageFiles);
        }
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

    async function handleCropComplete(file: File) {
        const input = inputRef.current;

        if (!input) return;

        const preparedFile = await prepareSelectedFile(file);

        if (!preparedFile || !validateFile(preparedFile)) return;

        const nextFiles = [...selectedFiles, preparedFile];
        writeFilesToInput(nextFiles);
        setSelectedFiles(nextFiles);
        cropCompletedRef.current = true;
        window.setTimeout(() => openNextCrop(cropQueue), 0);
    }

    function removeFile(index: number) {
        const nextFiles = selectedFiles.filter((_, fileIndex) => fileIndex !== index);
        writeFilesToInput(nextFiles);
        setSelectedFiles(nextFiles);
    }

    function resetFileInput() {
        if (inputRef.current) {
            inputRef.current.value = "";
        }

        setSelectedFiles([]);
        setInfoMessage(null);
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

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                    type="button"
                    className="h-10 rounded-2xl bg-slate-950 font-bold text-white hover:bg-slate-800 whitespace-nowrap"
                    disabled={isCompressing}
                    onClick={() => inputRef.current?.click()}
                >
                    {isCompressing ? "Wandelt um..." : "Hochladen"}
                </Button>

                {selectedFiles.length > 0 ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-2xl border-slate-200 bg-white font-bold whitespace-nowrap"
                        disabled={isCompressing}
                        onClick={resetFileInput}
                    >
                        <X className="mr-2 size-4" />
                        Alle entfernen
                    </Button>
                ) : null}

                <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-2xl border-cyan-200 bg-cyan-50 font-bold text-cyan-800 hover:bg-cyan-100 whitespace-nowrap"
                    disabled={isCompressing}
                    onClick={() => cropInputRef.current?.click()}
                >
                    <Crop className="mr-2 size-4" />
                    Bild auswählen & zuschneiden
                </Button>
            </div>

            <input
                ref={inputRef}
                id={inputId}
                name={name}
                type="file"
                multiple
                accept={vehicleDocumentAcceptMimeTypes}
                className="sr-only"
                onChange={handleFileChange}
            />
            <input
                ref={cropInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                onChange={handleCropFileChange}
            />

            {selectedFiles.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {selectedFiles.map((file, index) => (
                        <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                            <span className="min-w-0 flex-1 truncate">{file.name} · {formatFileSize(file.size)}</span>
                            <button type="button" className="shrink-0 text-xs font-extrabold text-slate-500 hover:text-red-700" onClick={() => removeFile(index)}>
                                Entfernen
                            </button>
                        </div>
                    ))}
                    <p className="text-xs font-semibold text-slate-500">Weitere Bilder können hinzugefügt werden.</p>
                </div>
            ) : (
                <p className="mt-3 text-xs font-semibold text-slate-500">
                    PDF bleibt PDF. JPG und PNG werden als PDF gespeichert. Max. {formatFileSize(maxFileSizeBytes)}.
                </p>
            )}

            {errorMessage ? (
                <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                    {errorMessage}
                </p>
            ) : null}

            {infoMessage ? (
                <p className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-800">
                    {infoMessage}
                </p>
            ) : null}

            <DocumentCropDialog
                open={cropOpen}
                imageFile={cropImageFile}
                onOpenChange={(open) => {
                    setCropOpen(open);
                    if (!open && cropQueue.length > 0) {
                        if (cropCompletedRef.current) {
                            cropCompletedRef.current = false;
                        } else {
                            window.setTimeout(() => openNextCrop(cropQueue), 0);
                        }
                    }
                }}
                onCropComplete={handleCropComplete}
            />
        </div>
    );
}
