"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, FileUp, Loader2, X } from "lucide-react";

import {
    processDatevExport,
    type DatevAccountingCompany,
} from "@/lib/accounting/datev-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/tables/empty-state";
import { PageHeader } from "@/components/shared/page-header";

type DatevAccountingPageProps = {
    company: DatevAccountingCompany;
};

const ACCEPTED_FILE_EXTENSION = ".csv";

function formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DatevAccountingPage({ company }: DatevAccountingPageProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);

    const companyLabel = company;

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setSuccessMessage(null);

        if (!file) {
            setSelectedFile(null);
            return;
        }

        if (!file.name.toLowerCase().endsWith(ACCEPTED_FILE_EXTENSION)) {
            setSelectedFile(null);
            setErrorMessage("Bitte wähle eine DATEV-Datei im CSV-Format aus.");
            event.target.value = "";
            return;
        }

        setErrorMessage(null);
        setSelectedFile(file);
    }

    function removeSelectedFile() {
        setSelectedFile(null);
        setErrorMessage(null);
        setSuccessMessage(null);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function handleProcess() {
        if (!selectedFile) return;

        setIsPreparing(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        window.setTimeout(() => {
            processDatevExport(selectedFile, company);
            setIsPreparing(false);
            setSuccessMessage(
                `DATEV-Export wurde für ${companyLabel} zur Verarbeitung vorbereitet.`,
            );
        }, 150);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Buchhaltung"
                title={`Buchhaltung ${companyLabel}`}
                description={`Hier kann der DATEV-Export für ${companyLabel} hochgeladen und verarbeitet werden.`}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <FileSpreadsheet className="size-5 text-cyan-700" />
                        DATEV-Export hochladen
                    </CardTitle>
                    <CardDescription>
                        Wähle zunächst eine CSV-Datei aus. Die Verarbeitung wird im nächsten Schritt an den passenden n8n-Workflow angebunden.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="sr-only"
                        onChange={handleFileChange}
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-left transition hover:border-cyan-300 hover:bg-cyan-50/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-cyan-500/30"
                    >
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                            {isPreparing ? (
                                <Loader2 className="size-5 animate-spin" />
                            ) : selectedFile ? (
                                <CheckCircle2 className="size-5" />
                            ) : (
                                <FileUp className="size-5" />
                            )}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-extrabold text-slate-950">
                                {selectedFile ? "DATEV-Datei ausgewählt" : "CSV-Datei auswählen"}
                            </span>
                            <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                                {selectedFile
                                    ? `${selectedFile.name} · ${formatFileSize(selectedFile.size)}`
                                    : "Unterstütztes Format: .csv"}
                            </span>
                        </span>
                        {selectedFile ? (
                            <span className="hidden text-xs font-bold text-cyan-700 sm:block">
                                Datei ändern
                            </span>
                        ) : null}
                    </button>

                    {selectedFile ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                            <p className="min-w-0 truncate text-sm font-bold text-slate-700">
                                {selectedFile.name}
                            </p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={removeSelectedFile}
                                disabled={isPreparing}
                                aria-label="Ausgewählte Datei entfernen"
                            >
                                <X className="size-4" />
                                Entfernen
                            </Button>
                        </div>
                    ) : null}

                    {errorMessage ? (
                        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                            {errorMessage}
                        </p>
                    ) : null}

                    {successMessage ? (
                        <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                            {successMessage}
                        </p>
                    ) : null}

                    <Button
                        type="button"
                        onClick={handleProcess}
                        disabled={!selectedFile || isPreparing}
                        className="w-full rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800 sm:w-auto"
                    >
                        {isPreparing ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                            <FileSpreadsheet className="mr-2 size-4" />
                        )}
                        {isPreparing ? "Wird vorbereitet..." : "DATEV-Export verarbeiten"}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Belegstatus</CardTitle>
                    <CardDescription>
                        Hier werden später die Ergebnisse der DATEV-Verarbeitung angezeigt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <EmptyState
                        title="Noch keine DATEV-Daten verarbeitet."
                        description="Nach der späteren n8n-Anbindung erscheinen hier Lieferanten, Rechnungen, Beträge und Bearbeitungsstatus."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
