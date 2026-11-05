import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createAutomationSupabaseClient(options?: { requestTimeoutMs?: number }) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error("Supabase-Automatisierungszugang ist nicht konfiguriert.");
    }

    const requestTimeoutMs = options?.requestTimeoutMs;
    return createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(requestTimeoutMs ? {
            global: {
                fetch: (input: RequestInfo | URL, init?: RequestInit) => {
                    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
                    const signal = init?.signal
                        ? AbortSignal.any([init.signal, timeoutSignal])
                        : timeoutSignal;
                    return fetch(input, { ...(init ?? {}), signal });
                },
            },
        } : {}),
    });
}
