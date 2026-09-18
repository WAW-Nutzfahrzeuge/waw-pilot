"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import {
    initialAdminDeleteActionState,
    type AdminDeleteActionState,
} from "@/lib/admin-delete/admin-delete-policies";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type AdminDeleteDialogProps = {
    subjectLabel: "Verkauf" | "Ankauf" | "Fahrzeug";
    hiddenInputName: string;
    hiddenInputValue: string;
    action: (
        previousState: AdminDeleteActionState,
        formData: FormData,
    ) => Promise<AdminDeleteActionState>;
    dependentItems?: string[];
    disabledReason?: string | null;
};

export function AdminDeleteDialog({
    subjectLabel,
    hiddenInputName,
    hiddenInputValue,
    action,
    dependentItems = [],
    disabledReason = null,
}: AdminDeleteDialogProps) {
    const [open, setOpen] = useState(false);
    const [state, formAction, isPending] = useActionState(
        action,
        initialAdminDeleteActionState,
    );
    const isBlocked = Boolean(disabledReason);

    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                className="h-10 rounded-xl px-3 font-bold text-red-700 hover:bg-red-50 hover:text-red-800"
            >
                <Trash2 className="mr-2 size-4" />
                Löschen
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg rounded-3xl bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-extrabold text-slate-950">
                            {subjectLabel} wirklich löschen?
                        </DialogTitle>
                        <DialogDescription className="leading-6 text-slate-600">
                            Diese Aktion löscht den Datensatz endgültig aus der Datenbank.
                            Sie kann nicht rückgängig gemacht werden.
                        </DialogDescription>
                    </DialogHeader>

                    {dependentItems.length > 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <p className="text-sm font-extrabold text-amber-950">
                                Erkannte Abhängigkeiten
                            </p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-amber-800">
                                {dependentItems.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {disabledReason ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
                            {disabledReason}
                        </div>
                    ) : null}

                    {state.message ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
                            {state.message}
                        </div>
                    ) : null}

                    <form action={formAction}>
                        <input
                            type="hidden"
                            name={hiddenInputName}
                            value={hiddenInputValue}
                        />

                        <DialogFooter className="mt-5">
                            <DialogClose asChild>
                                <Button type="button" variant="outline" disabled={isPending}>
                                    Abbrechen
                                </Button>
                            </DialogClose>
                            <Button
                                type="submit"
                                variant="destructive"
                                disabled={isPending || isBlocked}
                            >
                                {isPending ? (
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <Trash2 className="mr-2 size-4" />
                                )}
                                Endgültig löschen
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
