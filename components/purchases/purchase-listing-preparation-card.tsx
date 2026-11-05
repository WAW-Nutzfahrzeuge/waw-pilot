"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, ChevronDown, ChevronUp, FileCheck2, LoaderCircle, Save, Sparkles } from "lucide-react";

import { confirmPurchaseListingSuggestions, startPurchaseListingPreparation, savePurchaseListingDraft } from "@/app/dashboard/ankauf/[purchaseId]/listing-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PurchaseListingJob } from "@/lib/purchases/purchase-detail-queries";

type Props = {
    purchaseId: string;
    purchaseLabel: string;
    hasRegistration: boolean;
    oneDriveReady: boolean;
    jobs: PurchaseListingJob[];
};

const legacySuggestionFields = [
    ["manufacturer", "Hersteller"], ["model", "Modell"], ["vehicleType", "Aufbau"], ["vin", "FIN"],
    ["firstRegistration", "Erstzulassung"], ["constructionYear", "Baujahr"], ["mileage", "Kilometerstand"], ["color", "Farbe"],
] as const;
const technicalSuggestionFields = [
    ["manufacturer", "Hersteller"], ["model", "Modell"], ["vin", "FIN"],
    ["firstRegistration", "Erstzulassung"], ["constructionYear", "Baujahr"], ["enginePowerKw", "Motorleistung (kW)"],
    ["transmission", "Getriebe"], ["emissionClass", "Schadstoffklasse"], ["axleFormula", "Achsformel"],
    ["frontSuspension", "Federung vorne"], ["rearSuspension", "Federung hinten"],
    ["grossVehicleWeightKg", "Zulässiges Gesamtgewicht (kg)"], ["curbWeightKg", "Leergewicht (kg)"],
    ["payloadKg", "Nutzlast (kg)"], ["wheelbaseMm", "Radstand (mm)"], ["huUntil", "HU bis"],
    ["spUntil", "SP bis"], ["color", "Farbe"],
] as const;
const statusLabels: Record<string, string> = {
    queued: "Wartet auf n8n", processing: "Wird vorbereitet", needs_input: "Prüfung erforderlich",
    draft_ready: "Vorschau bereit", failed: "Vorbereitung fehlgeschlagen",
};
const openPointLabels: Record<string, string> = {
    mileage: "Kilometerstand prüfen", condition: "Zustand und bekannte Mängel prüfen",
    equipment: "Ausstattung und Besonderheiten prüfen", inspection: "Besichtigung und Kontakt ergänzen",
    photos: "Fahrzeugfotos in OneDrive hochladen",
    location: "Fahrzeugstandort und Verfügbarkeit bestätigen", vehicleIdentity: "Fahrzeugidentität prüfen",
    technicalData: "Technische Fahrzeugdaten prüfen", bodyDetails: "Aufbauangaben prüfen",
    maintenanceHistory: "Wartungs- und Reparaturhistorie ergänzen",
};

export function PurchaseListingPreparationCard({ purchaseId, purchaseLabel, hasRegistration, oneDriveReady, jobs }: Props) {
    const router = useRouter();
    const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id ?? "");
    const job = jobs.find((item) => item.id === selectedJobId) ?? jobs[0] ?? null;
    const [message, setMessage] = useState("");
    const [isStarting, startTransition] = useTransition();
    const [now, setNow] = useState(0);
    const hasOpenItems = Boolean(job && ((job.missing_fields?.length ?? 0) > 0 || (job.conflicts?.length ?? 0) > 0));
    const active = job?.status === "queued" || job?.status === "processing";
    const leaseExpired = job?.status === "processing" && Boolean(job.lease_expires_at) && Date.parse(job.lease_expires_at!) <= now;

    useEffect(() => {
        if (!active || leaseExpired) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = () => {
            if (cancelled) return;
            setNow(Date.now());
            router.refresh();
            timer = setTimeout(poll, 4000);
        };
        timer = setTimeout(poll, 4000);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [active, leaseExpired, router, job?.id]);

    function prepareAgain() {
        setMessage("");
        startTransition(async () => {
            const result = await startPurchaseListingPreparation(purchaseId);
            setMessage(result.message);
            if (result.job?.id) setSelectedJobId(result.job.id);
            router.refresh();
        });
    }

    const hasPreviousDraft = Boolean(job && ["draft_ready", "needs_input"].includes(job.status));

    return (
        <Card id="listing-preparation" className="scroll-mt-24 rounded-3xl border-cyan-100 bg-white/95 shadow-sm">
            <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700"><Sparkles className="size-5" /></div>
                        <div>
                            <h2 className="font-extrabold text-slate-950">Inserat</h2>
                            <p className="mt-1 text-sm text-slate-600">Entwurf aus bestätigten Fahrzeugdaten, Fahrzeugschein und OneDrive-Fahrzeugfotos vorbereiten.</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">{purchaseLabel} · Vorbereitung erstellt keine Veröffentlichung bei mobile.de.</p>
                        </div>
                    </div>
                    {job ? <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${job.status === "draft_ready" && !hasOpenItems ? "bg-emerald-50 text-emerald-800" : job.status === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{job.status === "draft_ready" && hasOpenItems ? "Vorschau · offene Punkte" : statusLabels[job.status]}</span> : null}
                </div>

                {!hasRegistration || !oneDriveReady ? (
                    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                        {!hasRegistration ? <p>Für die Vorbereitung wird ein abrufbarer Fahrzeugschein in der Einkaufsakte benötigt.</p> : null}
                        {!oneDriveReady ? <p>Bitte lege zuerst im Bereich <a className="font-bold underline" href="#vehicle-onedrive-folder">OneDrive-Fahrzeugakte</a> den Fahrzeugbilder-Ordner an oder prüfe die vorhandene Zuordnung.</p> : null}
                    </div>
                ) : null}

                {jobs.length > 1 ? (
                    <label className="block max-w-md text-sm font-bold text-slate-700">Gespeicherte Entwürfe und Aufträge
                        <select value={job?.id ?? ""} onChange={(event) => setSelectedJobId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-medium">
                            {jobs.map((item, index) => <option key={item.id} value={item.id}>{index === 0 ? "Aktuell · " : "Vorherig · "}{statusLabels[item.status]} · {new Date(item.updated_at).toLocaleString("de-DE")}</option>)}
                        </select>
                    </label>
                ) : null}

                {job && active ? (
                    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-sm font-semibold text-cyan-950"><LoaderCircle className="size-4 animate-spin" />{leaseExpired ? "Die Bearbeitungsfrist ist abgelaufen. Der Auftrag kann mit derselben ID wieder aufgenommen werden." : job.status === "queued" ? "Der Auftrag wartet auf die n8n-Annahme." : "n8n verarbeitet Fahrzeugschein und Fahrzeugbilder. Dieser Vorgang kann einige Minuten dauern."}</p>
                        {leaseExpired ? <Button type="button" onClick={prepareAgain} disabled={isStarting} variant="outline" className="rounded-xl font-bold">Auftrag erneut senden</Button> : null}
                    </div>
                ) : null}

                {job?.status === "failed" ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-red-700">Letzter gespeicherter Auftragsfehler</span>{job.last_error ?? "Die Inseratsvorbereitung ist fehlgeschlagen."}</div> : null}

                {job && (job.status === "needs_input" || job.status === "draft_ready") ? (
                    <ListingDraftEditor
                        key={`${job.id}:${job.status}:${job.manual_revision}`}
                        job={job}
                        purchaseId={purchaseId}
                        onMessage={setMessage}
                        onSaved={() => router.refresh()}
                    />
                ) : null}

                {message ? <p role="status" className="text-sm font-semibold text-slate-700">{message}</p> : null}
                {(!active || leaseExpired) ? <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                    <Button type="button" onClick={prepareAgain} disabled={isStarting || !hasRegistration || !oneDriveReady} className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"><Sparkles className="mr-2 size-4" />{isStarting ? "Auftrag wird gesendet …" : hasPreviousDraft ? "Neue Vorschau vorbereiten" : "Inserat vorbereiten"}</Button>
                    {hasPreviousDraft ? <span className="text-xs text-slate-500">Ein neuer Entwurf wird separat angelegt; gespeicherte Entwürfe bleiben erhalten.</span> : null}
                </div> : null}
            </CardContent>
        </Card>
    );
}

function ListingDraftEditor({ job, purchaseId, onMessage, onSaved }: {
    job: PurchaseListingJob;
    purchaseId: string;
    onMessage: (message: string) => void;
    onSaved: () => void;
}) {
    const [title, setTitle] = useState(job.title ?? "");
    const [description, setDescription] = useState(job.description ?? "");
    const suggestionFields = job.contract_version === 2 ? technicalSuggestionFields : legacySuggestionFields;
    const [suggestions, setSuggestions] = useState<Record<string, string>>(() => normalizeSuggestions(job.extracted_suggestions, suggestionFields));
    const [imageIds, setImageIds] = useState<string[]>(job.selected_image_ids ?? []);
    const [approvedFields, setApprovedFields] = useState<string[]>([]);
    const [isSaving, saveTransition] = useTransition();
    const [isConfirming, confirmTransition] = useTransition();
    const sortedImages = useMemo(() => job.images.filter((image) => image.upload_status === "available").sort((a, b) => {
        const ai = imageIds.indexOf(a.id);
        const bi = imageIds.indexOf(b.id);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.file_name.localeCompare(b.file_name);
    }), [job.images, imageIds]);
    const initialSuggestions = normalizeSuggestions(job.extracted_suggestions, suggestionFields);
    const isDraftDirty = title !== (job.title ?? "") || description !== (job.description ?? "") ||
        JSON.stringify(imageIds) !== JSON.stringify(job.selected_image_ids ?? []) ||
        JSON.stringify(suggestions) !== JSON.stringify(initialSuggestions);

    function saveDraft(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        saveTransition(async () => {
            const result = await savePurchaseListingDraft({
                purchaseId, jobId: job.id, expectedManualRevision: job.manual_revision,
                title, description, extractedSuggestions: suggestions, selectedImageIds: imageIds,
            });
            onMessage(result.message);
            if (result.ok) onSaved();
        });
    }

    function moveImage(index: number, direction: -1 | 1) {
        const next = [...imageIds];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setImageIds(next);
    }

    function confirmSuggestions() {
        confirmTransition(async () => {
            const result = await confirmPurchaseListingSuggestions({
                purchaseId, jobId: job.id, expectedSourceRevision: job.source_revision,
                expectedManualRevision: job.manual_revision, selectedFields: approvedFields,
            });
            onMessage(result.message);
            if (result.ok) onSaved();
        });
    }

    return (
        <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-bold text-slate-800"><FileCheck2 className="size-4" />Vorschlag und bestätigte Fahrzeugdaten</div>
                <p className="mt-1 text-xs text-slate-500">OCR-Vorschläge ändern die Fahrzeugstammdaten nicht. Widersprüche bitte vor einer späteren Verwendung prüfen.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {suggestionFields.map(([key, label]) => {
                        const nestedDetails = job.confirmed_vehicle_data.listingDetails as Record<string, unknown> | undefined;
                        const accepted = (job.confirmed_suggestions.fields as Record<string, unknown> | undefined)?.[key];
                        const snapshotValue = key in (nestedDetails ?? {}) ? nestedDetails?.[key] : job.confirmed_vehicle_data[key];
                        const confirmedValue = accepted !== undefined ? accepted : snapshotValue;
                        const conflict = job.conflicts.some((item) => Boolean(item && typeof item === "object" && (item as { field?: string }).field === key));
                        return <label key={key} className="text-xs font-bold text-slate-600">{label}{conflict ? <span className="ml-1 text-amber-700">· Abweichung</span> : null}{accepted !== undefined ? <span className="ml-1 text-emerald-700">· bestätigt</span> : null}
                            <span className="mt-1 block truncate rounded-lg bg-white px-2 py-1 font-medium text-slate-500">Bestätigt: {confirmedValue === null || confirmedValue === undefined || confirmedValue === "" ? "—" : String(confirmedValue)}</span>
                            <input value={suggestions[key] ?? ""} onChange={(event) => setSuggestions((current) => ({ ...current, [key]: event.target.value }))} placeholder="Kein Vorschlag" className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium text-slate-900" />
                            {job.contract_version === 2 && suggestions[key] ? <span className="mt-1 flex items-center gap-2 font-medium"><input type="checkbox" checked={approvedFields.includes(key)} onChange={(event) => setApprovedFields((current) => event.target.checked ? [...current, key] : current.filter((field) => field !== key))} />Diesen Wert ausdrücklich übernehmen</span> : null}
                        </label>;
                    })}
                </div>
                {job.contract_version === 2 && Object.keys(suggestions).some((field) => suggestions[field]) ? <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center">
                    <Button type="button" variant="outline" disabled={!approvedFields.length || isConfirming || isDraftDirty} onClick={confirmSuggestions} className="font-bold">
                        {isConfirming ? "Werte werden übernommen …" : "Ausgewählte Vorschläge in Fahrzeugakte übernehmen"}
                    </Button>
                    {isDraftDirty ? <span className="text-xs text-amber-800">Speichere zuerst die aktuellen Entwurfsänderungen. So bleiben sie bei der Bestätigung erhalten.</span> : <span className="text-xs text-slate-500">Nur markierte Felder werden nach dieser Bestätigung geändert. Bestehende Werte werden nicht automatisch überschrieben.</span>}
                </div> : null}
            </div>

            {job.missing_fields.length ? <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>Offene Angaben: {job.missing_fields.map((item) => openPointLabels[String(item)] ?? "Angabe prüfen").join(", ")}. Der Entwurf bleibt unvollständig, bis diese Punkte geprüft wurden.</p></div> : null}
            {job.conflicts.length ? <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>Es gibt abweichende Angaben aus dem Fahrzeugschein. Die bestätigten Daten bleiben unverändert.</p></div> : null}

            <form onSubmit={saveDraft} className="space-y-4">
                <label className="block text-sm font-bold text-slate-700">Inseratstitel
                    <input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-950" />
                </label>
                <label className="block text-sm font-bold text-slate-700">Beschreibung
                    <textarea value={description} maxLength={12000} onChange={(event) => setDescription(event.target.value)} rows={12} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium leading-6 text-slate-900" />
                </label>
                <div>
                    <p className="text-sm font-bold text-slate-700">Fahrzeugfotos · gespeicherte private Version</p>
                    {sortedImages.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {sortedImages.map((image) => {
                            const selectedIndex = imageIds.indexOf(image.id);
                            return <div key={image.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <Image src={`/api/purchase-listing-images/${image.id}/file`} alt={image.file_name} width={640} height={480} unoptimized className="aspect-[4/3] w-full object-cover" />
                                <div className="p-2"><p className="truncate text-xs font-semibold" title={image.file_name}>{image.file_name}</p>
                                    <label className="mt-2 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={selectedIndex >= 0} onChange={(event) => setImageIds((current) => event.target.checked ? [...current, image.id] : current.filter((id) => id !== image.id))} />Für Entwurf auswählen</label>
                                    <div className="mt-2 flex gap-1"><Button type="button" size="sm" variant="outline" disabled={selectedIndex <= 0} aria-label="Bild nach oben" onClick={() => moveImage(selectedIndex, -1)}><ChevronUp className="size-4" /></Button><Button type="button" size="sm" variant="outline" disabled={selectedIndex < 0 || selectedIndex >= imageIds.length - 1} aria-label="Bild nach unten" onClick={() => moveImage(selectedIndex, 1)}><ChevronDown className="size-4" /></Button>{selectedIndex === 0 ? <span className="self-center text-xs font-bold text-cyan-800">Titelbild</span> : null}</div>
                                </div>
                            </div>;
                        })}
                    </div> : <p className="mt-2 text-sm text-amber-800">Für diesen Entwurf wurden keine abrufbaren Fahrzeugfotos gespeichert. Bitte prüfe den OneDrive-Bilderordner und starte eine neue Vorbereitung.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={isSaving} className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"><Save className="mr-2 size-4" />{isSaving ? "Wird gespeichert …" : "Entwurf speichern"}</Button>
                    <span className="text-xs text-slate-500">Manuelle Änderungen bleiben erhalten und können von späteren Callbacks nicht überschrieben werden.</span>
                </div>
            </form>
        </>
    );
}

function normalizeSuggestions(value: Record<string, unknown> | null | undefined, fields: ReadonlyArray<readonly [string, string]>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key] of fields) {
        const entry = value?.[key];
        if (typeof entry === "string" || typeof entry === "number") result[key] = String(entry);
    }
    return result;
}
