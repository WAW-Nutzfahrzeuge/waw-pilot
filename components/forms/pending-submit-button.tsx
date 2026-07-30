"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { FilePlus2, FileText, Loader2, Mail, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type PendingSubmitButtonIconName = "file-plus" | "file-text" | "mail" | "trash";

const pendingSubmitButtonIcons: Record<PendingSubmitButtonIconName, LucideIcon> = {
    "file-plus": FilePlus2,
    "file-text": FileText,
    mail: Mail,
    trash: Trash2,
};

type PendingSubmitButtonProps = Omit<
    ComponentProps<typeof Button>,
    "disabled" | "type"
> & {
    label: string;
    pendingLabel: string;
    iconName?: PendingSubmitButtonIconName;
    disabled?: boolean;
    iconClassName?: string;
};

export function PendingSubmitButton({
    label,
    pendingLabel,
    iconName,
    disabled = false,
    iconClassName = "mr-2 size-4",
    children,
    ...buttonProps
}: PendingSubmitButtonProps) {
    const { pending } = useFormStatus();
    const Icon = iconName ? pendingSubmitButtonIcons[iconName] : null;

    return (
        <Button type="submit" disabled={disabled || pending} {...buttonProps}>
            {pending ? (
                <Loader2 className={`${iconClassName} animate-spin`} />
            ) : Icon ? (
                <Icon className={iconClassName} />
            ) : null}
            {children ?? (pending ? pendingLabel : label)}
        </Button>
    );
}
