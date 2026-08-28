import { NextResponse } from "next/server";

import { getOptionalCurrentUserContext } from "@/lib/auth/current-user";
import {
    AccountingReviewRequestError,
    fetchWawAccountingReview,
} from "@/lib/accounting/accounting-review-server";

export const runtime = "nodejs";

export async function GET() {
    const userContext = await getOptionalCurrentUserContext();

    if (!userContext) {
        return NextResponse.json({ success: false, message: "Nicht angemeldet." }, { status: 401 });
    }

    if (userContext.profile.role !== "admin") {
        return NextResponse.json({ success: false, message: "Keine Berechtigung." }, { status: 403 });
    }

    try {
        const report = await fetchWawAccountingReview();
        return NextResponse.json({ success: true, ...report });
    } catch (error) {
        if (error instanceof AccountingReviewRequestError) {
            const status =
                error.code === "CONFIGURATION" ? 503 : error.code === "TIMEOUT" ? 504 : 502;
            return NextResponse.json(
                { success: false, message: "Manuelle Buchhaltungsfälle konnten nicht geladen werden." },
                { status },
            );
        }

        console.error("[accounting-review] unexpected WAW review endpoint error");
        return NextResponse.json(
            { success: false, message: "Manuelle Buchhaltungsfälle konnten nicht geladen werden." },
            { status: 500 },
        );
    }
}
