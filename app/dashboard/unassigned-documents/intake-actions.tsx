"use client";

import { useMemo, useState, useTransition } from "react";
import { assignOwnerIdIntake, ignoreOwnerIdIntake } from "./actions";

type SaleOption = { id: string; label: string; searchText: string };
type IntakeActionsProps = { intakeId: string; sales: SaleOption[]; canAssign: boolean };

export function IntakeActions({ intakeId, sales, canAssign }: IntakeActionsProps) {
    const [query, setQuery] = useState("");
    const [saleId, setSaleId] = useState("");
    const [ignoreReason, setIgnoreReason] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const filteredSales = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase("de");
        return needle ? sales.filter((sale) => sale.searchText.toLocaleLowerCase("de").includes(needle)) : sales;
    }, [query, sales]);

    function assign() {
        const data = new FormData();
        data.set("intakeId", intakeId);
        data.set("saleId", saleId);
        setMessage("");
        startTransition(async () => {
            try {
                await assignOwnerIdIntake(data);
                setMessage("Dokument wurde dem Verkauf zugeordnet. Die manuelle Dokumentprüfung bleibt erforderlich.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Zuordnung fehlgeschlagen.");
            }
        });
    }

    function ignore() {
        const data = new FormData();
        data.set("intakeId", intakeId);
        data.set("reason", ignoreReason);
        setMessage("");
        startTransition(async () => {
            try {
                await ignoreOwnerIdIntake(data);
                setMessage("Fall wurde als irrelevant erledigt.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Aktion fehlgeschlagen.");
            }
        });
    }

    return (
        <div className="mt-5 grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2">
            <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-800" htmlFor={`search-${intakeId}`}>Verkaufsakte suchen und ausdrücklich auswählen</label>
                <input id={`search-${intakeId}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Verkaufsnummer, Kunde oder Fahrzeug" className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" />
                <select value={saleId} onChange={(event) => setSaleId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Zielverkauf">
                    <option value="">Verkauf auswählen …</option>
                    {filteredSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.label}</option>)}
                </select>
                <button type="button" disabled={!canAssign || !saleId || isPending} onClick={assign} className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {isPending ? "Bitte warten …" : "Diesem Verkauf zuordnen"}
                </button>
                {!canAssign && <p className="text-xs text-amber-800">Keine verarbeitbare PDF vorhanden; daher ist eine Zuordnung derzeit nicht möglich.</p>}
            </div>
            <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-800" htmlFor={`reason-${intakeId}`}>Als irrelevant erledigen</label>
                <textarea id={`reason-${intakeId}`} value={ignoreReason} onChange={(event) => setIgnoreReason(event.target.value)} maxLength={500} rows={2} placeholder="Begründung (erforderlich)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                <button type="button" disabled={!ignoreReason.trim() || isPending} onClick={ignore} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                    Als irrelevant erledigen
                </button>
            </div>
            {message && <p role="status" className="text-sm font-medium text-slate-700 lg:col-span-2">{message}</p>}
        </div>
    );
}
