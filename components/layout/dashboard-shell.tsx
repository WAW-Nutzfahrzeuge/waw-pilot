import type { ReactNode } from "react";

import { getCurrentUserRole } from "@/lib/auth/current-user";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { StatusLegendTrigger } from "@/components/shared/status-legend-trigger";

type DashboardShellProps = {
    children: ReactNode;
};

export async function DashboardShell({ children }: DashboardShellProps) {
    const role = await getCurrentUserRole();

    return (
        <div className="min-h-screen bg-transparent">
            <AppSidebar role={role} />
            <MobileHeader role={role} />

            <main className="min-h-screen lg:pl-72">
                <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-5 md:px-6 lg:px-8 lg:py-7">
                    {children}
                </div>
            </main>

            <StatusLegendTrigger />
        </div>
    );
}
