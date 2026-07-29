export function getStringFormValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

export function getDecimalFormValue(formData: FormData, key: string): number | null {
    const value = getStringFormValue(formData, key);

    if (!value) return null;

    const normalizedValue = value.replace(",", ".");
    const numberValue = Number(normalizedValue);

    return Number.isFinite(numberValue) ? numberValue : null;
}

export function getMoneyFormValue(formData: FormData, key: string): number | null {
    const value = getStringFormValue(formData, key);

    if (!value) return null;

    const normalizedValue = value.replace(/\./g, "").replace(",", ".");
    const amount = Number(normalizedValue);

    if (!Number.isFinite(amount)) return null;

    return Math.round(amount * 100) / 100;
}
