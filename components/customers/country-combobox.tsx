"use client";

import { useState } from "react";

import {
    COUNTRY_OPTIONS,
    normalizeCustomerCountry,
} from "@/lib/countries/country-options";
import { SearchCombobox } from "@/components/ui/search-combobox";

type CountryComboboxProps = {
    name?: string;
    label?: string;
    defaultValue?: string | null;
    value?: string;
    onValueChange?: (value: string) => void;
    required?: boolean;
    className?: string;
};

export function CountryCombobox({
    name = "country",
    label = "Land",
    defaultValue = null,
    value,
    onValueChange,
    required = false,
    className,
}: CountryComboboxProps) {
    const [internalCountry, setInternalCountry] = useState(
        () => normalizeCustomerCountry(defaultValue) ?? defaultValue ?? "",
    );
    const country = value ?? internalCountry;

    function handleCountryChange(nextCountry: string) {
        if (value === undefined) setInternalCountry(nextCountry);
        onValueChange?.(nextCountry);
    }

    return (
        <SearchCombobox
            options={COUNTRY_OPTIONS}
            name={name}
            label={label}
            value={country}
            required={required}
            placeholder="Land suchen oder auswählen..."
            emptyText="Kein Land gefunden."
            description="Bitte wähle das Zielland aus der Liste aus."
            maxVisibleItems={250}
            className={className}
            onValueChange={handleCountryChange}
        />
    );
}
