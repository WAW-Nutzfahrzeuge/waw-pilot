export type MonthFilterValue = "current" | "all" | string;

export type MonthFilterDateRange = {
    from: string;
    to: string;
};

function toDateOnly(year: number, month: number, day: number): string {
    const paddedMonth = String(month).padStart(2, "0");
    const paddedDay = String(day).padStart(2, "0");

    return `${year}-${paddedMonth}-${paddedDay}`;
}

export function getCurrentMonthValue(date = new Date()): string {
    return String(date.getMonth() + 1);
}

export function normalizeMonthFilter(value: string | null | undefined): MonthFilterValue {
    if (!value || value === "current") return "current";
    if (value === "all") return "all";

    const month = Number(value);
    if (Number.isInteger(month) && month >= 1 && month <= 12) return String(month);

    return "current";
}

export function matchesMonthFilter(
    dateValue: string | Date | null | undefined,
    filter: MonthFilterValue,
    now = new Date(),
): boolean {
    if (filter === "all") return true;
    if (!dateValue) return false;

    const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
    if (Number.isNaN(date.getTime())) return false;

    const month = filter === "current" ? now.getMonth() + 1 : Number(filter);

    return date.getFullYear() === now.getFullYear() && date.getMonth() + 1 === month;
}

export function getMonthFilterDateRange(
    filter: MonthFilterValue,
    now = new Date(),
): MonthFilterDateRange | null {
    if (filter === "all") return null;

    const month = filter === "current" ? now.getMonth() + 1 : Number(filter);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    const year = now.getFullYear();
    const lastDayOfMonth = new Date(year, month, 0).getDate();

    return {
        from: toDateOnly(year, month, 1),
        to: toDateOnly(year, month, lastDayOfMonth),
    };
}

export function getMonthFilterOptions() {
    return [
        { value: "current", label: "Aktueller Monat" },
        { value: "all", label: "Alle" },
        { value: "1", label: "Januar" },
        { value: "2", label: "Februar" },
        { value: "3", label: "März" },
        { value: "4", label: "April" },
        { value: "5", label: "Mai" },
        { value: "6", label: "Juni" },
        { value: "7", label: "Juli" },
        { value: "8", label: "August" },
        { value: "9", label: "September" },
        { value: "10", label: "Oktober" },
        { value: "11", label: "November" },
        { value: "12", label: "Dezember" },
    ];
}
