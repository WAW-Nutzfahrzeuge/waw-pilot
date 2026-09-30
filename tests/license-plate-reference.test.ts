import assert from "node:assert/strict";
import test from "node:test";

import { resolveLicensePlateCaseReference } from "../lib/license-plates/license-plate-reference.ts";
import {
    getSelectedLicensePlateFormSale,
} from "../lib/license-plates/license-plate-sale-selection.ts";

type QueryResult = { data: unknown; error: unknown };

function createSupabaseStub(results: Record<string, QueryResult>) {
    return {
        from(table: string) {
            const query = {
                select() {
                    return query;
                },
                eq() {
                    return query;
                },
                async maybeSingle() {
                    return results[table] ?? { data: null, error: null };
                },
            };

            return query;
        },
    };
}

test("Verkauf ist die Source of Truth für Fahrzeug und Käufer", async () => {
    const reference = await resolveLicensePlateCaseReference({
        supabase: createSupabaseStub({
            sales: {
                data: {
                    id: "sale-a",
                    vehicle_id: "vehicle-a",
                    buyer_customer_id: "customer-a",
                },
                error: null,
            },
        }) as never,
        companyId: "company-a",
        saleId: "sale-a",
        // Simuliert einen manipulierten Request mit IDs aus einem anderen Verkauf.
        vehicleId: "vehicle-b",
        customerId: "customer-b",
    });

    assert.deepEqual(reference, {
        saleId: "sale-a",
        vehicleId: "vehicle-a",
        customerId: "customer-a",
        source: "sale",
    });
});

test("ein nicht zum Unternehmen gehörender Verkauf wird abgelehnt", async () => {
    await assert.rejects(
        resolveLicensePlateCaseReference({
            supabase: createSupabaseStub({
                sales: { data: null, error: null },
            }) as never,
            companyId: "company-a",
            saleId: "sale-andere-firma",
            vehicleId: "vehicle-a",
            customerId: "customer-a",
        }),
        /gehört nicht zu diesem Unternehmen/,
    );
});

test("Vorgänge ohne Verkauf behalten den validierten manuellen Workflow", async () => {
    const reference = await resolveLicensePlateCaseReference({
        supabase: createSupabaseStub({
            vehicles: { data: { id: "vehicle-manual" }, error: null },
            customers: { data: { id: "customer-manual" }, error: null },
        }) as never,
        companyId: "company-a",
        saleId: null,
        vehicleId: "vehicle-manual",
        customerId: "customer-manual",
    });

    assert.deepEqual(reference, {
        saleId: null,
        vehicleId: "vehicle-manual",
        customerId: "customer-manual",
        source: "manual",
    });
});

test("ein manueller Fremdbezug wird abgelehnt", async () => {
    await assert.rejects(
        resolveLicensePlateCaseReference({
            supabase: createSupabaseStub({
                vehicles: { data: null, error: null },
                customers: { data: { id: "customer-a" }, error: null },
            }) as never,
            companyId: "company-a",
            saleId: null,
            vehicleId: "vehicle-andere-firma",
            customerId: "customer-a",
        }),
        /Fahrzeug gehört nicht zu diesem Unternehmen/,
    );
});

test("Wechsel oder Entfernen eines Verkaufs hinterlässt keine veralteten übernommenen IDs", () => {
    const sales = [
        {
            id: "sale-a",
            label: "Verkauf A",
            vehicle: { id: "vehicle-a", label: "Fahrzeug A", vin: "VIN-A" },
            customer: { id: "customer-a", label: "Käufer A" },
        },
        {
            id: "sale-b",
            label: "Verkauf B",
            vehicle: { id: "vehicle-b", label: "Fahrzeug B", vin: "VIN-B" },
            customer: { id: "customer-b", label: "Käufer B" },
        },
    ];

    assert.equal(getSelectedLicensePlateFormSale(sales, "sale-a")?.vehicle?.id, "vehicle-a");
    assert.equal(getSelectedLicensePlateFormSale(sales, "sale-b")?.customer?.id, "customer-b");
    assert.equal(getSelectedLicensePlateFormSale(sales, ""), null);
});
