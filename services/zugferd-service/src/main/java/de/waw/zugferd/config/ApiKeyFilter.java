package de.waw.zugferd.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ApiKeyFilter extends OncePerRequestFilter {
    private final String apiKey;
    private final byte[] expectedAuthorization;

    public ApiKeyFilter(@Value("${zugferd.api-key}") String apiKey) {
        this.apiKey = apiKey == null ? "" : apiKey.trim();

        if (this.apiKey.isBlank()) {
            throw new IllegalStateException("ZUGFERD_SERVICE_API_KEY must be configured.");
        }

        if (this.apiKey.length() < 24 || "local-zugferd-secret".equals(this.apiKey)) {
            throw new IllegalStateException("ZUGFERD_SERVICE_API_KEY is too weak.");
        }

        this.expectedAuthorization = ("Bearer " + this.apiKey).getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return "/health".equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);

        if (authorization == null || !constantTimeEquals(authorization)) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHORIZED", "Nicht autorisiert.");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean constantTimeEquals(String authorization) {
        byte[] provided = authorization.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expectedAuthorization, provided);
    }

    private static void writeError(
            HttpServletResponse response,
            int status,
            String code,
            String message
    ) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("""
                {"error":{"code":"%s","message":"%s"},"message":"%s","issues":[]}
                """.formatted(code, message, message));
    }
}
