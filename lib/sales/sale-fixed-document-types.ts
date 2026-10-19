export const saleIdentityDocumentType = "owner_id";
export const saleCommercialRegisterDocumentType = "commercial_register";

export function isSaleNonSignatureDocumentType(type: string | null | undefined): boolean {
    return type === saleIdentityDocumentType || type === saleCommercialRegisterDocumentType;
}
