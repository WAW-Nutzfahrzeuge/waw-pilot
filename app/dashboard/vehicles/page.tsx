import { VehicleInventory } from "@/components/vehicles/vehicle-inventory";
import { getVehicles } from "@/lib/vehicles/vehicle-queries";

export const dynamic = "force-dynamic";

type VehiclesPageProps = {
    searchParams?: Promise<{
        vehicleCreated?: string;
        highlightVehicleId?: string;
    }>;
};

type VehiclesPageSearchParams = Awaited<NonNullable<VehiclesPageProps["searchParams"]>>;

export default async function VehiclesPage({ searchParams }: VehiclesPageProps) {
    const searchParamsPromise: Promise<VehiclesPageSearchParams> =
        searchParams ?? Promise.resolve({});
    const [vehicles, params] = await Promise.all([
        getVehicles(),
        searchParamsPromise,
    ]);

    return (
        <VehicleInventory
            vehicles={vehicles}
            vehicleCreated={params.vehicleCreated === "1"}
            highlightVehicleId={params.highlightVehicleId ?? null}
        />
    );
}
