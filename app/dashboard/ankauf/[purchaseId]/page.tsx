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

export default async function PurchaseDetailPage({
                                                     params,
                                                     searchParams,
                                                 }: PurchaseDetailPageProps) {
    const [{ purchaseId }, resolvedSearchParams] = await Promise.all([
        params,
        searchParams,
    ]);

    const purchase = await getPurchaseCaseDetail(purchaseId);

    return (
        <PurchaseDetail
            purchase={purchase}
            sellerSaved={resolvedSearchParams?.sellerSaved === "1"}
            vehicleSaved={resolvedSearchParams?.vehicleSaved === "1"}
        />
    );
}
