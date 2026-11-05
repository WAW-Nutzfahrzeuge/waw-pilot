import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldLabelProps = {
    htmlFor?: string;
    required?: boolean;
    className?: string;
    children: ReactNode;
};

/** Consistent visible indicator for fields required to save a form. */
export function FieldLabel({
    htmlFor,
    required = false,
    className,
    children,
}: FieldLabelProps) {
    const label = typeof children === "string" ? children.replace(/\s*\*$/, "") : children;

    return (
        <Label
            htmlFor={htmlFor}
            className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 font-bold text-slate-700", className)}
        >
            <span>{label}</span>
            {required ? <span className="font-bold text-red-600">(erforderlich)</span> : null}
        </Label>
    );
}
