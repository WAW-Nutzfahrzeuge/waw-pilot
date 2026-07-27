import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { BorderGlow } from "@/components/auth/border-glow";
import { DotGrid } from "@/components/auth/dot-grid";

type AuthShellProps = {
    title: string;
    description: string;
    children: React.ReactNode;
    footerText?: string;
    footerHref?: string;
    footerLinkLabel?: string;
};

export function AuthShell({
                              title,
                              description,
                              children,
                              footerText,
                              footerHref,
                              footerLinkLabel,
                          }: AuthShellProps) {
    return (
        <main className="relative min-h-screen overflow-hidden bg-[#0f172a] text-white">
            <div className="absolute inset-0">
                <DotGrid
                    dotSize={4}
                    gap={18}
                    baseColor="#1e5b70"
                    activeColor="#e0faff"
                    proximity={120}
                    shockRadius={240}
                    shockStrength={4}
                    resistance={700}
                    returnDuration={2}
                />
            </div>

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_20%_80%,rgba(192,132,252,0.18),transparent_32%),linear-gradient(to_bottom,rgba(15,23,42,0.18),rgba(15,23,42,0.78))]" />

            <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">

                    <BorderGlow
                        edgeSensitivity={24}
                        glowColor="190 90 70"
                        backgroundColor="#111827"
                        borderRadius={28}
                        glowRadius={44}
                        glowIntensity={1}
                        coneSpread={25}
                        animated
                        colors={["#22d3ee", "#a78bfa", "#f472b6"]}
                        fillOpacity={0.35}
                    >
                        <section className="rounded-[28px] border border-white/15 bg-slate-900/82 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-extrabold text-cyan-200">
                                        <ShieldCheck className="mr-1.5 size-3.5" />
                                        Sicherer Zugriff
                                    </div>

                                    <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white">
                                        {title}
                                    </h1>
                                    <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
                                        {description}
                                    </p>
                                </div>
                            </div>

                            {children}

                            {footerText && footerHref && footerLinkLabel ? (
                                <p className="mt-6 text-center text-sm font-semibold text-slate-300">
                                    {footerText}{" "}
                                    <Link
                                        href={footerHref}
                                        className="font-extrabold text-cyan-300 transition hover:text-cyan-200"
                                    >
                                        {footerLinkLabel}
                                    </Link>
                                </p>
                            ) : null}
                        </section>
                    </BorderGlow>

                    <p className="mt-6 text-center text-xs font-semibold text-slate-500">
                        © {new Date().getFullYear()} WAW Pilot · Interne Verwaltungssoftware
                    </p>
                </div>
            </div>
        </main>
    );
}
