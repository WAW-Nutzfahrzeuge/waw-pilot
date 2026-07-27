import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
    canAccessDashboardPath,
    getDefaultDashboardPath,
    normalizeUserRole,
} from "@/lib/auth/roles";

function redirectWithSupabaseCookies(url: URL, response: NextResponse) {
    const redirectResponse = NextResponse.redirect(url);

    response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
}

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request,
    });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => {
                    request.cookies.set(name, value);
                });

                response = NextResponse.next({
                    request,
                });

                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            },
        },
    });

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    const isAuthPage = pathname === "/login";

    const isDashboardPage = pathname.startsWith("/dashboard");

    if (isDashboardPage && !user) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("redirectedFrom", pathname);

        return redirectWithSupabaseCookies(redirectUrl, response);
    }

    if (isAuthPage && user) {
        const companyId = process.env.NEXT_PUBLIC_WAW_COMPANY_ID;

        if (!companyId) {
            return response;
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("auth_user_id", user.id)
            .eq("company_id", companyId)
            .maybeSingle();

        const role = normalizeUserRole(profile?.role);

        if (!role) {
            await supabase.auth.signOut();

            return response;
        }

        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = getDefaultDashboardPath(role);
        redirectUrl.search = "";

        return redirectWithSupabaseCookies(redirectUrl, response);
    }

    if (isDashboardPage && user) {
        const companyId = process.env.NEXT_PUBLIC_WAW_COMPANY_ID;

        if (!companyId) {
            return response;
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("auth_user_id", user.id)
            .eq("company_id", companyId)
            .maybeSingle();

        const role = normalizeUserRole(profile?.role);

        if (!role) {
            await supabase.auth.signOut();

            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = "/login";
            redirectUrl.search = "";

            return redirectWithSupabaseCookies(redirectUrl, response);
        }

        if (!canAccessDashboardPath(role, pathname)) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = getDefaultDashboardPath(role);
            redirectUrl.search = "";

            return redirectWithSupabaseCookies(redirectUrl, response);
        }
    }

    return response;
}

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/login",
    ],
};
