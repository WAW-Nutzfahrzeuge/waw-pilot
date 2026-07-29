"use client";

import { useMemo, useState } from "react";
import { Check, Truck } from "lucide-react";

import { SearchCombobox, type SearchComboboxOption } from "@/components/ui/search-combobox";
import { getVehicleDisplayName } from "@/lib/vehicles/vehicle-helpers";
import type { VehicleRow } from "@/lib/vehicles/vehicle-queries";

type VehicleComboboxProps = {
    vehicles: VehicleRow[];
    name: string;
    label?: string;
    value?: string;
    required?: boolean;
    placeholder?: string;
    emptyText?: string;
    onChange?: (vehicleId: string) => void;
};

export function VehicleCombobox({
    vehicles,
    name,
    label = "Fahrzeug",
    value = "",
    required = false,
    placeholder = "Fahrzeug suchen...",
    emptyText = "Kein Fahrzeug gefunden.",
    onChange,
}: VehicleComboboxProps) {
    const [selectedId, setSelectedId] = useState(value);
    const options = useMemo<SearchComboboxOption[]>(
        () =>
            vehicles.map((vehicle) => ({
                value: vehicle.id,
                label: getVehicleDisplayName(vehicle),
                description: [
                    `VIN: ${vehicle.vin}`,
                    vehicle.construction_year ? `Baujahr: ${vehicle.construction_year}` : null,
                    vehicle.license_plate ? `Kennzeichen: ${vehicle.license_plate}` : null,
                    getStatusLabel(vehicle.status),
                ]
                    .filter(Boolean)
                    .join(" · "),
                keywords: [
                    vehicle.manufacturer,
                    vehicle.model,
                    vehicle.vehicle_type,
                    vehicle.construction_year?.toString() ?? "",
                    vehicle.vin,
                    vehicle.license_plate ?? "",
                    vehicle.seller_name ?? "",
                ],
            })),
        [vehicles],
    );

    function handleValueChange(vehicleId: string) {
        setSelectedId(vehicleId);
        onChange?.(vehicleId);
    }

    return (
        <SearchCombobox
            options={options}
            name={name}
            label={label}
            value={selectedId}
            required={required}
            placeholder={placeholder}
            emptyText={emptyText}
            maxVisibleItems={50}
            onValueChange={handleValueChange}
            renderOption={(option, { selected }) => (
                <>
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                        {selected ? (
                            <Check className="size-4 text-cyan-700" />
                        ) : (
                            <Truck className="size-4" />
                        )}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold text-slate-950">
                            {option.label}
                        </span>
                        <span className="block truncate text-xs font-semibold text-slate-500">
                            {option.description}
                        </span>
                    </span>
                </>
            )}
        />
    );
}

function getStatusLabel(status: VehicleRow["status"]): string {
    if (status === "in_stock") return "Im Bestand";
    if (status === "reserved") return "Reserviert";
    if (status === "sold") return "Verkauft";

    return status;
}
