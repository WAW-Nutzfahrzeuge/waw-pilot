import { NextResponse } from "next/server";

import { getOptionalCurrentUserContext } from "@/lib/auth/current-user";
import {
    AccountingReportRequestError,
    fetchWawAccountingReport,
} from "@/lib/accounting/accounting-report-server";

export const runtime = "nodejs";

export async function GET() {
    const userContext = await getOptionalCurrentUserContext();

    if (!userContext) {
        return NextResponse.json(
            { success: false, message: "Nicht angemeldet." },
            { status: 401 },
        );
    }

    if (userContext.profile.role !== "admin") {
        return NextResponse.json(
            { success: false, message: "Keine Berechtigung." },
            { status: 403 },
        );
    }

    try {
        const items = await fetchWawAccountingReport();
        return NextResponse.json({ success: true, items });
    } catch (error) {
        if (error instanceof AccountingReportRequestError) {
            const status =
                error.code === "CONFIGURATION" || error.code === "TIMEOUT"
                    ? error.code === "TIMEOUT" ? 504 : 503
                    : 502;

            return NextResponse.json(
                {
                    success: false,
                    message: "Buchhaltungsdaten konnten nicht geladen werden.",
                },
                { status },
            );
        }

        console.error("[accounting-report] unexpected WAW endpoint error");
        return NextResponse.json(
            {
                success: false,
                message: "Buchhaltungsdaten konnten nicht geladen werden.",
            },
            { status: 500 },
        );
    }
}
