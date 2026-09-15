import { type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FormFieldProps = {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string | number;
    placeholder?: string;
    description?: ReactNode;
    error?: ReactNode;
    children?: ReactNode;
    className?: string;
    onInput?: React.InputHTMLAttributes<HTMLInputElement>["onInput"];
};

export function FormField({
    label,
    name,
    type = "text",
    required = false,
    defaultValue,
    placeholder,
    description,
    error,
    children,
    className,
    onInput,
}: FormFieldProps) {
    return (
        <div className={cn("space-y-2", className)}>
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
                {required ? <RequiredIndicator /> : null}
            </Label>
            {children ?? (
                <Input
                    id={name}
                    name={name}
                    type={type}
                    required={required}
                    defaultValue={defaultValue}
                    placeholder={placeholder}
                    aria-invalid={Boolean(error)}
                    className="h-11 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                    onInput={onInput}
                />
            )}
            {description ? <p className="text-xs font-semibold leading-5 text-slate-500">{description}</p> : null}
            {error ? <p className="text-xs font-bold leading-5 text-red-700">{error}</p> : null}
        </div>
    );
}

export function TextareaField({
    label,
    name,
    required = false,
    defaultValue,
    placeholder,
    description,
    error,
    className,
}: Omit<FormFieldProps, "type" | "children">) {
    return (
        <FormField
            label={label}
            name={name}
            required={required}
            description={description}
            error={error}
            className={className}
        >
            <Textarea
                id={name}
                name={name}
                required={required}
                defaultValue={defaultValue}
                placeholder={placeholder}
                aria-invalid={Boolean(error)}
                className="min-h-28 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </FormField>
    );
}

export function RequiredIndicator() {
    return <span className="ml-1 text-red-600">*</span>;
}
