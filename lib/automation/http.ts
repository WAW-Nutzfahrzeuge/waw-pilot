import { NextResponse } from "next/server";

export function automationError(status: number, code: string, message: string, details?: unknown) {
    return NextResponse.json(
        { error: { code, message, ...(details === undefined ? {} : { details }) } },
        { status },
    );
}

export function automationUnauthorized() {
    return new NextResponse(
        JSON.stringify({ error: { code: "unauthorized", message: "Automatisierungszugang ungültig." } }),
        {
            status: 401,
            headers: {
                "content-type": "application/json",
                "www-authenticate": 'Bearer realm="waw-automation"',
            },
        },
    );
}
