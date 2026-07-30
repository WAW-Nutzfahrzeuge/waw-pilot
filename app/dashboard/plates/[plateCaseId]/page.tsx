import { LicensePlateDetail } from "@/components/license-plates/license-plate-detail";
import { getLicensePlateCaseDetail } from "@/lib/license-plates/license-plate-detail-queries";

type LicensePlateDetailPageProps = {
    params: Promise<{
        plateCaseId: string;
    }>;
    searchParams: Promise<{
        generatedDocument?: string;
    }>;
};

export default async function LicensePlateDetailPage({
                                                         params,
                                                         searchParams,
                                                     }: LicensePlateDetailPageProps) {
    const { plateCaseId } = await params;
    const [resolvedSearchParams, plateCase] = await Promise.all([
        searchParams,
        getLicensePlateCaseDetail(plateCaseId),
    ]);

    return (
        <LicensePlateDetail
            plateCase={plateCase}
            generatedDocumentType={resolvedSearchParams.generatedDocument ?? null}
        />
    );
}
