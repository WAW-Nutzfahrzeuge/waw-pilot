export type CompanyBankDetails = {
    bankName: string | null;
    bankBlz: string | null;
    bankIban: string | null;
    bankBic: string | null;
    bankAccountHolder: string | null;
};

export function normalizeIban(value: string): string {
    return value.toUpperCase().replace(/\s+/g, "");
}

export function formatIban(value: string | null | undefined): string | null {
    const normalized = normalizeIban(value ?? "");

    if (!normalized) return null;

    return normalized.replace(/(.{4})/g, "$1 ").trim();
}

export function normalizeBic(value: string): string {
    return value.toUpperCase().replace(/\s+/g, "");
}

export function isValidIban(value: string): boolean {
    const normalized = normalizeIban(value);

    return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(normalized);
}

export function isValidBic(value: string): boolean {
    const normalized = normalizeBic(value);

    return normalized.length === 0 || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(normalized);
}
