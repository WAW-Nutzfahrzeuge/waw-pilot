import { VehicleDetail } from "@/components/vehicles/vehicle-detail";
import { getVehicleDetail } from "@/lib/vehicles/vehicle-detail-queries";

type VehicleDetailPageProps = {
    params: Promise<{
        vehicleId: string;
    }>;
    searchParams: Promise<{
        vehicleSaved?: string;
        vehicleDocumentUploaded?: string;
        vehicleDocumentDeleted?: string;
        vehicleDocumentUploadError?: string;
    }>;
};

export default async function VehicleDetailPage({
                                                    params,
                                                    searchParams,
                                                }: VehicleDetailPageProps) {
    const { vehicleId } = await params;
    const [resolvedSearchParams, vehicle] = await Promise.all([
        searchParams,
        getVehicleDetail(vehicleId),
    ]);

    return (
        <VehicleDetail
            vehicle={vehicle}
            vehicleSaved={resolvedSearchParams.vehicleSaved === "1"}
            vehicleDocumentUploaded={
                resolvedSearchParams.vehicleDocumentUploaded === "1"
            }
            vehicleDocumentDeleted={resolvedSearchParams.vehicleDocumentDeleted === "1"}
            vehicleDocumentUploadError={
                resolvedSearchParams.vehicleDocumentUploadError ?? null
            }
        />
    );
}
