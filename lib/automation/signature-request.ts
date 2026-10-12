import { createHash, randomBytes } from "node:crypto";

export const signatureRequestDocumentTypes = [
    "entry_certificate",
    "transport_proof",
    "handover_protocol",
] as const;

export type SignatureRequestDocumentType = (typeof signatureRequestDocumentTypes)[number];

export function canonicalizeSignatureRequestDocumentTypes(
    values: SignatureRequestDocumentType[],
): SignatureRequestDocumentType[] {
    return [...new Set(values)].sort() as SignatureRequestDocumentType[];
}

export function getRemainingSignatureRequestDocumentTypes(params: {
    requested: SignatureRequestDocumentType[];
    required: readonly string[];
    fulfilled: ReadonlySet<string>;
}): SignatureRequestDocumentType[] {
    const required = new Set(params.required);
    return canonicalizeSignatureRequestDocumentTypes(params.requested).filter(
        (documentType) => required.has(documentType) && !params.fulfilled.has(documentType),
    );
}

export function createSignatureRequestFingerprint(params: {
    saleId: string;
    originalDocumentTypes: SignatureRequestDocumentType[];
}): string {
    return createHash("sha256")
        .update(params.saleId)
        .update("\0")
        .update(params.originalDocumentTypes.join(","))
        .digest("hex");
}

export function createSignatureRequestReservation() {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashSignatureRequestReservation(token);
    return { token, tokenHash };
}

export function hashSignatureRequestReservation(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

