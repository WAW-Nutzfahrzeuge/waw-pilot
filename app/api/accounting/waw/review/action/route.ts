import { NextResponse, type NextRequest } from "next/server";

import { getOptionalCurrentUserContext } from "@/lib/auth/current-user";
import {
    AccountingReviewRequestError,
    saveWawSupplierEmail,
} from "@/lib/accounting/accounting-review-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const userContext = await getOptionalCurrentUserContext();

    if (!userContext) {
        return NextResponse.json({ success: false, message: "Nicht angemeldet." }, { status: 401 });
    }

    if (userContext.profile.role !== "admin") {
        return NextResponse.json({ success: false, message: "Keine Berechtigung." }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, message: "Die Eingabe ist ungültig." }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
        return NextResponse.json({ success: false, message: "Die Eingabe ist ungültig." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    if (input.action !== "SAVE_SUPPLIER_EMAIL") {
        return NextResponse.json({ success: false, message: "Die Aktion ist ungültig." }, { status: 400 });
    }

    const bookingId = typeof input.bookingId === "number" ? input.bookingId : Number.NaN;
    const supplierName = typeof input.supplierName === "string" ? input.supplierName : "";
    const email = typeof input.email === "string" ? input.email : "";

    try {
        const message = await saveWawSupplierEmail({ bookingId, supplierName, email });
        return NextResponse.json({ success: true, message });
    } catch (error) {
        if (error instanceof AccountingReviewRequestError) {
            const status =
                error.code === "CONFIGURATION" ? 503 : error.code === "TIMEOUT" ? 504 : error.code === "UPSTREAM" ? 502 : 400;
            return NextResponse.json({ success: false, message: error.message }, { status });
        }

        console.error("[accounting-review] unexpected WAW review action error");
        return NextResponse.json(
            { success: false, message: "Die Lieferanten-E-Mail konnte nicht gespeichert werden." },
            { status: 500 },
        );
    }
}
