/**
 * Zentrale Session-/Idle-Timeout-Regeln.
 *
 * Supabase hält Refresh-Tokens standardmäßig sehr lange gültig und erneuert sie
 * bei jedem Request automatisch ("sliding session"). Ohne eigene Regel bleibt ein
 * Nutzer dadurch faktisch für immer eingeloggt. Diese Datei definiert daher ein
 * zusätzliches, serverseitig durchgesetztes Inaktivitäts-Limit auf Basis von
 * profiles.last_seen_at.
 */

export const SESSION_IDLE_TIMEOUT_MINUTES = 30;

const SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;

// Verhindert, dass last_seen_at bei jedem einzelnen Request neu geschrieben wird.
const LAST_SEEN_WRITE_THROTTLE_MS = 60 * 1000;

function parseTimestamp(value: string | null): number | null {
    if (!value) return null;

    const parsed = new Date(value).getTime();

    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Liefert true, wenn die Session serverseitig als abgelaufen gilt, weil seit
 * dem letzten bekannten Request mehr als SESSION_IDLE_TIMEOUT_MINUTES vergangen sind.
 * Fehlt last_seen_at (z. B. sehr alte/fehlerhafte Profile), gilt die Session
 * sicherheitshalber ebenfalls als abgelaufen.
 */
export function isSessionIdleExpired(lastSeenAt: string | null): boolean {
    const lastSeenMs = parseTimestamp(lastSeenAt);

    if (lastSeenMs === null) return true;

    return Date.now() - lastSeenMs > SESSION_IDLE_TIMEOUT_MS;
}

/** Liefert true, wenn last_seen_at aktualisiert werden sollte (Throttling). */
export function shouldRefreshLastSeen(lastSeenAt: string | null): boolean {
    const lastSeenMs = parseTimestamp(lastSeenAt);

    if (lastSeenMs === null) return true;

    return Date.now() - lastSeenMs > LAST_SEEN_WRITE_THROTTLE_MS;
}
