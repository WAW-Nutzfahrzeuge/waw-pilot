"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { isUuid } from "@/lib/automation/validation";

async function requireAdmin() {
    const context = await getCurrentUserContext();
    if (context.profile.role !== "admin" || context.companyId !== getCurrentCompanyId()) {
        throw new Error("Keine Berechtigung für die Dokumentenzuordnung.");
    }
    return context;
}

export async function assignOwnerIdIntake(formData: FormData) {
    const context = await requireAdmin();
    const intakeId = String(formData.get("intakeId") ?? "");
    const saleId = String(formData.get("saleId") ?? "");
    if (!isUuid(intakeId) || !isUuid(saleId)) throw new Error("Bitte einen gültigen Fall und Verkauf auswählen.");
    const supabase = createAutomationSupabaseClient();
    const { data: intake, error: intakeError } = await supabase.from("automation_owner_id_intakes")
        .select("processing_status, status, derived_storage_bucket, derived_storage_path")
        .eq("id", intakeId).eq("company_id", context.companyId).maybeSingle();
    if (intakeError || !intake || intake.status !== "open" || !["ready", "error"].includes(intake.processing_status) || !intake.derived_storage_bucket || !intake.derived_storage_path) {
        throw new Error("Der offene Dokumentfall oder seine PDF ist nicht verfügbar.");
    }
    const { error: fileError } = await supabase.storage.from(intake.derived_storage_bucket).createSignedUrl(intake.derived_storage_path, 60);
    if (fileError) throw new Error("Die abgeleitete PDF ist im privaten Speicher nicht verfügbar.");
    const { data, error } = await supabase.rpc("assign_automation_owner_id_intake", {
        p_intake_id: intakeId, p_company_id: context.companyId, p_sale_id: saleId, p_actor_id: context.authUserId,
    });
    if (error) {
        console.error("owner_id_intake.assign_failed", { code: error.code });
        throw new Error("Der Ausweis konnte nicht sicher zugeordnet werden.");
    }
    const result = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null;
    if (!result || !["assigned", "already_assigned"].includes(result.outcome ?? "")) {
        throw new Error(result?.outcome === "document_unavailable"
            ? "Die abgeleitete Dokument-PDF fehlt. Bitte den Vorgang erneut verarbeiten, bevor du ihn zuordnest."
            : "Der Fall oder Verkauf ist nicht mehr zuordenbar. Bitte aktualisiere die Seite.");
    }
    revalidatePath("/dashboard/unassigned-documents");
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/sales/${saleId}`);
}

export async function ignoreOwnerIdIntake(formData: FormData) {
    const context = await requireAdmin();
    const intakeId = String(formData.get("intakeId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    if (!isUuid(intakeId)) throw new Error("Der Fall ist ungültig.");
    if (!reason || reason.length > 500) throw new Error("Bitte eine Begründung mit maximal 500 Zeichen angeben.");
    const supabase = createAutomationSupabaseClient();
    const { data, error } = await supabase.rpc("ignore_automation_owner_id_intake", {
        p_intake_id: intakeId, p_company_id: context.companyId, p_actor_id: context.authUserId, p_reason: reason,
    });
    if (error || !["ignored", "already_ignored"].includes(String(data))) {
        console.error("owner_id_intake.ignore_failed", { code: error?.code ?? null });
        throw new Error("Der Fall konnte nicht als irrelevant erledigt werden.");
    }
    revalidatePath("/dashboard/unassigned-documents");
    revalidatePath("/dashboard");
}
