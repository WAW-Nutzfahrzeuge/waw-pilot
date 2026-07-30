import "server-only";

import { getOptionalCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type LogActivityParams = {
    action: string;
    entityType?: string;
    entityId?: string | null;
};

function getFallbackUserName(email: string | null | undefined): string {
    if (!email) return "Unbekannter Benutzer";

    return email;
}

export async function logActivity({
                                      action,
                                      entityType,
                                      entityId,
                                  }: LogActivityParams): Promise<void> {
    try {
        const dbSupabase = createServerSupabaseClient();
        const companyId = getCurrentCompanyId();
        const userContext = await getOptionalCurrentUserContext();
        const authUserId = userContext?.authUserId ?? null;
        const fallbackUserName = getFallbackUserName(userContext?.email);
        const profile = userContext?.profile;
        const fullName = [profile?.firstName, profile?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        const userName = fullName || profile?.email || fallbackUserName;

        const { error } = await dbSupabase.from("activity_logs").insert({
            company_id: companyId,
            auth_user_id: authUserId,
            user_name: userName,
            action,
            entity_type: entityType ?? null,
            entity_id: entityId ?? null,
        });

        if (error) {
            console.error("Activity log konnte nicht gespeichert werden:", error.message);
        }
    } catch (error) {
        console.error("Activity log Fehler:", error);
    }
}
