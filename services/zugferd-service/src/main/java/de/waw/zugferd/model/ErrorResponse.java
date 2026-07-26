package de.waw.zugferd.model;

import java.util.List;

public record ErrorResponse(
        ErrorBody error,
        String message,
        List<ValidationIssue> issues
) {
    public static ErrorResponse of(String code, String message) {
        return new ErrorResponse(new ErrorBody(code, message), message, List.of());
    }

    public static ErrorResponse withIssues(
            String code,
            String message,
            List<ValidationIssue> issues
    ) {
        return new ErrorResponse(
                new ErrorBody(code, message),
                message,
                issues == null ? List.of() : issues
        );
    }

    public record ErrorBody(String code, String message) {
    }
}
