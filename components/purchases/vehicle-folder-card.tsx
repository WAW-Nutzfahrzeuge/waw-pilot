"use client";

import { useActionState } from "react";
import { ExternalLink, FolderOpen, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import {
    ensurePurchaseVehicleFolderAction,
    type VehicleFolderActionState,
} from "@/app/dashboard/ankauf/[purchaseId]/vehicle-folder-actions";

type VehicleFolderCardProps = {
    purchaseId: string;
    initialState: VehicleFolderActionState;
};

export function VehicleFolderCard({ purchaseId, initialState }: VehicleFolderCardProps) {
    const [state, formAction] = useActionState(ensurePurchaseVehicleFolderAction, initialState);
    const isReady = state.status === "ready" && Boolean(state.folderUrl);
    const isProcessing = state.status === "processing";

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
                            <p className="mt-1 break-all text-sm font-medium text-slate-500">
                                {state.folderName}
                            </p>
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
                        asChild
                        className="shrink-0 rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <a href={state.folderUrl!} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 size-4" />
                            OneDrive-Ordner öffnen
                        </a>
                    </Button>
                ) : isProcessing ? (
                    <Button disabled variant="outline" className="shrink-0 rounded-2xl font-bold">
                        <RefreshCw className="mr-2 size-4 animate-spin" />
                        Wird erstellt
                    </Button>
                ) : (
                    <form action={formAction} className="shrink-0">
                        <input type="hidden" name="purchase_id" value={purchaseId} />
                        <PendingSubmitButton
                            label={state.status === "error" ? "Erneut versuchen" : state.status === "pending" ? "Auftrag fortsetzen" : "OneDrive-Ordner erstellen"}
                            pendingLabel="Wird erstellt …"
                            iconName="folder-open"
                            className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        />
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
