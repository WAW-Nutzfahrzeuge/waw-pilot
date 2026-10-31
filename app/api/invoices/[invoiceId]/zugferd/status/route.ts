import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { checkAndFinalizeZugferdStatus } from "@/lib/zugferd/zugferd-status-check";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function GET(_request: Request, context: RouteContext) {
    const { invoiceId } = await context.params;
    const companyId = getCurrentCompanyId();
    const result = await checkAndFinalizeZugferdStatus({ invoiceId, companyId });
    return NextResponse.json(result.body, { status: result.httpStatus });
}
