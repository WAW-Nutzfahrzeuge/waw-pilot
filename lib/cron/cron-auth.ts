import "server-only";

import { timingSafeEqual } from "node:crypto";

function equalsConstantTime(actual: string, expected: string): boolean {
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/**
 * Authenticates a scheduled or manual request using a constant-time
 * comparison against CRON_SECRET, mirroring the Bearer-token pattern used for
 * automation requests in lib/automation/api-auth.ts. Callers must send this
 * value as `Authorization: Bearer <CRON_SECRET>`.
 */
export function authenticateCronRequest(request: Request): boolean {
    const configuredSecret = process.env.CRON_SECRET?.trim();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

    return Boolean(configuredSecret) && Boolean(token) && equalsConstantTime(token, configuredSecret!);
}
