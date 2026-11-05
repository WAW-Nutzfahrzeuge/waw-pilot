"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/shared/field-label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchComboboxOption = {
    value: string;
    label: string;
    description?: string | null;
    keywords?: string[];
    disabled?: boolean;
};

type SearchComboboxProps = {
    options: SearchComboboxOption[];
    name?: string;
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    label?: string;
    placeholder?: string;
    emptyText?: string;
    loading?: boolean;
    disabled?: boolean;
    required?: boolean;
    error?: string | null;
    description?: string | null;
    maxVisibleItems?: number;
    renderOption?: (option: SearchComboboxOption, state: { active: boolean; selected: boolean }) => ReactNode;
    className?: string;
};

export function SearchCombobox({
    options,
    name,
    value,
    defaultValue = "",
    onValueChange,
    label,
    placeholder = "Auswählen oder suchen...",
    emptyText = "Keine Treffer gefunden.",
    loading = false,
    disabled = false,
    required = false,
    error = null,
    description = null,
    maxVisibleItems = 80,
    renderOption,
    className,
}: SearchComboboxProps) {
    const controlled = value !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue);
    const selectedValue = controlled ? value : internalValue;
    const selectedOption = options.find((option) => option.value === selectedValue) ?? null;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const filteredOptions = useMemo(() => {
        const normalizedQuery = normalizeSearchValue(query);

        if (!normalizedQuery) {
            return options.slice(0, maxVisibleItems);
        }

        return options
            .filter((option) => getOptionSearchText(option).includes(normalizedQuery))
            .slice(0, maxVisibleItems);
    }, [maxVisibleItems, options, query]);

    useEffect(() => {
        function onPointerDown(event: MouseEvent) {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", onPointerDown);

        return () => document.removeEventListener("mousedown", onPointerDown);
    }, []);

    function selectValue(nextValue: string) {
        const nextOption = options.find((option) => option.value === nextValue);

        if (!nextOption || nextOption.disabled) return;
        if (!controlled) setInternalValue(nextValue);

        onValueChange?.(nextValue);
        setQuery(nextOption.label);
        setOpen(false);
        inputRef.current?.blur();
    }

    function clearSelection() {
        if (!controlled) setInternalValue("");
        onValueChange?.("");
        setQuery("");
        setOpen(true);
        inputRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (disabled) return;

        if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
            return;
        }

        if (event.key === "Enter") {
            if (!open) return;
            event.preventDefault();

            const option = filteredOptions[activeIndex];
            if (option) selectValue(option.value);
        }
    }

    const listboxId = name ? `${name}-combobox-options` : undefined;

    return (
        <div ref={rootRef} className={cn("space-y-2", className)}>
            {label ? (
                <FieldLabel required={required} htmlFor={name ? `${name}-combobox` : undefined}>
                    {label}
                </FieldLabel>
            ) : null}

            {name ? <input type="hidden" name={name} value={selectedValue ?? ""} required={required} /> : null}

            <div
                className={cn(
                    "rounded-2xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-cyan-300 focus-within:ring-4 focus-within:ring-cyan-100",
                    error ? "border-red-200 bg-red-50 focus-within:border-red-300 focus-within:ring-red-100" : null,
                    disabled ? "opacity-60" : null,
                )}
            >
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        ref={inputRef}
                        id={name ? `${name}-combobox` : undefined}
                        role="combobox"
                        aria-controls={listboxId}
                        aria-expanded={open}
                        aria-invalid={Boolean(error)}
                        disabled={disabled}
                        value={open ? query : query || selectedOption?.label || ""}
                        onFocus={() => {
                            setOpen(true);
                            setActiveIndex(0);
                            if (!query && selectedOption) setQuery(selectedOption.label);
                        }}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActiveIndex(0);
                            setOpen(true);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedOption?.label || placeholder}
                        className="h-10 border-0 bg-white pl-9 pr-16 font-semibold shadow-none focus-visible:ring-0"
                    />
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
                        {selectedValue && !disabled ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                onClick={clearSelection}
                                aria-label="Auswahl löschen"
                            >
                                <X className="size-3.5" />
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={disabled}
                            onClick={() => {
                                setOpen((current) => !current);
                                setActiveIndex(0);
                                inputRef.current?.focus();
                            }}
                            aria-label={open ? "Auswahl schließen" : "Auswahl öffnen"}
                        >
                            <ChevronDown className={cn("size-3.5 transition", open ? "rotate-180" : null)} />
                        </Button>
                    </div>
                </div>

                {open ? (
                    <div
                        id={listboxId}
                        role="listbox"
                        className="mt-2 max-h-72 overflow-y-auto rounded-xl bg-white"
                    >
                        {loading ? (
                            <p className="px-3 py-4 text-sm font-bold text-slate-500">Lädt...</p>
                        ) : filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => {
                                const active = index === activeIndex;
                                const selected = option.value === selectedValue;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        disabled={option.disabled}
                                        onMouseEnter={() => setActiveIndex(index)}
                                        onClick={() => selectValue(option.value)}
                                        className={cn(
                                            "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                                            active ? "bg-slate-50" : null,
                                            selected ? "bg-cyan-50 ring-1 ring-cyan-200" : null,
                                        )}
                                    >
                                        {renderOption ? (
                                            renderOption(option, { active, selected })
                                        ) : (
                                            <DefaultOption option={option} query={query} selected={selected} />
                                        )}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="px-3 py-4 text-sm font-bold text-slate-500">{emptyText}</p>
                        )}
                    </div>
                ) : null}
            </div>

            {description ? <p className="text-xs font-semibold leading-5 text-slate-500">{description}</p> : null}
            {error ? <p className="text-xs font-bold leading-5 text-red-700">{error}</p> : null}
        </div>
    );
}

function DefaultOption({
    option,
    query,
    selected,
}: {
    option: SearchComboboxOption;
    query: string;
    selected: boolean;
}) {
    return (
        <>
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                {selected ? <Check className="size-4 text-cyan-700" /> : null}
            </span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold text-slate-950">
                    <HighlightedText text={option.label} query={query} />
                </span>
                {option.description ? (
                    <span className="block truncate text-xs font-semibold text-slate-500">
                        <HighlightedText text={option.description} query={query} />
                    </span>
                ) : null}
            </span>
        </>
    );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) return text;

    const index = text.toLowerCase().indexOf(normalizedQuery.toLowerCase());

    if (index < 0) return text;

    return (
        <>
            {text.slice(0, index)}
            <mark className="rounded bg-cyan-100 px-0.5 text-cyan-950">{text.slice(index, index + normalizedQuery.length)}</mark>
            {text.slice(index + normalizedQuery.length)}
        </>
    );
}

function getOptionSearchText(option: SearchComboboxOption): string {
    return normalizeSearchValue(
        [option.value, option.label, option.description, ...(option.keywords ?? [])].filter(Boolean).join(" "),
    );
}

function normalizeSearchValue(value: string): string {
    return value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
