package de.waw.zugferd.model;

public record HealthResponse(
        String status,
        boolean ghostscriptAvailable,
        boolean veraPdfAvailable,
        boolean supabaseReachable
) {
}
