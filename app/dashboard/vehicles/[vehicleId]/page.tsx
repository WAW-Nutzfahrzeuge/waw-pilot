import { VehicleDetail } from "@/components/vehicles/vehicle-detail";
import { getVehicleAdminDeleteDependencyPreview } from "@/lib/admin-delete/admin-delete-preview-queries";
import { getCurrentUserRole } from "@/lib/auth/current-user";
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
    const [resolvedSearchParams, vehicle, role, adminDeleteDependencyPreview] = await Promise.all([
        searchParams,
        getVehicleDetail(vehicleId),
        getCurrentUserRole(),
        getVehicleAdminDeleteDependencyPreview(vehicleId),
    ]);

    return (
        <VehicleDetail
            vehicle={vehicle}
            canAdminDelete={role === "admin"}
            adminDeleteDependencyPreview={adminDeleteDependencyPreview}
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
