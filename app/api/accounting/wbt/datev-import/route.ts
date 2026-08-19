import { type NextRequest } from "next/server";

import { handleDatevImportRequest } from "@/lib/accounting/datev-import-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    return handleDatevImportRequest(request, "WBT");
}
