package de.waw.zugferd.model;

import java.util.List;

public record GenerationJobStatus(
        String jobId,
        String status,
        GenerateResponse result,
        List<ValidationIssue> issues,
        String message
) {
}
