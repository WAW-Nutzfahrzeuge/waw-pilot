"use client";

import { useActionState, useState } from "react";
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { withVehicleFolderCheckTimeout } from "@/lib/purchases/vehicle-folder-check-dispatch";
import {
    checkPurchaseVehicleFolderAction,
    ensurePurchaseVehicleFolderAction,
    type VehicleFolderActionState,
} from "@/app/dashboard/ankauf/[purchaseId]/vehicle-folder-actions";

type VehicleFolderCardProps = {
    purchaseId: string;
    initialState: VehicleFolderActionState;
};

const CHECK_UI_TIMEOUT_MS = 45_000;

export function VehicleFolderCard({ purchaseId, initialState }: VehicleFolderCardProps) {
    const [actionState, formAction] = useActionState(ensurePurchaseVehicleFolderAction, initialState);
    const [checkState, setCheckState] = useState<VehicleFolderActionState | null>(null);
    const [checking, setChecking] = useState(false);
    const state = checkState ?? actionState;

    const isReady = state.status === "ready" && Boolean(state.folderUrl);
    const isProcessing = state.status === "processing";
    const folderMissing = state.status === "error" && state.errorCode === "FOLDER_NOT_FOUND";
    const checkFailed = state.status === "ready" && state.errorCode === "FOLDER_CHECK_FAILED";

    async function handleOpenFolder() {
        // Open synchronously inside the user gesture; navigating this tab after
        // the server check would otherwise be blocked by popup protection.
        const popup = window.open("about:blank", "_blank");
        if (popup) {
            popup.opener = null;
            popup.document.title = "OneDrive wird geprüft …";
            popup.document.body.textContent = "OneDrive-Ordner wird geprüft …";
        }
        setChecking(true);
        setCheckState({ ...state, errorCode: null, lastError: null });
        try {
            const boundedResult = await withVehicleFolderCheckTimeout(
                checkPurchaseVehicleFolderAction(purchaseId),
                CHECK_UI_TIMEOUT_MS,
            );
            if (boundedResult.timedOut) {
                popup?.close();
                setCheckState({
                    ...state,
                    errorCode: "FOLDER_CHECK_FAILED",
                    lastError: "Ordner konnte gerade nicht geprüft werden. Bitte versuche es erneut.",
                });
                return;
            }
            const result = boundedResult.value;
            if (result.status === "found") {
                setCheckState({ ...state, status: "ready", folderUrl: result.folderUrl, errorCode: null, lastError: null });
                if (popup && !popup.closed) {
                    popup.location.replace(result.folderUrl);
                } else {
                    window.location.assign(result.folderUrl);
                }
            } else if (result.status === "missing") {
                popup?.close();
                setCheckState({
                    ...state,
                    status: "error",
                    errorCode: "FOLDER_NOT_FOUND",
                    lastError: "Der OneDrive-Ordner wurde gelöscht oder ist nicht mehr vorhanden.",
                });
            } else {
                popup?.close();
                setCheckState({
                    ...state,
                    errorCode: "FOLDER_CHECK_FAILED",
                    lastError: result.message,
                });
            }
        } catch {
            popup?.close();
            setCheckState({
                ...state,
                errorCode: "FOLDER_CHECK_FAILED",
                lastError: "Ordner konnte gerade nicht geprüft werden.",
            });
        } finally {
            setChecking(false);
        }
    }

    return (
        <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                        <FolderOpen className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-extrabold text-slate-950">OneDrive-Fahrzeugakte</h2>
                        {isReady ? (
                            <>
                                <p className="mt-1 break-all text-sm font-medium text-slate-500">
                                    {state.folderName}
                                </p>
                                {checkFailed ? (
                                    <p role="status" className="mt-1 text-sm font-medium text-amber-800">
                                        {state.lastError ?? "Ordner konnte gerade nicht geprüft werden."}
                                    </p>
                                ) : null}
                            </>
                        ) : isProcessing || state.status === "pending" ? (
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Fahrzeugordner wird erstellt …
                            </p>
                        ) : state.status === "error" ? (
                            <p role="status" className="mt-1 text-sm font-medium text-amber-800">
                                {state.lastError ?? "Der Fahrzeugordner konnte nicht erstellt werden."}
                            </p>
                        ) : (
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Für diesen Ankauf wurde noch kein OneDrive-Ordner angelegt.
                            </p>
                        )}
                    </div>
                </div>

                {isReady ? (
                    <Button
                        type="button"
                        onClick={handleOpenFolder}
                        disabled={checking}
                        className="shrink-0 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        {checking ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <ExternalLink className="mr-2 size-4" />}
                        {checking ? "Ordner wird geprüft …" : checkFailed ? "Ordner erneut prüfen" : "OneDrive-Ordner öffnen"}
                    </Button>
                ) : isProcessing ? (
                    <Button disabled variant="outline" className="shrink-0 rounded-2xl font-bold">
                        <RefreshCw className="mr-2 size-4 animate-spin" />
                        Wird erstellt
                    </Button>
                ) : (
                    <form action={formAction} onSubmit={() => setCheckState(null)} className="shrink-0">
                        <input type="hidden" name="purchase_id" value={purchaseId} />
                        {folderMissing ? <input type="hidden" name="mode" value="recreate" /> : null}
                        <PendingSubmitButton
                            label={folderMissing
                                ? "OneDrive-Ordner neu anlegen"
                                : state.status === "error" ? "Erneut versuchen" : state.status === "pending" ? "Auftrag fortsetzen" : "OneDrive-Ordner erstellen"}
                            pendingLabel={folderMissing ? "Wird neu angelegt …" : "Wird erstellt …"}
                            iconName="folder-open"
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        />
                    </form>
                )}
            </CardContent>
            {folderMissing ? (
                <CardContent className="-mt-3 pt-0 text-sm text-slate-600">
                    Eine Neuanlage stellt zuvor gelöschte Fahrzeugbilder nicht wieder her.
                </CardContent>
            ) : null}
        </Card>
    );
}
