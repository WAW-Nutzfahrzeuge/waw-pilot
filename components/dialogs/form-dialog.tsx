"use client";

import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

type FormDialogProps = {
    trigger: ReactNode;
    title: string;
    description?: string;
    action: ComponentProps<"form">["action"];
    submitLabel: string;
    children: ReactNode;
};

export function FormDialog({
    trigger,
    title,
    description,
    action,
    submitLabel,
    children,
}: FormDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-3xl bg-white">
                <form action={action} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-extrabold text-slate-950">
                            {title}
                        </DialogTitle>
                        {description ? (
                            <DialogDescription>{description}</DialogDescription>
                        ) : null}
                    </DialogHeader>

                    {children}

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">
                                Abbrechen
                            </Button>
                        </DialogClose>
                        <PendingSubmitButton
                            label={submitLabel}
                            pendingLabel="Speichert..."
                            className="bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                        />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
