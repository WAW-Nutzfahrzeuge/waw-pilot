package de.waw.zugferd.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.waw.zugferd.model.ValidationIssue;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

@Repository
public class SupabaseZugferdJobRepository {
    private static final String BUCKET = "documents";

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String supabaseUrl;
    private final String serviceRoleKey;

    public SupabaseZugferdJobRepository(
            ObjectMapper objectMapper,
            @Value("${zugferd.supabase-url:}") String supabaseUrl,
            @Value("${zugferd.supabase-service-role-key:}") String serviceRoleKey
    ) {
        this.objectMapper = objectMapper;
        this.supabaseUrl = supabaseUrl == null ? "" : supabaseUrl.trim().replaceAll("/+$", "");
        this.serviceRoleKey = serviceRoleKey == null ? "" : serviceRoleKey.trim();
        if (this.supabaseUrl.isBlank() || this.serviceRoleKey.isBlank()) {
            throw new IllegalStateException("Supabase-Zugang fuer die dauerhafte ZUGFeRD-Warteschlange fehlt.");
        }
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public DurableJob claimNext() throws IOException, InterruptedException {
        byte[] response = sendJson("/rest/v1/rpc/claim_zugferd_generation_job", Map.of());
        List<DurableJob> jobs = objectMapper.readValue(response, new TypeReference<>() {});
        return jobs.isEmpty() ? null : jobs.get(0);
    }

    public byte[] download(String storagePath) throws IOException, InterruptedException {
        HttpRequest request = authorizedRequest(storageUri(storagePath))
                .GET()
                .build();
        return send(request);
    }

    public void upload(String storagePath, byte[] bytes) throws IOException, InterruptedException {
        HttpRequest request = authorizedRequest(storageUri(storagePath))
                .header("Content-Type", "application/pdf")
                .header("x-upsert", "true")
                .POST(HttpRequest.BodyPublishers.ofByteArray(bytes))
                .build();
        send(request);
    }

    public void removeStorageFiles(List<String> storagePaths) throws IOException, InterruptedException {
        if (storagePaths == null || storagePaths.isEmpty()) return;
        byte[] json = objectMapper.writeValueAsBytes(Map.of("prefixes", storagePaths));
        HttpRequest request = authorizedRequest(URI.create(supabaseUrl + "/storage/v1/object/" + BUCKET))
                .header("Content-Type", "application/json")
                .method("DELETE", HttpRequest.BodyPublishers.ofByteArray(json))
                .build();
        send(request);
    }

    public void complete(String jobId, String resultStoragePath, Object resultMetadata)
            throws IOException, InterruptedException {
        boolean updated = objectMapper.readValue(
                sendJson("/rest/v1/rpc/complete_zugferd_generation_job", Map.of(
                        "p_job_id", jobId,
                        "p_result_storage_path", resultStoragePath,
                        "p_result_metadata", resultMetadata
                )),
                Boolean.class
        );
        if (!updated) throw new IOException("Durable ZUGFeRD job could not be finalized.");
    }

    public boolean fail(String jobId, String errorCode, String errorMessage, List<ValidationIssue> issues)
            throws IOException, InterruptedException {
        return objectMapper.readValue(
                sendJson("/rest/v1/rpc/fail_zugferd_generation_job", Map.of(
                "p_job_id", jobId,
                "p_error_code", errorCode,
                "p_error_message", errorMessage,
                "p_issues", issues == null ? List.of() : issues
                )),
                Boolean.class
        );
    }

    private byte[] sendJson(String path, Object body) throws IOException, InterruptedException {
        byte[] json = objectMapper.writeValueAsBytes(body);
        HttpRequest request = authorizedRequest(URI.create(supabaseUrl + path))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=representation")
                .POST(HttpRequest.BodyPublishers.ofByteArray(json))
                .build();
        return send(request);
    }

    private HttpRequest.Builder authorizedRequest(URI uri) {
        return HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(60))
                .header("apikey", serviceRoleKey)
                .header("Authorization", "Bearer " + serviceRoleKey);
    }

    private URI storageUri(String storagePath) {
        String encodedPath = java.util.Arrays.stream(storagePath.split("/"))
                .map(segment -> URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20"))
                .reduce((left, right) -> left + "/" + right)
                .orElse("");
        return URI.create(supabaseUrl + "/storage/v1/object/" + BUCKET + "/" + encodedPath);
    }

    private byte[] send(HttpRequest request) throws IOException, InterruptedException {
        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Supabase returned HTTP " + response.statusCode() + " for ZUGFeRD queue operation.");
        }
        return response.body();
    }

    public record DurableJob(
            String id,
            String company_id,
            String sale_id,
            String invoice_id,
            JsonNode request_data,
            String input_storage_path,
            Integer attempt_count
    ) {
    }
}
