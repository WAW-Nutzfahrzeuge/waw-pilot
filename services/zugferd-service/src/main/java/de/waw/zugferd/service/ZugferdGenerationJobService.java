package de.waw.zugferd.service;

import de.waw.zugferd.model.GenerateRequest;
import de.waw.zugferd.model.GenerateResponse;
import de.waw.zugferd.model.GenerationJobAccepted;
import de.waw.zugferd.model.GenerationJobStatus;
import de.waw.zugferd.model.ValidationIssue;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Keeps expensive PDF/A and ZUGFeRD work off the request thread. Render runs
 * one generation at a time on purpose: the free instance has limited CPU and
 * parallel Ghostscript/VeraPDF processes make every invoice slower.
 */
@Service
public class ZugferdGenerationJobService {
    private static final Logger LOGGER = LoggerFactory.getLogger(ZugferdGenerationJobService.class);
    private static final Duration RETENTION = Duration.ofHours(6);

    private final ZugferdPipelineService pipelineService;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "zugferd-generation-worker");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();

    public ZugferdGenerationJobService(ZugferdPipelineService pipelineService) {
        this.pipelineService = pipelineService;
    }

    public GenerationJobAccepted submit(GenerateRequest request) {
        removeExpiredJobs();

        String jobId = UUID.randomUUID().toString();
        Job job = new Job(jobId);
        jobs.put(jobId, job);

        executor.submit(() -> run(job, request));

        return new GenerationJobAccepted(jobId, "pending");
    }

    public GenerationJobStatus getStatus(String jobId) {
        Job job = jobs.get(jobId);

        if (job == null) {
            return new GenerationJobStatus(
                    jobId,
                    "not_found",
                    null,
                    List.of(),
                    "Der ZUGFeRD-Hintergrundauftrag wurde auf dem Service nicht gefunden. Bitte erneut starten."
            );
        }

        return job.toResponse();
    }

    private void run(Job job, GenerateRequest request) {
        try {
            LOGGER.info("Starting ZUGFeRD generation job {}", job.id);
            job.complete(pipelineService.generate(request));
            LOGGER.info("Finished ZUGFeRD generation job {}", job.id);
        } catch (ZugferdPipelineService.ValidationFailedException exception) {
            job.fail(exception.issues(), "Die ZUGFeRD-Rechnung konnte nicht validiert werden.");
        } catch (Exception exception) {
            LOGGER.error("ZUGFeRD generation job {} failed", job.id, exception);
            job.fail(
                    List.of(new ValidationIssue(
                            "FACTUR_X",
                            "error",
                            "GENERATION_FAILED",
                            "ZUGFeRD-Service konnte die Rechnung nicht erstellen oder validieren.",
                            null,
                            true
                    )),
                    "ZUGFeRD-Service konnte die Rechnung nicht erstellen oder validieren."
            );
        }
    }

    private void removeExpiredJobs() {
        Instant cutoff = Instant.now().minus(RETENTION);
        jobs.entrySet().removeIf(entry -> entry.getValue().finishedAt != null && entry.getValue().finishedAt.isBefore(cutoff));
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    private static final class Job {
        private final String id;
        private volatile String status = "pending";
        private volatile GenerateResponse result;
        private volatile List<ValidationIssue> issues = List.of();
        private volatile String message;
        private volatile Instant finishedAt;

        private Job(String id) {
            this.id = id;
        }

        private synchronized void complete(GenerateResponse completedResult) {
            result = completedResult;
            status = "completed";
            finishedAt = Instant.now();
        }

        private synchronized void fail(List<ValidationIssue> failedIssues, String failedMessage) {
            issues = List.copyOf(failedIssues);
            message = failedMessage;
            status = "failed";
            finishedAt = Instant.now();
        }

        private GenerationJobStatus toResponse() {
            return new GenerationJobStatus(id, status, result, issues, message);
        }
    }
}
