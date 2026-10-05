import assert from "node:assert/strict";
import test from "node:test";

import {
    isSessionIdleExpired,
    SESSION_IDLE_TIMEOUT_MINUTES,
} from "../lib/auth/session-policy.ts";

test("session idle timeout is centrally configured to seven hours", () => {
    assert.equal(SESSION_IDLE_TIMEOUT_MINUTES, 420);
});

test("session stays active immediately before the seven-hour idle limit", () => {
    const originalNow = Date.now;
    Date.now = () => new Date("2026-10-05T12:00:00.000Z").getTime();

    try {
        assert.equal(
            isSessionIdleExpired("2026-10-05T05:00:00.001Z"),
            false,
        );
    } finally {
        Date.now = originalNow;
    }
});

test("session expires after more than seven hours without server activity", () => {
    const originalNow = Date.now;
    Date.now = () => new Date("2026-10-05T12:00:00.000Z").getTime();

    try {
        assert.equal(
            isSessionIdleExpired("2026-10-05T04:59:59.999Z"),
            true,
        );
    } finally {
        Date.now = originalNow;
    }
});
