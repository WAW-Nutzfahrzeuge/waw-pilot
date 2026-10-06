export type StampRequirementSaleType = "inland" | "eu" | "export_third_country";
export type StampRequirementKey = "transport_proof" | "entry_certificate" | "handover_protocol" | "end_use_declaration";

const KEYS_BY_SALE_TYPE: Record<StampRequirementSaleType, readonly StampRequirementKey[]> = {
    inland: ["handover_protocol"],
    eu: ["entry_certificate", "transport_proof", "handover_protocol"],
    export_third_country: [],
};

export function getStampDocumentKeysForSaleRule(
    saleType: StampRequirementSaleType,
    thirdCountryRequiresEndUseDeclaration = false,
): readonly StampRequirementKey[] {
    if (saleType === "export_third_country" && thirdCountryRequiresEndUseDeclaration) {
        return ["end_use_declaration"];
    }

    return KEYS_BY_SALE_TYPE[saleType];
}
