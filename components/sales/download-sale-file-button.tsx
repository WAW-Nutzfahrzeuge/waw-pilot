"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type DownloadSaleFileButtonProps = {
    saleId: string;
};

function getFileNameFromContentDisposition(header: string | null): string {
    if (!header) return "Verkaufsakte.zip";

    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf8Match?.[1]) {
        return decodeURIComponent(utf8Match[1]);
    }

    const plainMatch = /filename="([^"]+)"/i.exec(header);
    if (plainMatch?.[1]) {
        return plainMatch[1];
    }

    return "Verkaufsakte.zip";
}

export function DownloadSaleFileButton({ saleId }: DownloadSaleFileButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function handleDownload() {
        setIsLoading(true);
        setErrorMessage(null);

        try {
            const response = await fetch(`/api/sales/${saleId}/file`, {
                cache: "no-store",
            });

            if (!response.ok) {
                const errorBody = (await response.json().catch(() => null)) as {
                    message?: string;
                } | null;

                throw new Error(
                    errorBody?.message ??
                        "Verkaufsakte konnte nicht heruntergeladen werden.",
                );
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = getFileNameFromContentDisposition(
                response.headers.get("Content-Disposition"),
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Verkaufsakte konnte nicht heruntergeladen werden.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <Button
                type="button"
                onClick={handleDownload}
                disabled={isLoading}
                className="h-11 rounded-2xl bg-cyan-700 px-4 font-bold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-75"
            >
                {isLoading ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                    <Download className="mr-2 size-4" />
                )}
                {isLoading
                    ? "Verkaufsakte wird erstellt ..."
                    : "Verkaufsakte herunterladen"}
            </Button>

            {errorMessage ? (
                <p className="max-w-xs text-sm font-semibold leading-5 text-red-700">
                    {errorMessage}
                </p>
            ) : null}
        </div>
    );
}
