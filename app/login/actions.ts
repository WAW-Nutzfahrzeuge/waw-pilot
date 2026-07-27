"use server";

import { redirect } from "next/navigation";

import {
    canAccessDashboardPath,
    getDefaultDashboardPath,
    normalizeUserRole,
} from "@/lib/auth/roles";
import { getCurrentCompanyId } from "@/lib/company";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";

type LoginState = {
    success: boolean;
    message: string;
};

function getStringValue(formData: FormData, key: string): string {
    const value = formData.get(key);

    if (typeof value !== "string") return "";

    return value.trim();
}

function getSafeRedirectPath(path: string) {
    if (!path.startsWith("/") || path.startsWith("//")) {
        return "/dashboard";
    }

    return path;
}

export async function loginAction(
    _previousState: LoginState,
    formData: FormData,
): Promise<LoginState> {
    const supabase = await createAuthServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const email = getStringValue(formData, "email");
    const password = getStringValue(formData, "password");
    const redirectedFrom = getStringValue(formData, "redirected_from");

    if (!email) {
        return {
            success: false,
            message: "Bitte gib deine E-Mail-Adresse ein.",
        };
    }

    if (!password) {
        return {
            success: false,
            message: "Bitte gib dein Passwort ein.",
        };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return {
            success: false,
            message: `Login fehlgeschlagen: ${error.message}`,
        };
    }

    if (data.user) {
        const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id, role")
            .eq("auth_user_id", data.user.id)
            .eq("company_id", companyId)
            .maybeSingle();

        const role = normalizeUserRole(existingProfile?.role);

        if (!existingProfile || !role) {
            await supabase.auth.signOut();

            return {
                success: false,
                message: "Für diesen Benutzer ist kein freigeschaltetes Profil vorhanden.",
            };
        }

        await supabase
            .from("profiles")
            .update({
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", existingProfile.id);

        const safeRedirectPath = getSafeRedirectPath(redirectedFrom || getDefaultDashboardPath(role));

        redirect(
            canAccessDashboardPath(role, safeRedirectPath)
                ? safeRedirectPath
                : getDefaultDashboardPath(role),
        );
    }

    redirect("/dashboard");
}
