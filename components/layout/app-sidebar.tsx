"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import type { UserRole } from "@/lib/auth/roles";
import { getNavigationForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function isNavigationItemActive(pathname: string, href: string): boolean {
    if (href === "/dashboard") {
        return pathname === "/dashboard";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ role }: { role: UserRole }) {
    return (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/15 lg:flex lg:flex-col">
            <SidebarContent role={role} />
        </aside>
    );
}

export function SidebarContent({
    role,
    onNavigate,
}: {
    role: UserRole;
    onNavigate?: () => void;
}) {
    const pathname = usePathname();
    const navigation = getNavigationForRole(role);

    return (
        <>
            <Link
                href="/dashboard"
                onClick={onNavigate}
                className="relative flex min-h-24 items-center gap-3 overflow-hidden border-b border-white/10 px-5 transition hover:bg-white/[0.04]"
            >
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(8,145,178,0.28),rgba(15,23,42,0)_55%,rgba(16,185,129,0.12))]" />

                <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-300/20 bg-white shadow-lg shadow-cyan-950/40">
                    <Image
                        src="/software-logo.png"
                        alt="WAW Pilot Logo"
                        fill
                        className="object-contain p-1.5"
                        priority
                    />
                </div>

                <div className="relative min-w-0">
                    <p className="truncate text-sm font-black uppercase tracking-[0.28em] text-cyan-100">
                        WAW Pilot
                    </p>
                    <p className="truncate text-xs font-semibold text-slate-300">
                        Nutzfahrzeughandel
                    </p>
                </div>
            </Link>

            <div className="flex-1 overflow-y-auto px-3 py-5">
                <nav className="space-y-1.5">
                    {navigation.main.map((item) => {
                        const isActive = isNavigationItemActive(pathname, item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavigate}
                                className={cn(
                                    "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all duration-200",
                                    isActive
                                        ? "bg-white text-slate-950 shadow-lg shadow-cyan-950/25"
                                        : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                                )}
                            >
                                {isActive ? (
                                    <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-cyan-500" />
                                ) : null}

                                <item.icon
                                    className={cn(
                                        "size-4 transition-transform duration-200 group-hover:scale-110",
                                        isActive ? "text-cyan-700" : "text-slate-400",
                                    )}
                                />

                                {item.title}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-7 border-t border-white/10 pt-6">
                    <nav className="space-y-1.5">
                        {navigation.secondary.map((item) => {
                            const isActive = isNavigationItemActive(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onNavigate}
                                    className={cn(
                                        "group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all duration-200",
                                        isActive
                                            ? "bg-white text-slate-950 shadow-lg shadow-cyan-950/25"
                                            : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                                    )}
                                >
                                    {isActive ? (
                                        <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-cyan-500" />
                                    ) : null}

                                    <item.icon
                                        className={cn(
                                            "size-4 transition-transform duration-200 group-hover:scale-110",
                                            isActive ? "text-cyan-700" : "text-slate-400",
                                        )}
                                    />

                                    {item.title}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </div>

            <div className="border-t border-white/10 p-4">
                <a
                    href="/logout"
                    onClick={onNavigate}
                    className="group flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-extrabold text-slate-300 transition-all duration-200 hover:border-red-300/25 hover:bg-red-500/10 hover:text-red-100"
                >
                    <LogOut className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                    Abmelden
                </a>
            </div>
        </>
    );
}
