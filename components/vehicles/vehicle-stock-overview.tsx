"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import type { InventoryListRow } from "@/lib/vehicles/inventory-list-queries";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VehicleInventoryList } from "@/components/vehicles/vehicle-inventory-list";
import { VehicleStockSnapshotList } from "@/components/vehicles/vehicle-stock-snapshot-list";

type VehicleStockOverviewProps = {
    rows: InventoryListRow[];
};

/**
 * Bestandsliste (Bewegungen: An-/Verkäufe) und Inventurliste (historischer
 * Bestand zu einem Stichtag) sind fachlich unterschiedliche Auswertungen und
 * werden deshalb als getrennte Tabs im selben Bereich angeboten, statt sie in
 * einer Liste zu vermischen oder einen neuen Hauptmenüpunkt anzulegen.
 */
export function VehicleStockOverview({ rows }: VehicleStockOverviewProps) {
    return (
        <div className="space-y-6 print:space-y-4">
            <div className="print:hidden">
                <PageHeader
                    eyebrow="Fahrzeugbestand"
                    title="Bestandsliste & Inventur"
                    description="Bestandsliste für An- und Verkäufe im Zeitraum sowie Inventurliste für den historischen Fahrzeugbestand zu einem Stichtag."
                    action={
                        <Button
                            asChild
                            variant="outline"
                            className="rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/vehicles">
                                <ArrowLeft className="mr-2 size-4" />
                                Zurück
                            </Link>
                        </Button>
                    }
                />
            </div>

            <Tabs defaultValue="bestandsliste" className="w-full">
                <div className="print:hidden">
                    <TabsList className="h-11 rounded-2xl bg-slate-100 p-1">
                        <TabsTrigger value="bestandsliste" className="rounded-xl font-bold">
                            Bestandsliste
                        </TabsTrigger>
                        <TabsTrigger value="inventurliste" className="rounded-xl font-bold">
                            Inventurliste
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="bestandsliste" className="m-0">
                    <VehicleInventoryList rows={rows} />
                </TabsContent>

                <TabsContent value="inventurliste" className="m-0">
                    <VehicleStockSnapshotList rows={rows} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
