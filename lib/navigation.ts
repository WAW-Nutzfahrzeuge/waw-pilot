import {
    Activity,
    BadgeCheck,
    BarChart3,
    BookOpen,
    Car,
    ClipboardCheck,
    CreditCard,
    FileArchive,
    FileText,
    LayoutDashboard,
    Route,
    Settings,
    ShoppingCart,
    Users,
    Wrench,
} from "lucide-react";

import type { UserRole } from "@/lib/auth/roles";

export const mainNavigation = [
    {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        title: "Fahrzeug ankaufen",
        href: "/dashboard/ankauf",
        icon: ShoppingCart,
    },
    {
        title: "Fahrzeugbestand",
        href: "/dashboard/vehicles",
        icon: Car,
    },
    {
        title: "Kunden",
        href: "/dashboard/customers",
        icon: Users,
    },
    {
        title: "Verkäufe",
        href: "/dashboard/sales",
        icon: BookOpen,
    },
    {
        title: "Dokumente",
        href: "/dashboard/documents",
        icon: FileArchive,
    },
    {
        title: "Kassenbuch",
        href: "/dashboard/cashbook",
        icon: CreditCard,
    },
    {
        title: "Reisekosten",
        href: "/dashboard/travel-expenses",
        icon: Route,
    },
    {
        title: "Kennzeichen",
        href: "/dashboard/plates",
        icon: BadgeCheck,
    },
    {
        title: "Pflichtprüfung",
        href: "/dashboard/checks",
        icon: ClipboardCheck,
    },
    {
        title: "Berichte",
        href: "/dashboard/reports",
        icon: BarChart3,
    },
    {
        title: "Aktivitäten",
        href: "/dashboard/activities",
        icon: Activity,
    },
];

export const secondaryNavigation = [
    {
        title: "Schnittstellen",
        href: "/dashboard/integrations",
        icon: FileText,
    },
    {
        title: "Einstellungen",
        href: "/dashboard/settings",
        icon: Settings,
    },
    {
        title: "System",
        href: "/dashboard/system",
        icon: Wrench,
    },
];

export function getNavigationForRole(role: UserRole) {
    if (role === "admin") {
        return {
            main: mainNavigation,
            secondary: secondaryNavigation,
        };
    }

    return {
        main: mainNavigation.filter((item) => item.href === "/dashboard/plates"),
        secondary: [],
    };
}
