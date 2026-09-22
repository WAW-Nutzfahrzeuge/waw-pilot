"use server";

import {
    executeFinancialBackfill,
    type BackfillExecutionResult,
} from "@/lib/accounting/financial-backfill";
import { syncCashbookEntryFinancialEntry } from "@/lib/accounting/financial-sync";
import { revalidatePaths } from "@/lib/actions/revalidation";
import { logActivity } from "@/lib/activity/activity-log";
import { getCurrentUserRole } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BackfillActionState =
    | { status: "idle" }
    | { status: "error"; message: string }
    | { status: "executed"; result: BackfillExecutionResult };

export type ForceSyncCashbookEntryState =
    | { status: "idle" }
    | { status: "error"; message: string }
    | { status: "success" };

export type DismissCashbookEntryState =
    | { status: "idle" }
    | { status: "error"; message: string }
    | { status: "success" };

async function assertAdmin(): Promise<void> {
    const role = await getCurrentUserRole();

    if (role !== "admin") {
        throw new Error("Nur Administratoren dürfen die Altdatenübernahme ausführen.");
    }
}

function revalidateCashbookPaths(): void {
    revalidatePaths([
        "/dashboard/cashbook",
        "/dashboard/cashbook/backfill",
        "/dashboard",
        "/dashboard/reports",
        "/dashboard/activities",
    ]);
}

export async function executeCashbookBackfillAction(
    _previousState: BackfillActionState,
): Promise<BackfillActionState> {
    void _previousState;

    try {
        await assertAdmin();
        const result = await executeFinancialBackfill();

        const totalSynced =
            result.syncedCounts.salePayments +
            result.syncedCounts.purchasePayments +
            result.syncedCounts.cashbookEntries +
            result.syncedCounts.saleRefunds;

        if (totalSynced > 0) {
            await logActivity({
                action: `Kassenbuch-Altdatenübernahme ausgeführt: ${totalSynced} Buchung(en) übernommen (${result.syncedCounts.salePayments} Verkaufszahlungen, ${result.syncedCounts.purchasePayments} Ankaufzahlungen, ${result.syncedCounts.cashbookEntries} manuelle Buchungen, ${result.syncedCounts.saleRefunds} Rückzahlungen)${
                    result.failures.length > 0
                        ? `, ${result.failures.length} fehlgeschlagen`
                        : ""
                }`,
                entityType: "cashbook",
                entityId: null,
            });
        }

        revalidateCashbookPaths();

        return { status: "executed", result };
    } catch (error) {
        return {
            status: "error",
            message:
                error instanceof Error
                    ? error.message
                    : "Übernahme konnte nicht durchgeführt werden.",
        };
    }
}

export async function forceSyncCashbookEntryAction(
    _previousState: ForceSyncCashbookEntryState,
    formData: FormData,
): Promise<ForceSyncCashbookEntryState> {
    try {
        await assertAdmin();

        const cashbookEntryId = String(formData.get("cashbook_entry_id") ?? "").trim();

        if (!cashbookEntryId) {
            throw new Error("Kassenbuch-Eintrag fehlt.");
        }

        const companyId = getCurrentCompanyId();

        await syncCashbookEntryFinancialEntry({ companyId, cashbookEntryId });

        await logActivity({
            action:
                "Kassenbuch-Eintrag nach manueller Admin-Prüfung als eigenständige Zahlung ins Finanzjournal übernommen (kein Duplikat).",
            entityType: "cashbook",
            entityId: cashbookEntryId,
        });

        revalidateCashbookPaths();

        return { status: "success" };
    } catch (error) {
        return {
            status: "error",
            message:
                error instanceof Error
                    ? error.message
                    : "Eintrag konnte nicht übernommen werden.",
        };
    }
}

export async function dismissCashbookEntryAsDuplicateAction(
    _previousState: DismissCashbookEntryState,
    formData: FormData,
): Promise<DismissCashbookEntryState> {
    try {
        await assertAdmin();

        const cashbookEntryId = String(formData.get("cashbook_entry_id") ?? "").trim();

        if (!cashbookEntryId) {
            throw new Error("Kassenbuch-Eintrag fehlt.");
        }

        const companyId = getCurrentCompanyId();
        const supabase = createServerSupabaseClient();

        // Vor dem Löschen die Details für das Aktivitätsprotokoll laden,
        // damit nach dem Löschen noch nachvollziehbar ist, welche Buchung
        // es war (Betrag, Datum, Referenz).
        const { data: entry, error: loadError } = await supabase
            .from("cashbook_entries")
            .select("amount, booking_date, description")
            .eq("id", cashbookEntryId)
            .eq("company_id", companyId)
            .maybeSingle();

        if (loadError) {
            throw new Error(`Eintrag konnte nicht geladen werden: ${loadError.message}`);
        }

        if (!entry) {
            throw new Error("Kassenbuch-Eintrag wurde nicht gefunden.");
        }

        // Bestätigtes Duplikat einer bereits erfassten Zahlung: der alte
        // Kassenbuch-Eintrag wird endgültig gelöscht, damit er weder in der
        // Altdatenübernahme erneut auftaucht noch versehentlich später doch
        // noch aufaddiert werden könnte. Er ist nirgendwo sonst in der
        // Anwendung sichtbar (nur Grundlage dieser Prüfung), daher ist die
        // Löschung hier – nach manueller Admin-Bestätigung im Einzelfall –
        // sicher.
        //
        // Wichtig: Supabase meldet ein DELETE, das durch Row-Level-Security
        // lautlos auf 0 Zeilen gefiltert wird, NICHT als Fehler. Deshalb hier
        // explizit die gelöschten Zeilen zurückfordern (.select) und prüfen –
        // sonst würde ein durch RLS blockiertes Löschen fälschlich als
        // Erfolg gemeldet, obwohl der Eintrag beim nächsten Laden wieder
        // auftaucht.
        const { data: deletedRows, error: deleteError } = await supabase
            .from("cashbook_entries")
            .delete()
            .eq("id", cashbookEntryId)
            .eq("company_id", companyId)
            .select("id");

        if (deleteError) {
            throw new Error(`Duplikat konnte nicht gelöscht werden: ${deleteError.message}`);
        }

        if (!deletedRows || deletedRows.length === 0) {
            throw new Error(
                "Der Eintrag wurde nicht gelöscht (0 Zeilen betroffen) – vermutlich fehlt eine Datenbankberechtigung (Row-Level-Security) für das Löschen von Kassenbuch-Einträgen. Bitte an einen Entwickler melden.",
            );
        }

        await logActivity({
            action: `Kassenbuch-Altdaten-Duplikat gelöscht (${formatCurrencyForLog(entry.amount)} vom ${entry.booking_date}${
                entry.description ? `, ${entry.description}` : ""
            }): entspricht bereits erfasster Zahlung, nach manueller Admin-Prüfung entfernt.`,
            entityType: "cashbook",
            entityId: cashbookEntryId,
        });

        revalidateCashbookPaths();

        return { status: "success" };
    } catch (error) {
        return {
            status: "error",
            message:
                error instanceof Error
                    ? error.message
                    : "Eintrag konnte nicht gelöscht werden.",
        };
    }
}

function formatCurrencyForLog(amount: number | string): string {
    const value = typeof amount === "string" ? Number(amount) : amount;
    return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
    }).format(Number.isFinite(value) ? value : 0);
}
