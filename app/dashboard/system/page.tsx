export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function SystemPage() {
    const supabase = createServerSupabaseClient();

    const { data: companies, error } = await supabase
        .from("companies")
        .select(
            "id, name, legal_name, email, invoice_sender_email, city, country, created_at",
        )
        .order("created_at", { ascending: false });

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.32em] text-cyan-700">
                    System
                </p>
                <h1 className="mt-2 text-3xl font-extrabold text-slate-950">
                    Supabase Verbindung
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-500">
                    Testseite, um zu prüfen, ob Daten aus Supabase geladen werden.
                </p>
            </div>

            {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                    Fehler: {error.message}
                </div>
            ) : (
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-xl font-extrabold text-slate-950">
                        Companies
                    </h2>

                    <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs font-semibold text-cyan-100">
            {JSON.stringify(companies, null, 2)}
          </pre>
                </div>
            )}
        </div>
    );
}
