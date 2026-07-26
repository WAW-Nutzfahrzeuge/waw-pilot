package de.waw.zugferd.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestSizeFilter extends OncePerRequestFilter {
    private final long maxRequestBytes;

    public RequestSizeFilter(@Value("${zugferd.max-upload-mb}") int maxUploadMb) {
        long maxPdfBytes = Math.max(1L, maxUploadMb) * 1024L * 1024L;
        this.maxRequestBytes = Math.round(maxPdfBytes * 1.5d) + 1024L * 1024L;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return !"/generate".equals(uri) && !"/validate".equals(uri);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        long contentLength = request.getContentLengthLong();

        if (contentLength > maxRequestBytes) {
            response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("""
                    {"error":{"code":"PAYLOAD_TOO_LARGE","message":"Die Anfrage ist zu groß."},"message":"Die Anfrage ist zu groß.","issues":[]}
                    """);
            return;
        }

        filterChain.doFilter(request, response);
    }
}
