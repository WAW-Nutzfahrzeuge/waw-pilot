export const documentAcceptMimeTypes =
    "application/pdf,image/jpeg,image/png,image/webp";
export const vehicleDocumentAcceptMimeTypes = "application/pdf,image/jpeg,image/png";
export const imageAssetAcceptMimeTypes = "image/png,image/jpeg,image/webp";
export const termsPdfAcceptMimeTypes = "application/pdf";
export const maxImageAssetFileSizeBytes = 5 * 1024 * 1024;
export const maxTermsPdfFileSizeBytes = 10 * 1024 * 1024;
export const maxDocumentFileSizeBytes = 5 * 1024 * 1024;
export const maxBzstVerificationFileSizeBytes = 10 * 1024 * 1024;
export const maxPurchaseCreateUploadPayloadBytes = 3.5 * 1024 * 1024;

const allowedDocumentMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const allowedDocumentExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
const allowedVehicleDocumentMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
]);
const allowedVehicleDocumentExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);

export function isAllowedDocumentFile(file: Pick<File, "name" | "type">): boolean {
    if (file.type && allowedDocumentMimeTypes.has(file.type)) {
        return true;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    return extension ? allowedDocumentExtensions.has(extension) : false;
}

export function isAllowedVehicleDocumentFile(
    file: Pick<File, "name" | "type">,
): boolean {
    if (file.type && allowedVehicleDocumentMimeTypes.has(file.type)) {
        return true;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    return extension ? allowedVehicleDocumentExtensions.has(extension) : false;
}

export function isAllowedImageAssetFile(file: Pick<File, "name" | "type">): boolean {
    if (
        file.type &&
        (file.type === "image/png" ||
            file.type === "image/jpeg" ||
            file.type === "image/webp")
    ) {
        return true;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    return extension
        ? extension === "png" ||
              extension === "jpg" ||
              extension === "jpeg" ||
              extension === "webp"
        : false;
}

export function isAllowedTermsPdfFile(file: Pick<File, "name" | "type">): boolean {
    const extension = file.name.split(".").pop()?.toLowerCase();

    return file.type === "application/pdf" && extension === "pdf";
}

export function getUnsupportedDocumentTypeMessage(): string {
    return "Dieser Dateityp wird nicht unterstützt. Bitte wähle PDF, JPG, PNG oder WEBP.";
}

export function getDocumentTooLargeMessage(): string {
    return "Die Datei ist zu groß. Bitte wähle ein Dokument bis maximal 5 MB aus.";
}

export function getPurchaseCreateUploadTooLargeMessage(): string {
    return "Die Datei ist zu groß. Bitte wähle für den Ankauf Dokumente mit zusammen maximal 3,5 MB aus.";
}

export function getBzstVerificationTooLargeMessage(): string {
    return "Die Datei ist zu groß. Bitte wähle einen BZSt-Nachweis bis maximal 10 MB aus.";
}

export function getUnsupportedVehicleDocumentTypeMessage(): string {
    return "Dieser Dateityp wird nicht unterstützt. Bitte wähle PDF, JPG oder PNG.";
}

export function getUnsupportedImageAssetTypeMessage(): string {
    return "Dieser Dateityp wird nicht unterstützt. Bitte wähle PNG, JPG oder WEBP.";
}

export function getImageAssetTooLargeMessage(): string {
    return "Die Datei ist zu groß. Bitte wähle ein kleineres Bild bis 5 MB aus.";
}

export function getInvalidTermsPdfMessage(): string {
    return "Bitte lade eine gültige PDF-Datei mit maximal 10 MB hoch.";
}

export function getDocumentUploadFailedMessage(error: unknown): string {
    const message =
        error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message ?? "")
            : String(error ?? "");
    const normalizedMessage = message.toLowerCase();

    if (
        normalizedMessage.includes("too large") ||
        normalizedMessage.includes("file size") ||
        normalizedMessage.includes("payload") ||
        normalizedMessage.includes("maximum")
    ) {
        return "Die Datei ist zu groß. Bitte wähle eine kleinere Datei.";
    }

    if (
        normalizedMessage.includes("mime") ||
        normalizedMessage.includes("content type") ||
        normalizedMessage.includes("unsupported")
    ) {
        return getUnsupportedDocumentTypeMessage();
    }

    return "Dokument konnte nicht hochgeladen werden. Bitte versuche es erneut.";
}
