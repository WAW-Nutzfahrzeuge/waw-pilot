export type AutomationOriginalFileType = "application/pdf" | "image/jpeg" | "image/png";

export function isPdf(bytes: Buffer): boolean {
    return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function detectAutomationOriginalFileType(bytes: Buffer): AutomationOriginalFileType | null {
    if (isPdf(bytes)) return "application/pdf";

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }

    if (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return "image/png";
    }

    return null;
}

export function mimeTypeMatchesOriginalFile(
    declaredMimeType: string,
    detectedMimeType: AutomationOriginalFileType,
): boolean {
    return declaredMimeType === "" ||
        declaredMimeType === "application/octet-stream" ||
        declaredMimeType === detectedMimeType ||
        (declaredMimeType === "image/jpg" && detectedMimeType === "image/jpeg");
}
