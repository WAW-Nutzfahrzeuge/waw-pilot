import type {
    GeneratedDocumentDefinition,
    GeneratedDocumentStatus,
} from "@/lib/pdf/generated-documents/document-types";
import type { GeneratedDocumentValidationResult } from "@/lib/pdf/generated-documents/document-validation";

export function getGeneratedDocumentStatus(params: {
    definition: GeneratedDocumentDefinition;
    validation: GeneratedDocumentValidationResult;
    documentExists: boolean;
    signedDocumentExists?: boolean;
    returnNeedsReview?: boolean;
    sentToCustomer?: boolean;
}): GeneratedDocumentStatus {
    if (!params.validation.canGenerate) {
        return "missing_data";
    }

    if (params.signedDocumentExists) {
        return "signed_received";
    }

    if (params.returnNeedsReview) {
        return "return_needs_review";
    }

    if (!params.documentExists) {
        return "can_generate";
    }

    if (!params.definition.requiresSignature) {
        return "generated_available";
    }

    if (params.sentToCustomer) {
        return "sent_to_customer";
    }

    return "generated_needs_signature";
}

export function getGeneratedDocumentStatusLabel(
    status: GeneratedDocumentStatus,
): string {
    const labels: Record<GeneratedDocumentStatus, string> = {
        missing_data: "Daten fehlen",
        can_generate: "Kann erzeugt werden",
        generated_needs_signature: "Unterschrift fehlt",
        generated_available: "Erzeugt",
        sent_to_customer: "An Kunden gesendet",
        return_needs_review: "Rücklauf eingegangen – Prüfung erforderlich",
        signed_received: "Unterschrift vorhanden",
        external_process: "Über anderen Bereich",
        generator_planned: "Generator folgt",
        not_relevant: "Nicht relevant",
    };

    return labels[status];
}

export function getGeneratedDocumentStatusTone(
    status: GeneratedDocumentStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
    if (status === "signed_received" || status === "generated_available") {
        return "success";
    }

    if (status === "missing_data") {
        return "danger";
    }

    if (
        status === "sent_to_customer" ||
        status === "return_needs_review" ||
        status === "external_process" ||
        status === "generator_planned"
    ) {
        return "info";
    }

    if (status === "not_relevant") {
        return "neutral";
    }

    return "warning";
}
