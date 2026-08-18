import { redirect } from "next/navigation";

import { DatevAccountingPage } from "@/components/accounting/datev-accounting-page";
import { getCurrentUserRole } from "@/lib/auth/current-user";

export default async function WbtAccountingPage() {
    const role = await getCurrentUserRole();

    if (role !== "admin") {
        redirect("/dashboard/plates");
    }

    return <DatevAccountingPage company="WBT" />;
}
