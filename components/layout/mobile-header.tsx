"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";

import { SidebarContent } from "@/components/layout/app-sidebar";
import type { UserRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

export function MobileHeader({ role }: { role: UserRole }) {
    const [open, setOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        let lastScrollY = window.scrollY;

        function handleScroll() {
            const currentScrollY = window.scrollY;

            if (currentScrollY < 12) {
                setIsVisible(true);
                lastScrollY = currentScrollY;
                return;
            }

            setIsVisible(currentScrollY < lastScrollY);
            lastScrollY = currentScrollY;
        }

        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <header
            className={
                isVisible || open
                    ? "sticky top-0 z-50 translate-y-0 border-b border-slate-200/70 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/60 backdrop-blur-xl transition-transform duration-200 lg:hidden"
                    : "sticky top-0 z-50 -translate-y-full border-b border-slate-200/70 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/60 backdrop-blur-xl transition-transform duration-200 lg:hidden"
            }
        >
            <div className="flex items-center justify-between">
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-11 rounded-2xl border-slate-200 bg-white shadow-sm"
                            aria-label="Menü öffnen"
                        >
                            <Menu className="size-5" />
                        </Button>
                    </SheetTrigger>

                    <SheetContent
                        side="left"
                        className="w-[86vw] max-w-sm border-r border-slate-900 bg-slate-950 p-0 text-white"
                    >
                        <SheetTitle className="sr-only">Navigation</SheetTitle>
                        <div className="flex h-full flex-col">
                            <SidebarContent
                                role={role}
                                onNavigate={() => setOpen(false)}
                            />
                        </div>
                    </SheetContent>
                </Sheet>

                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 rounded-2xl px-1 py-1 transition hover:bg-cyan-50/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-100"
                    aria-label="Zum Dashboard"
                >
                    <Image
                        src="/software-logo.png"
                        alt="WAW Pilot"
                        width={40}
                        height={40}
                        className="order-2 h-10 w-10 rounded-full border border-slate-200 bg-white object-contain p-1.5 shadow-sm"
                        priority
                    />
                    <span className="leading-none">
                        <span className="block bg-gradient-to-r from-cyan-700 via-slate-950 to-emerald-700 bg-clip-text text-sm font-black uppercase tracking-[0.18em] text-transparent">
                            WAW
                        </span>
                        <span className="block text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-500">
                            Pilot
                        </span>
                    </span>
                </Link>
            </div>
        </header>
    );
}
