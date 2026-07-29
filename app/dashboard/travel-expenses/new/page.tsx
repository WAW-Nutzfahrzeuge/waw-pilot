import {
    TravelExpenseForm,
    type TravelExpenseInitialValues,
} from "@/components/reports/travel-expense-form";
import { getSaleDetail } from "@/lib/sales/sale-detail-queries";

type NewTravelExpensePageProps = {
    searchParams: Promise<{
        saleId?: string;
        vehicleId?: string;
        customerId?: string;
    }>;
};

export default async function NewTravelExpensePage({
                                                       searchParams,
                                                   }: NewTravelExpensePageProps) {
    const resolvedSearchParams = await searchParams;
    const saleId = resolvedSearchParams.saleId ?? null;
    const sale = saleId
        ? await getSaleDetail(saleId).catch(() => null)
        : null;

    const initialValues: TravelExpenseInitialValues | undefined = sale
        ? {
            saleId: sale.id,
            vehicleId: sale.vehicle.id,
            customerId: sale.customer.id,
            visitedCustomer: sale.customer.name,
            location: [sale.customer.city, sale.customer.country]
                .filter(Boolean)
                .join(", "),
            vehicleOrPlate: [
                sale.vehicle.license_plate,
                sale.vehicle.name,
            ]
                .filter(Boolean)
                .join(" · "),
            purpose: `Reisekosten zum Verkauf ${sale.invoice?.invoice_number ?? sale.id}`,
        }
        : {
            saleId,
            vehicleId: resolvedSearchParams.vehicleId ?? null,
            customerId: resolvedSearchParams.customerId ?? null,
        };

    return <TravelExpenseForm initialValues={initialValues} />;
}
