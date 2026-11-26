import type { ReactNode } from "react";

import { getCurrentUserRole } from "@/lib/auth/current-user";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { StatusLegendTrigger } from "@/components/shared/status-legend-trigger";
import { IdleLogoutWatcher } from "@/components/auth/idle-logout-watcher";

type DashboardShellProps = {
    children: ReactNode;
};

export async function DashboardShell({ children }: DashboardShellProps) {
    const role = await getCurrentUserRole();

    return (
        <div className="min-h-screen bg-transparent lg:h-dvh lg:min-h-0 lg:overflow-hidden">
            <IdleLogoutWatcher />
            <AppSidebar role={role} />
            <MobileHeader role={role} />

            <main className="dashboard-main-scroll min-h-screen lg:ml-72 lg:h-dvh lg:min-h-0 lg:overflow-auto">
                <div dir="ltr" className="dashboard-main-content mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-5 md:px-6 lg:px-8 lg:py-7">
                    {children}
                </div>
            </main>

            <StatusLegendTrigger />
        </div>
    );
}
