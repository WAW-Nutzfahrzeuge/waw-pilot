"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { isUuid } from "@/lib/automation/validation";

type ReviewOutcome = {
    outcome: string;
    review_status: string | null;
    signature_status: string | null;
};

function requiredString(formData: FormData, name: string): string {
    const value = formData.get(name);
    if (typeof value !== "string" || !value.trim()) throw new Error(`${name} fehlt.`);
    return value.trim();
}

export async function reviewAutomationReturnAction(formData: FormData) {
    const userContext = await getCurrentUserContext();
    if (userContext.profile.role !== "admin") {
        throw new Error("Du bist nicht berechtigt, automatisierte Rückläufe zu prüfen.");
    }

    const companyId = getCurrentCompanyId();
    if (userContext.companyId !== companyId) throw new Error("Unternehmenszuordnung ist ungültig.");

    const saleId = requiredString(formData, "sale_id");
    const documentId = requiredString(formData, "document_id");
    const documentVersionId = requiredString(formData, "document_version_id");
    const decision = requiredString(formData, "decision");
    if (![saleId, documentId, documentVersionId].every(isUuid)) {
        throw new Error("Dokument- oder Verkaufs-ID ist ungültig.");
    }
    if (decision !== "accepted" && decision !== "rejected") {
        throw new Error("Prüfentscheidung ist ungültig.");
    }

    const reasonValue = formData.get("reason");
    const reason = typeof reasonValue === "string" ? reasonValue.trim() : "";
    if (reason.length > 500) throw new Error("Der Prüfgrund darf maximal 500 Zeichen enthalten.");
    if (decision === "rejected" && !reason) throw new Error("Bitte gib einen kurzen Ablehnungsgrund an.");
    if (decision === "accepted" && formData.get("review_confirmation") !== "confirmed") {
        throw new Error("Bitte bestätige zuerst die manuelle Prüfung und die sichtbare erforderliche Unterschrift.");
    }

    const supabase = createAutomationSupabaseClient();
    const { data, error } = await supabase.rpc("review_automation_return_document", {
        p_company_id: companyId,
        p_sale_id: saleId,
        p_document_id: documentId,
        p_document_version_id: documentVersionId,
        p_reviewer_id: userContext.authUserId,
        p_decision: decision,
        p_reason: decision === "rejected" ? reason : null,
    });
    if (error) {
        console.error("automation.return_review.write_failed", { databaseCode: error.code });
        throw new Error("Die Prüfentscheidung konnte nicht gespeichert werden.");
    }

    const result = (data as ReviewOutcome[] | null)?.[0];
    if (!result) throw new Error("Die Prüfentscheidung konnte nicht gespeichert werden.");
    if (result.outcome === "not_found" || result.outcome === "upload_not_found") {
        throw new Error("Der automatisierte Rücklauf wurde nicht gefunden.");
    }
    if (result.outcome === "inactive_version") {
        throw new Error("Diese Dokumentversion ist nicht mehr aktiv. Bitte lade die Verkaufsakte neu.");
    }
    if (result.outcome === "already_reviewed") {
        throw new Error("Der Rücklauf wurde inzwischen bereits geprüft. Bitte lade die Verkaufsakte neu.");
    }

    revalidatePaths([
        `/dashboard/sales/${saleId}`,
        "/dashboard/sales",
        "/dashboard/documents",
    ]);
    redirect(`/dashboard/sales/${saleId}?returnReviewed=${result.review_status}#automatic-documents`);
}
