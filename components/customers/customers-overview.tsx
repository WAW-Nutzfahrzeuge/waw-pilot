import Link from "next/link";
import {
    Building2,
    Plus,
    Truck,
    User,
    Users,
} from "lucide-react";

import type { CustomerRow } from "@/lib/customers/customer-queries";
import { CustomersListPanel } from "@/components/customers/customers-list-panel";
import { PageHeader } from "@/components/shared/page-header";
import { FlashMessage } from "@/components/shared/flash-message";
import { CompactStatCard } from "@/components/cards/compact-stat-card";
import { Button } from "@/components/ui/button";

type CustomersOverviewProps = {
    customers: CustomerRow[];
    customerSaved?: boolean;
    customerCreated?: boolean;
    highlightedCustomerId?: string;
};

export function CustomersOverview({
    customers,
    customerSaved = false,
    customerCreated = false,
    highlightedCustomerId,
}: CustomersOverviewProps) {
    const companyCustomers = customers.filter(
        (customer) => customer.type === "company",
    ).length;

    const privateCustomers = customers.filter(
        (customer) => customer.type === "private",
    ).length;

    const totalVehicles = customers.reduce(
        (sum, customer) => sum + customer.vehicles_count,
        0,
    );

    const totalSales = customers.reduce(
        (sum, customer) => sum + customer.sales_count,
        0,
    );

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kundenverwaltung"
                title="Kunden"
                description="Firmen, Privatpersonen, Verkäufer und Käufer zentral verwalten. Alle späteren Verkäufe, Fahrzeuge und Rechnungen werden sauber mit Kunden verknüpft."
                action={
                    <Button
                        asChild
                        className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"
                    >
                        <Link href="/dashboard/customers/new">
                            <Plus className="mr-2 size-4" />
                            Kunde anlegen
                        </Link>
                    </Button>
                }
            />

            {customerSaved ? (
                <FlashMessage message="Kundendaten wurden gespeichert." />
            ) : null}

            {customerCreated ? (
                <FlashMessage message="Kunde wurde angelegt." />
            ) : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <CustomerStatCard
                    label="Kunden gesamt"
                    value={customers.length}
                    description="alle Kontakte"
                    icon={Users}
                />
                <CustomerStatCard
                    label="Firmen"
                    value={companyCustomers}
                    description="gewerbliche Kunden"
                    icon={Building2}
                />
                <CustomerStatCard
                    label="Privatkunden"
                    value={privateCustomers}
                    description="private Kontakte"
                    icon={User}
                />
                <CustomerStatCard
                    label="Verknüpfte Fahrzeuge"
                    value={totalVehicles}
                    description={`${totalSales} Verkäufe hinterlegt`}
                    icon={Truck}
                />
            </section>

            <CustomersListPanel
                customers={customers}
                highlightedCustomerId={highlightedCustomerId}
            />
        </div>
    );
}

type CustomerStatCardProps = {
    label: string;
    value: string | number;
    description: string;
    icon: typeof Users;
};

function CustomerStatCard({
                              label,
                              value,
                              description,
                              icon: Icon,
                          }: CustomerStatCardProps) {
    return (
        <CompactStatCard
            label={label}
            value={value}
            description={description}
            icon={Icon}
            tone="info"
        />
    );
}
