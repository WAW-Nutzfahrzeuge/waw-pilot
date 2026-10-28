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
    FileQuestion,
    Landmark,
    LayoutDashboard,
    Receipt,
    Route,
    Settings,
    ShoppingCart,
    Users,
    Wrench,
} from "lucide-react";

import type { UserRole } from "@/lib/auth/roles";

// Groups cluster related sidebar entries under a shared label so the menu
// reads as sections instead of one long flat list. "undefined" means the
// item is rendered standalone, without a group label, above the sections.
export type NavigationGroupId =
    | "handel"
    | "dokumente"
    | "finanzen"
    | "kennzeichen"
    | "analyse";

export const navigationGroupLabels: Record<NavigationGroupId, string> = {
    handel: "Handel",
    dokumente: "Rechnungen & Dokumente",
    finanzen: "Finanzen",
    kennzeichen: "Kennzeichen & Prüfung",
    analyse: "Analyse",
};

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
        group: "handel",
    },
    {
        title: "Fahrzeugbestand",
        href: "/dashboard/vehicles",
        icon: Car,
        group: "handel",
    },
    {
        title: "Kunden",
        href: "/dashboard/customers",
        icon: Users,
        group: "handel",
    },
    {
        title: "Verkäufe",
        href: "/dashboard/sales",
        icon: BookOpen,
        group: "handel",
    },
    {
        title: "Rechnungen",
        href: "/dashboard/invoices",
        icon: Receipt,
        group: "dokumente",
    },
    {
        title: "Dokumente",
        href: "/dashboard/documents",
        icon: FileArchive,
        group: "dokumente",
    },
    {
        title: "Nicht zugeordnete Dokumente",
        href: "/dashboard/unassigned-documents",
        icon: FileQuestion,
        group: "dokumente",
    },
    {
        title: "Kassenbuch",
        href: "/dashboard/cashbook",
        icon: CreditCard,
        group: "finanzen",
    },
    {
        title: "Reisekosten",
        href: "/dashboard/travel-expenses",
        icon: Route,
        group: "finanzen",
    },
    {
        title: "Buchhaltung WAW",
        href: "/dashboard/accounting/waw",
        icon: Landmark,
        group: "finanzen",
    },
    {
        title: "Buchhaltung WBT",
        href: "/dashboard/accounting/wbt",
        icon: Landmark,
        group: "finanzen",
    },
    {
        title: "Kennzeichen",
        href: "/dashboard/plates",
        icon: BadgeCheck,
        group: "kennzeichen",
    },
    {
        title: "Pflichtprüfung",
        href: "/dashboard/checks",
        icon: ClipboardCheck,
        group: "kennzeichen",
    },
    {
        title: "Berichte",
        href: "/dashboard/reports",
        icon: BarChart3,
        group: "analyse",
    },
    {
        title: "Aktivitäten",
        href: "/dashboard/activities",
        icon: Activity,
        group: "analyse",
    },
] satisfies Array<{
    title: string;
    href: string;
    icon: typeof LayoutDashboard;
    group?: NavigationGroupId;
}>;

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

export type NavigationItem = (typeof mainNavigation)[number];

export type NavigationSection = {
    group: NavigationGroupId;
    label: string;
    items: NavigationItem[];
};

// Splits a (possibly role-filtered) list of main navigation items into
// standalone entries (no group, e.g. Dashboard) and labeled sections, in the
// order groups first appear. Role-based filtering may remove items from a
// group entirely, in which case that group's label is simply omitted.
export function groupNavigationItems(items: NavigationItem[]): {
    ungrouped: NavigationItem[];
    sections: NavigationSection[];
} {
    const ungrouped: NavigationItem[] = [];
    const itemsByGroup = new Map<NavigationGroupId, NavigationItem[]>();
    const groupOrder: NavigationGroupId[] = [];

    for (const item of items) {
        if (!item.group) {
            ungrouped.push(item);
            continue;
        }

        if (!itemsByGroup.has(item.group)) {
            itemsByGroup.set(item.group, []);
            groupOrder.push(item.group);
        }

        itemsByGroup.get(item.group)!.push(item);
    }

    const sections = groupOrder.map((group) => ({
        group,
        label: navigationGroupLabels[group],
        items: itemsByGroup.get(group) ?? [],
    }));

    return { ungrouped, sections };
}
