import { PurchaseDetail } from "@/components/purchases/purchase-detail";
import { getCurrentUserRole } from "@/lib/auth/current-user";
import { getPurchaseCaseDetail } from "@/lib/purchases/purchase-detail-queries";

type PurchaseDetailPageProps = {
    params: Promise<{
        purchaseId: string;
    }>;
    searchParams?: Promise<{
        sellerSaved?: string;
        vehicleSaved?: string;
    }>;
};

type PurchaseDetailSearchParams = Awaited<NonNullable<PurchaseDetailPageProps["searchParams"]>>;

export default async function PurchaseDetailPage({
                                                     params,
                                                     searchParams,
                                                 }: PurchaseDetailPageProps) {
    const { purchaseId } = await params;
    const searchParamsPromise: Promise<PurchaseDetailSearchParams> =
        searchParams ?? Promise.resolve({});
    const [resolvedSearchParams, purchase, role] = await Promise.all([
        searchParamsPromise,
        getPurchaseCaseDetail(purchaseId),
        getCurrentUserRole(),
    ]);

    return (
        <PurchaseDetail
            purchase={purchase}
            canAdminDelete={role === "admin"}
            sellerSaved={resolvedSearchParams?.sellerSaved === "1"}
            vehicleSaved={resolvedSearchParams?.vehicleSaved === "1"}
        />
    );
}
