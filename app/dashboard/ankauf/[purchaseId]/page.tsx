import { PurchaseDetail } from "@/components/purchases/purchase-detail";
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
    const [resolvedSearchParams, purchase] = await Promise.all([
        searchParamsPromise,
        getPurchaseCaseDetail(purchaseId),
    ]);

    return (
        <PurchaseDetail
            purchase={purchase}
            sellerSaved={resolvedSearchParams?.sellerSaved === "1"}
            vehicleSaved={resolvedSearchParams?.vehicleSaved === "1"}
        />
    );
}
