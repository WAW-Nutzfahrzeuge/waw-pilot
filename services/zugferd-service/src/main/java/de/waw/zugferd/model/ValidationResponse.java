package de.waw.zugferd.model;

import java.util.List;

public record ValidationResponse(
        String status,
        List<ValidationIssue> issues,
        ErrorResponse.ErrorBody error,
        String message
) {
    public ValidationResponse(String status, List<ValidationIssue> issues) {
        this(status, issues, null, null);
    }
}
