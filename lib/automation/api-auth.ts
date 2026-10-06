import "server-only";

import { timingSafeEqual } from "node:crypto";

import { getCurrentCompanyId } from "@/lib/company";

export type AutomationContext = { companyId: string };

function equalsConstantTime(actual: string, expected: string): boolean {
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function authenticateAutomationRequest(request: Request): AutomationContext | null {
    const configuredToken = process.env.AUTOMATION_API_TOKEN?.trim();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

    if (!configuredToken || !token || !equalsConstantTime(token, configuredToken)) return null;
    return { companyId: getCurrentCompanyId() };
}
