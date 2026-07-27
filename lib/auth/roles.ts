export type UserRole = "admin" | "employee";

export const USER_ROLES = ["admin", "employee"] as const;

export function normalizeUserRole(value: unknown): UserRole | null {
    return value === "admin" || value === "employee" ? value : null;
}

export function isEmployeeAllowedPath(pathname: string): boolean {
    return pathname === "/dashboard/plates" || pathname.startsWith("/dashboard/plates/");
}

export function canAccessDashboardPath(role: UserRole, pathname: string): boolean {
    if (role === "admin") return true;

    return isEmployeeAllowedPath(pathname);
}

export function getDefaultDashboardPath(role: UserRole): string {
    return role === "employee" ? "/dashboard/plates" : "/dashboard";
}
