package de.waw.zugferd.api;

import de.waw.zugferd.model.ErrorResponse;
import de.waw.zugferd.model.GenerateRequest;
import de.waw.zugferd.model.GenerateResponse;
import de.waw.zugferd.model.HealthResponse;
import de.waw.zugferd.model.ValidationIssue;
import de.waw.zugferd.model.ValidationResponse;
import de.waw.zugferd.service.ZugferdPipelineService;
import jakarta.validation.Valid;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ZugferdController {
    private static final Logger LOGGER = LoggerFactory.getLogger(ZugferdController.class);
    private final ZugferdPipelineService pipelineService;

    public ZugferdController(ZugferdPipelineService pipelineService) {
        this.pipelineService = pipelineService;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return pipelineService.health();
    }

    @PostMapping("/generate")
    public GenerateResponse generate(@Valid @RequestBody GenerateRequest request) throws Exception {
        return pipelineService.generate(request);
    }

    @PostMapping("/validate")
    public ValidationResponse validate(@Valid @RequestBody GenerateRequest request) throws Exception {
        return pipelineService.validateGeneratedResult(request);
    }

    @ExceptionHandler(ZugferdPipelineService.ValidationFailedException.class)
    public ResponseEntity<ValidationResponse> validationFailed(
            ZugferdPipelineService.ValidationFailedException exception
    ) {
        String code = getErrorCode(exception.issues());
        String message = getErrorMessage(code);
        HttpStatus status = "PAYLOAD_TOO_LARGE".equals(code)
                ? HttpStatus.PAYLOAD_TOO_LARGE
                : HttpStatus.UNPROCESSABLE_ENTITY;

        return ResponseEntity
                .status(status)
                .body(new ValidationResponse(
                        "invalid",
                        exception.issues(),
                        new ErrorResponse.ErrorBody(code, message),
                        message
                ));
    }

    @ExceptionHandler({
            MethodArgumentNotValidException.class,
            HttpMessageNotReadableException.class,
            IllegalArgumentException.class
    })
    public ResponseEntity<ErrorResponse> invalidRequest() {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of("INVALID_REQUEST", "Die Anfrage ist ungültig."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> generalError(Exception exception) {
        LOGGER.error("Unexpected ZUGFeRD service error", exception);

        ValidationIssue issue = new ValidationIssue(
                "FACTUR_X",
                "error",
                null,
                "ZUGFeRD-Service konnte die Rechnung nicht erstellen oder validieren.",
                null,
                true
        );

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.withIssues(
                        "INTERNAL_ERROR",
                        "ZUGFeRD-Service konnte die Rechnung nicht erstellen oder validieren.",
                        List.of(issue)
                ));
    }

    private static String getErrorCode(List<ValidationIssue> issues) {
        if (issues == null || issues.isEmpty()) return "VALIDATION_FAILED";

        String ruleId = issues.get(0).ruleId();

        if (ruleId == null) return "VALIDATION_FAILED";
        if (ruleId.contains("PDF_SIZE")) return "PAYLOAD_TOO_LARGE";
        if (ruleId.contains("PDFA_CONVERSION")) return "PDF_CONVERSION_FAILED";
        if (ruleId.contains("ZUGFERD_EMBED")) return "ZUGFERD_EMBEDDING_FAILED";
        if (ruleId.contains("VERAPDF")) return "PDFA_VALIDATION_FAILED";
        if (ruleId.contains("MUSTANG") || ruleId.startsWith("BR-")) return "EN16931_VALIDATION_FAILED";
        if (ruleId.contains("XML")) return "XML_GENERATION_FAILED";

        return "VALIDATION_FAILED";
    }

    private static String getErrorMessage(String code) {
        return switch (code) {
            case "PAYLOAD_TOO_LARGE" -> "Die Anfrage ist zu groß.";
            case "PDF_CONVERSION_FAILED" -> "Die PDF konnte nicht in PDF/A-3b konvertiert werden.";
            case "XML_GENERATION_FAILED" -> "Die XML-Rechnungsdaten konnten nicht erzeugt werden.";
            case "ZUGFERD_EMBEDDING_FAILED" -> "Die XML-Rechnungsdaten konnten nicht in die PDF eingebettet werden.";
            case "EN16931_VALIDATION_FAILED" -> "Die EN-16931-Validierung ist fehlgeschlagen.";
            case "PDFA_VALIDATION_FAILED" -> "Die PDF/A-Validierung ist fehlgeschlagen.";
            default -> "Die ZUGFeRD-Datei konnte nicht validiert werden.";
        };
    }
}
