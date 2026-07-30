"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
    getMonthFilterOptions,
    normalizeMonthFilter,
} from "@/utils/month-filter";

export function MonthFilter({
    name = "month",
    label = "Monat",
    value,
    onChange,
    updateUrl = false,
}: {
    name?: string;
    label?: string;
    value: string;
    onChange?: (value: string) => void;
    updateUrl?: boolean;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    function handleChange(nextValue: string) {
        onChange?.(nextValue);

        if (!updateUrl) return;

        const params = new URLSearchParams(searchParams.toString());
        if (normalizeMonthFilter(nextValue) === "current") {
            params.delete(name);
        } else {
            params.set(name, nextValue);
        }

        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    }

    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
            </Label>
            <select
                id={name}
                name={name}
                value={value}
                onChange={(event) => handleChange(event.target.value)}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
            >
                {getMonthFilterOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
