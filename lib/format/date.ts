export function formatDate(value: string | Date | null | undefined): string {
    return formatGermanDate(value);
}

export function formatGermanDate(value: string | Date | null | undefined): string {
    const date = parseDateValue(value);
    if (!date) return "-";

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

export function formatGermanDateTime(value: string | Date | null | undefined): string {
    const date = parseDateValue(value);
    if (!date) return "-";

    return new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatMonth(value: string | Date | null | undefined): string {
    const date = parseDateValue(value);
    if (!date) return "-";

    return new Intl.DateTimeFormat("de-DE", {
        month: "long",
        year: "numeric",
    }).format(date);
}

export function formatYear(value: string | Date | number | null | undefined): string {
    if (typeof value === "number") return String(value);

    const date = parseDateValue(value);
    if (!date) return "-";

    return new Intl.DateTimeFormat("de-DE", {
        year: "numeric",
    }).format(date);
}

export function relativeDate(value: string | Date | null | undefined, now: Date = new Date()): string {
    const date = parseDateValue(value);
    if (!date) return "-";

    const diffInMs = startOfDay(date).getTime() - startOfDay(now).getTime();
    const diffInDays = Math.round(diffInMs / 86_400_000);

    if (diffInDays === 0) return "Heute";
    if (diffInDays === 1) return "Morgen";
    if (diffInDays === -1) return "Gestern";
    if (diffInDays > 1 && diffInDays <= 7) return `In ${diffInDays} Tagen`;
    if (diffInDays < -1 && diffInDays >= -7) return `Vor ${Math.abs(diffInDays)} Tagen`;

    return formatGermanDate(date);
}

export function toDateOnlyString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function getTodayDateOnly(): string {
    return toDateOnlyString(new Date());
}

function parseDateValue(value: string | Date | null | undefined): Date | null {
    if (!value) return null;

    const date = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return null;

    return date;
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
