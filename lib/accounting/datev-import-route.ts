import { NextResponse, type NextRequest } from "next/server";

import { getOptionalCurrentUserContext } from "@/lib/auth/current-user";
import {
    DatevExportRequestError,
    forwardDatevExportToN8n,
} from "@/lib/accounting/datev-export-server";
import type { DatevAccountingCompany } from "@/lib/accounting/datev-export-limits";

export async function handleDatevImportRequest(
    request: NextRequest,
    company: DatevAccountingCompany,
): Promise<NextResponse> {
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

    let file: File;

    try {
        const formData = await request.formData();
        const formFile = formData.get("file");

        if (!(formFile instanceof File)) {
            throw new DatevExportRequestError(
                "INVALID_REQUEST",
                "Bitte wähle eine CSV-Datei aus.",
            );
        }

        file = formFile;
    } catch (error) {
        if (error instanceof DatevExportRequestError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: 400 },
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "Die Datei konnte nicht gelesen werden.",
            },
            { status: 400 },
        );
    }

    try {
        const result = await forwardDatevExportToN8n({
            file,
            company,
            uploadedBy: userContext.authUserId,
        });

        return NextResponse.json({
            success: true,
            company: result.company,
            message: result.message,
        });
    } catch (error) {
        if (error instanceof DatevExportRequestError) {
            const status =
                error.code === "PAYLOAD_TOO_LARGE"
                    ? 413
                    : error.code === "CONFIGURATION_ERROR"
                        ? 503
                        : error.code === "TIMEOUT"
                            ? 504
                            : error.code === "UPSTREAM_ERROR"
                                ? 502
                                : 400;

            return NextResponse.json(
                { success: false, message: error.message },
                { status },
            );
        }

        console.error("[datev-import] unexpected request failure", { company });
        return NextResponse.json(
            {
                success: false,
                message: "DATEV-Export konnte nicht verarbeitet werden. Bitte erneut versuchen.",
            },
            { status: 500 },
        );
    }
}
