package de.waw.zugferd.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.waw.zugferd.model.CanonicalInvoice;
import de.waw.zugferd.model.GenerateRequest;
import de.waw.zugferd.model.GenerateResponse;
import de.waw.zugferd.model.ValidationIssue;
import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DurableZugferdJobWorker {
    private static final Logger LOGGER = LoggerFactory.getLogger(DurableZugferdJobWorker.class);

    private final SupabaseZugferdJobRepository repository;
    private final ZugferdPipelineService pipelineService;
    private final ObjectMapper objectMapper;

    public DurableZugferdJobWorker(
            SupabaseZugferdJobRepository repository,
            ZugferdPipelineService pipelineService,
            ObjectMapper objectMapper
    ) {
        this.repository = repository;
        this.pipelineService = pipelineService;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${zugferd.queue-poll-ms:1500}")
    public void pollAndProcessOne() {
        SupabaseZugferdJobRepository.DurableJob job;
        try {
            job = repository.claimNext();
        } catch (Exception error) {
            LOGGER.error("Could not claim a durable ZUGFeRD job ({})", error.getClass().getSimpleName());
            return;
        }
        if (job == null) return;

        process(job);
    }

    private void process(SupabaseZugferdJobRepository.DurableJob job) {
        try {
            LOGGER.info("Starting durable ZUGFeRD job {} (attempt {})", job.id(), job.attempt_count());
            JsonNode data = job.request_data();
            CanonicalInvoice invoice = objectMapper.treeToValue(data.get("invoice"), CanonicalInvoice.class);
            byte[] visiblePdf = repository.download(job.input_storage_path());

            GenerateRequest request = new GenerateRequest(
                    data.path("standardVersion").asText(),
                    data.path("profile").asText(),
                    data.path("invoiceProfile").asText(),
                    invoice,
                    Base64.getEncoder().encodeToString(visiblePdf)
            );
            GenerateResponse result = pipelineService.generate(request, job.id());
            byte[] resultPdf = Base64.getDecoder().decode(result.pdfBase64());
            String resultStoragePath = "companies/" + job.company_id()
                    + "/invoices/" + job.invoice_id()
                    + "/zugferd/jobs/" + job.id() + "/result.pdf";
            repository.upload(resultStoragePath, resultPdf);
            repository.complete(job.id(), resultStoragePath, Map.of(
                    "fileName", result.fileName(),
                    "sha256", result.sha256(),
                    "standardVersion", result.standardVersion(),
                    "profile", result.profile(),
                    "validation", result.validation()
            ));
            LOGGER.info("Finished durable ZUGFeRD job {}", job.id());
        } catch (ZugferdPipelineService.ValidationFailedException error) {
            fail(job, "VALIDATION_FAILED", "Die ZUGFeRD-Rechnung konnte nicht validiert werden.", error.issues());
        } catch (Exception error) {
            LOGGER.error(
                    "Durable ZUGFeRD job {} failed ({})",
                    job.id(),
                    error.getClass().getSimpleName()
            );
            fail(
                    job,
                    "GENERATION_FAILED",
                    "Der ZUGFeRD-Auftrag konnte nicht vollständig verarbeitet werden. Bitte versuche es erneut.",
                    List.of(new ValidationIssue(
                            "FACTUR_X",
                            "error",
                            "GENERATION_FAILED",
                            "Der ZUGFeRD-Auftrag konnte nicht vollständig verarbeitet werden.",
                            null,
                            true
                    ))
            );
        }
    }

    private void fail(
            SupabaseZugferdJobRepository.DurableJob job,
            String code,
            String message,
            List<ValidationIssue> issues
    ) {
        try {
            boolean persisted = repository.fail(job.id(), code, message, issues);
            if (persisted) {
                repository.removeStorageFiles(List.of(
                        job.input_storage_path(),
                        "companies/" + job.company_id()
                                + "/invoices/" + job.invoice_id()
                                + "/zugferd/jobs/" + job.id() + "/result.pdf"
                ));
            }
            LOGGER.warn("Durable ZUGFeRD job {} finished as failed ({})", job.id(), code);
        } catch (IOException | InterruptedException error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            LOGGER.error("Could not persist failed status for ZUGFeRD job {} ({})", job.id(), error.getClass().getSimpleName());
        }
    }
}
