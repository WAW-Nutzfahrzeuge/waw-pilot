"use client";

import { useEffect, useRef } from "react";

import { SESSION_IDLE_TIMEOUT_MINUTES } from "@/lib/auth/session-policy";

const IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;

const ACTIVITY_EVENTS = [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
] as const;

/**
 * Meldet einen inaktiven Nutzer proaktiv ab, sobald für SESSION_IDLE_TIMEOUT_MINUTES
 * keine Nutzerinteraktion mehr stattgefunden hat. Dies ist eine reine UX-Verbesserung:
 * Die eigentliche, nicht umgehbare Durchsetzung des Limits erfolgt serverseitig in
 * lib/auth/current-user.ts anhand von profiles.last_seen_at.
 */
export function IdleLogoutWatcher() {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        function handleTimeout() {
            window.location.href = "/logout";
        }

        function resetTimer() {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(handleTimeout, IDLE_TIMEOUT_MS);
        }

        ACTIVITY_EVENTS.forEach((eventName) => {
            window.addEventListener(eventName, resetTimer, { passive: true });
        });

        resetTimer();

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            ACTIVITY_EVENTS.forEach((eventName) => {
                window.removeEventListener(eventName, resetTimer);
            });
        };
    }, []);

    return null;
}
