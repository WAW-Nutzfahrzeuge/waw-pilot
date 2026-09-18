import { randomUUID } from "node:crypto";

import type { UserRole } from "@/lib/auth/roles";

export type AdminDeleteSubject = "sale" | "purchase" | "vehicle";

export type AdminDeleteActionState = {
    success: false;
    message: string | null;
};

export type VehicleDeleteDependencyCounts = {
    purchases: number;
    sales: number;
    invoices: number;
    cashbookEntries: number;
    financialEntries: number;
};

export type DocumentStorageReference = {
    filePath?: string | null;
    versionStoragePath?: string | null;
    zugferdFilePath?: string | null;
};

export class AdminDeleteForbiddenError extends Error {
    constructor() {
        super("Nur Admins dürfen Datensätze vollständig löschen.");
        this.name = "AdminDeleteForbiddenError";
    }
}

export function assertAdminCanDelete(role: UserRole): void {
    if (role !== "admin") {
        throw new AdminDeleteForbiddenError();
    }
}

export function createAdminDeleteOperationId(subject: AdminDeleteSubject): string {
    return `${subject}-${randomUUID()}`;
}

export function collectAdminDeleteStoragePaths(
    references: DocumentStorageReference[],
): string[] {
    return Array.from(
        new Set(
            references.flatMap((reference) => [
                reference.filePath,
                reference.versionStoragePath,
                reference.zugferdFilePath,
            ]).filter((filePath): filePath is string => Boolean(filePath)),
        ),
    );
}

export function getVehicleDeleteBlockers(
    counts: VehicleDeleteDependencyCounts,
): string[] {
    const blockers: string[] = [];

    if (counts.purchases > 0) {
        blockers.push(`${counts.purchases} Ankauf${counts.purchases === 1 ? "" : "e"}`);
    }

    if (counts.sales > 0) {
        blockers.push(`${counts.sales} ${counts.sales === 1 ? "Verkauf" : "Verkäufe"}`);
    }

    if (counts.invoices > 0) {
        blockers.push(`${counts.invoices} Rechnung${counts.invoices === 1 ? "" : "en"}`);
    }

    if (counts.cashbookEntries > 0) {
        blockers.push(
            `${counts.cashbookEntries} Kassenbuchbuchung${
                counts.cashbookEntries === 1 ? "" : "en"
            }`,
        );
    }

    if (counts.financialEntries > 0) {
        blockers.push(
            `${counts.financialEntries} Finanzbuchung${
                counts.financialEntries === 1 ? "" : "en"
            }`,
        );
    }

    return blockers;
}

export function getAdminDeleteErrorMessage(error: unknown): string {
    if (error instanceof AdminDeleteForbiddenError) {
        return error.message;
    }

    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return "Löschen konnte nicht abgeschlossen werden. Bitte prüfe die Abhängigkeiten.";
}

export const initialAdminDeleteActionState: AdminDeleteActionState = {
    success: false,
    message: null,
};
