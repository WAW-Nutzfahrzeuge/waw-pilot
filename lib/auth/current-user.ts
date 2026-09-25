import { redirect } from "next/navigation";
import { cache } from "react";

import { getCurrentCompanyId } from "@/lib/company";
import { normalizeUserRole, type UserRole } from "@/lib/auth/roles";
import { isSessionIdleExpired, shouldRefreshLastSeen } from "@/lib/auth/session-policy";
import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";

export type CurrentUserContext = {
    authUserId: string;
    email: string | null;
    companyId: string;
    profile: {
        id: string;
        role: UserRole;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    };
};

const getCurrentUserContextResult = cache(async (): Promise<CurrentUserContext | null> => {
    const supabase = await createAuthServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return null;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, first_name, last_name, email, last_seen_at")
        .eq("auth_user_id", user.id)
        .eq("company_id", companyId)
        .maybeSingle();

    const role = normalizeUserRole(profile?.role);

    if (!profile || !role) {
        return null;
    }

    // Serverseitiges Inaktivitäts-Limit: unabhängig davon, ob der Refresh-Token
    // im Cookie clientseitig noch gültig ist, wird die Session hier zusätzlich
    // beendet, wenn der Nutzer zu lange inaktiv war. Das kann nicht durch
    // deaktiviertes JavaScript oder manipulierte Cookies umgangen werden.
    const lastSeenAt = (profile.last_seen_at as string | null) ?? null;

    if (isSessionIdleExpired(lastSeenAt)) {
        await supabase.auth.signOut();

        return null;
    }

    if (shouldRefreshLastSeen(lastSeenAt)) {
        await supabase
            .from("profiles")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", profile.id as string);
    }

    return {
        authUserId: user.id,
        email: user.email ?? null,
        companyId,
        profile: {
            id: profile.id as string,
            role,
            firstName: (profile.first_name as string | null) ?? null,
            lastName: (profile.last_name as string | null) ?? null,
            email: (profile.email as string | null) ?? null,
        },
    };
});

export async function getOptionalCurrentUserContext(): Promise<CurrentUserContext | null> {
    return getCurrentUserContextResult();
}

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
    const context = await getCurrentUserContextResult();

    if (!context) {
        redirect("/login");
    }

    return context;
}

export async function getCurrentUserRole(): Promise<UserRole> {
    const context = await getCurrentUserContext();

    return context.profile.role;
}

export async function getCurrentAuthUserId(): Promise<string> {
    const context = await getCurrentUserContext();

    return context.authUserId;
}

export async function getOptionalCurrentAuthUserId(): Promise<string | null> {
    const context = await getOptionalCurrentUserContext();

    return context?.authUserId ?? null;
}
