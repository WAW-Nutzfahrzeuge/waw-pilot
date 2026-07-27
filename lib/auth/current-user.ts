import { redirect } from "next/navigation";

import { getCurrentCompanyId } from "@/lib/company";
import { normalizeUserRole, type UserRole } from "@/lib/auth/roles";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";

export async function getCurrentUserRole(): Promise<UserRole> {
    const supabase = await createAuthServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("auth_user_id", user.id)
        .eq("company_id", companyId)
        .maybeSingle();

    const role = normalizeUserRole(profile?.role);

    if (!role) {
        redirect("/login");
    }

    return role;
}
