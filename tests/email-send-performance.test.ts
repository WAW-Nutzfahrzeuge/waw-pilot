import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RESEND_REQUEST_TIMEOUT_MS } from "../lib/email/resend.ts";

const resendSource = readFileSync(
    new URL("../lib/email/resend.ts", import.meta.url),
    "utf8",
);
const sendEmailUseCaseSource = readFileSync(
    new URL(
        "../src/modules/email/application/use-cases/send-email.use-case.ts",
        import.meta.url,
    ),
    "utf8",
);

test("Resend-Anfragen brechen nach 20 Sekunden ab", () => {
    assert.equal(RESEND_REQUEST_TIMEOUT_MS, 20_000);
    assert.match(
        resendSource,
        /signal: AbortSignal\.timeout\(RESEND_REQUEST_TIMEOUT_MS\)/,
    );
});

test("unabhängige Versand-Nachbearbeitung läuft parallel", () => {
    assert.match(
        sendEmailUseCaseSource,
        /await Promise\.all\(\[\s*this\.repository\.createDeliveryAttempt\(/,
    );
    assert.match(sendEmailUseCaseSource, /this\.audit\.record\(/);
    assert.match(sendEmailUseCaseSource, /this\.activity\.record\(/);
});
