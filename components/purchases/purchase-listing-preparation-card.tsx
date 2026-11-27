"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertTriangle, ChevronDown, ChevronUp, FileCheck2, LoaderCircle, Save, Sparkles } from "lucide-react";

import { startPurchaseListingOcr, startPurchaseListingPreparation, savePurchaseListingDraft, savePurchaseListingInformation } from "@/app/dashboard/ankauf/[purchaseId]/listing-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PurchaseListingJob } from "@/lib/purchases/purchase-detail-queries";
import { VehicleListingDetailsFields } from "@/components/vehicles/vehicle-listing-details-fields";
import { normalizeVehicleListingDetails } from "@/lib/vehicles/listing-details";

type Props = {
    purchaseId: string;
    purchaseLabel: string;
    hasRegistration: boolean;
    oneDriveReady: boolean;
    jobs: PurchaseListingJob[];
    currentOcrJob: PurchaseListingJob | null;
    vehicleType: string;
    manufacturer: string;
    model: string;
    vin: string;
    constructionYear: number | null;
    color: string | null;
    vehicleCategory: string;
    firstRegistration: string | null;
    listingDetails: unknown;
    mileage: number | null;
    salePriceNet: number | null;
};

const technicalSuggestionFields = [
    ["manufacturer", "Hersteller"], ["model", "Modell"], ["vehicleType", "Fahrzeug-/Aufbauart"], ["vin", "FIN"],
    ["firstRegistration", "Erstzulassung"], ["constructionYear", "Baujahr"], ["enginePowerKw", "Motorleistung (kW)"],
    ["transmission", "Getriebe"], ["emissionClass", "Schadstoffklasse"], ["axleFormula", "Achsformel"],
    ["frontSuspension", "Federung vorne"], ["rearSuspension", "Federung hinten"],
    ["grossVehicleWeightKg", "Zulässiges Gesamtgewicht (kg)"], ["curbWeightKg", "Leergewicht (kg)"],
    ["payloadKg", "Nutzlast (kg)"], ["wheelbaseMm", "Radstand (mm)"], ["huUntil", "HU bis"],
    ["spUntil", "SP bis"], ["color", "Farbe"],
] as const;
const legacySuggestionFields = [
    ["manufacturer", "Hersteller"], ["model", "Modell"], ["vehicleType", "Aufbau"], ["vin", "FIN"],
    ["firstRegistration", "Erstzulassung"], ["constructionYear", "Baujahr"], ["mileage", "Kilometerstand"], ["color", "Farbe"],
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
    salePrice: "Verkaufspreis ergänzen", availability: "Standort und Verfügbarkeit prüfen",
    vehicleReadiness: "Fahrbereitschaft prüfen", currentDamageStatus: "Aktuelle Schäden/Mängel klären",
    repairedDamageStatus: "Reparierte Vorschäden klären", maintenanceProof: "Wartungsnachweise klären",
    bodyFunction: "Funktionsstatus des Aufbaus prüfen", waterSystem: "Wasseranlage prüfen",
};

export function PurchaseListingPreparationCard({ purchaseId, purchaseLabel, hasRegistration, oneDriveReady, jobs, currentOcrJob, vehicleType, manufacturer, model, vin, constructionYear, color, vehicleCategory, firstRegistration, listingDetails, mileage, salePriceNet }: Props) {
    const router = useRouter();
    const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id ?? "");
    const job = jobs.find((item) => item.id === selectedJobId) ?? jobs[0] ?? null;
    const [message, setMessage] = useState("");
    const [isStarting, startTransition] = useTransition();
    const detailsFormRef = useRef<HTMLFormElement>(null);
    const [now, setNow] = useState(0);
    const ocrSuggestions = currentOcrJob?.extracted_suggestions ?? {};
    const details = normalizeDetails(listingDetails);
    const ocrFieldValues: Record<string, string | number | null> = {
        manufacturer, model, vin, vehicleType, firstRegistration, constructionYear, color,
        enginePowerKw: details.enginePowerKw, transmission: details.transmission, emissionClass: details.emissionClass,
        axleFormula: details.axleFormula, frontSuspension: details.frontSuspension, rearSuspension: details.rearSuspension,
        grossVehicleWeightKg: details.grossVehicleWeightKg, curbWeightKg: details.curbWeightKg, payloadKg: details.payloadKg,
        wheelbaseMm: details.wheelbaseMm, huUntil: details.huUntil, spUntil: details.spUntil,
    };
    const shownOcrFields = technicalSuggestionFields.filter(([key]) => hasValue(ocrFieldValues[key]) || hasValue(ocrSuggestions[key]));
    const shownOcrKeys = new Set(shownOcrFields.map(([key]) => key));
    const isOcrJob = Boolean(job?.contract_version === 5 && job.source_snapshot?.operation === "registration_ocr");
    const currentOcrActive = currentOcrJob?.status === "queued" || currentOcrJob?.status === "processing";
    const hasOpenItems = Boolean(job && ((job.missing_fields?.length ?? 0) > 0 || (job.conflicts?.length ?? 0) > 0));
    const active = job?.status === "queued" || job?.status === "processing" || currentOcrActive;
    const selectedLeaseExpired = job?.status === "processing" && Boolean(job.lease_expires_at) && Date.parse(job.lease_expires_at!) <= now;
    const currentOcrLeaseExpired = currentOcrJob?.status === "processing" && Boolean(currentOcrJob.lease_expires_at) && Date.parse(currentOcrJob.lease_expires_at!) <= now;
    const leaseExpired = selectedLeaseExpired || currentOcrLeaseExpired;

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

    function saveDetails(event?: React.FormEvent<HTMLFormElement>) {
        event?.preventDefault();
        const form = detailsFormRef.current;
        if (!form) return;
        startTransition(async () => {
            const result = await savePurchaseListingInformation(purchaseId, new FormData(form));
            setMessage(result.message);
            if (result.ok) router.refresh();
        });
    }

    function prepareAgain() {
        setMessage("");
        startTransition(async () => {
            const form = detailsFormRef.current;
            if (!form) return;
            const saved = await savePurchaseListingInformation(purchaseId, new FormData(form));
            if (!saved.ok) { setMessage(saved.message); return; }
            const result = await startPurchaseListingPreparation(purchaseId);
            setMessage(result.message);
            if (result.job?.id) setSelectedJobId(result.job.id);
            router.refresh();
        });
    }

    function readRegistration() {
        setMessage("");
        startTransition(async () => {
            const result = await startPurchaseListingOcr(purchaseId);
            setMessage(result.message);
            if (result.job?.id) setSelectedJobId(result.job.id);
            router.refresh();
        });
    }

    const hasPreviousDraft = Boolean(job && !isOcrJob && ["draft_ready", "needs_input"].includes(job.status));
    const formSourceKey = JSON.stringify({ vehicleType, manufacturer, model, vin, constructionYear, color, vehicleCategory, firstRegistration, listingDetails, mileage, salePriceNet });

    return (
        <Card id="listing-preparation" className="scroll-mt-24 rounded-3xl border-cyan-100 bg-white/95 shadow-sm">
            <CardContent className="space-y-5 p-5">
                <form key={`${currentOcrJob?.id ?? "no-ocr"}:${currentOcrJob?.status ?? "none"}:${formSourceKey}`} ref={detailsFormRef} onSubmit={saveDetails} className="space-y-5">
                    <div>
                        <h2 className="text-lg font-extrabold text-slate-950">Angaben zum Inserat</h2>
                        <p className="mt-1 text-sm text-slate-600">Prüfe die übernommenen Fahrzeugdaten und ergänze die Angaben für den Entwurf. OCR-Ergebnisse ändern die Fahrzeugakte erst, wenn du sie übernimmst.</p>
                    </div>
                    <input type="hidden" name="listing_ocr_job_id" value={currentOcrJob?.status === "needs_input" ? currentOcrJob.id : ""} />
                    <input type="hidden" name="listing_ocr_source_revision" value={currentOcrJob?.status === "needs_input" ? currentOcrJob.source_revision : ""} />
                    <input type="hidden" name="listing_ocr_document_id" value={currentOcrJob?.status === "needs_input" ? String((currentOcrJob.source_snapshot?.registrationDocument as Record<string, unknown> | undefined)?.id ?? "") : ""} />
                    <input type="hidden" name="listing_ocr_document_path" value={currentOcrJob?.status === "needs_input" ? String((currentOcrJob.source_snapshot?.registrationDocument as Record<string, unknown> | undefined)?.file_path ?? "") : ""} />
                    <input type="hidden" name="listing_ocr_suggestions" value={currentOcrJob?.status === "needs_input" ? JSON.stringify(currentOcrJob.extracted_suggestions) : ""} />
                    <input type="hidden" name="listing_expected_source" value={JSON.stringify({
                        vehicle: { manufacturer, model, vehicle_type: vehicleType, vin, construction_year: constructionYear, color },
                        listingDetails: listingDetails ?? {}, mileage, salePriceNet, firstRegistration, vehicleCategory,
                    })} />
                    <fieldset disabled={currentOcrActive} className="space-y-5 disabled:opacity-70">
                        <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div><h3 className="font-bold text-slate-900">Fahrzeugdaten aus dem Fahrzeugschein</h3><p className="mt-1 text-xs text-slate-500">Vorschläge stehen direkt in den Feldern. Bereits gespeicherte Werte haben Vorrang.</p></div>
                                <Button type="button" variant="outline" onClick={readRegistration} disabled={!hasRegistration || isStarting || currentOcrActive || currentOcrJob?.status === "needs_input"} className="rounded-xl font-bold"><FileCheck2 className="mr-2 size-4" />{currentOcrActive ? "Fahrzeugschein wird ausgelesen …" : currentOcrJob?.status === "needs_input" ? "Aktuelles OCR-Ergebnis" : currentOcrJob?.status === "failed" ? "Erneut auslesen" : "Fahrzeugschein auslesen"}</Button>
                            </div>
                            {currentOcrJob?.status === "failed" ? <p role="alert" className="text-sm text-red-700">{currentOcrJob.last_error ?? "Der Fahrzeugschein konnte nicht ausgelesen werden."}</p> : null}
                            {currentOcrJob?.status === "needs_input" ? <p className="text-xs font-medium text-cyan-800">OCR-Ergebnis bereit. Änderungen werden erst beim Speichern übernommen.</p> : null}
                            {shownOcrFields.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shownOcrFields.map(([key, label]) => <OcrEditableField key={key} field={key} label={key === "grossVehicleWeightKg" ? "Zulässige Gesamtmasse (OCR-Angabe) in kg" : label} value={ocrFieldValues[key]} suggestion={ocrSuggestions[key]} />)}</div> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Noch keine technischen Fahrzeugwerte ausgelesen. Bereits gespeicherte Fahrzeugwerte erscheinen hier.</p>}
                        </section>
                        <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
                            <div><h3 className="font-bold text-slate-900">Fehlende Pflichtangaben für mobile.de</h3><p className="mt-1 text-xs text-slate-500">Unvollständige Angaben verhindern den Entwurf nicht. Eine echte Veröffentlichungsprüfung erfolgt später.</p></div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <label className="space-y-1.5 text-xs font-bold text-slate-700">Fahrzeugklasse<select name="listing_listingVehicleClass" defaultValue={normalizeClass(listingDetails)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium"><option value="">Bitte auswählen</option><option value="heavy_truck">Schwerer Lkw</option><option value="tractor_unit">Sattelzugmaschine</option></select></label>
                                <label className="space-y-1.5 text-xs font-bold text-slate-700">Fahrzeugkategorie<input name="listing_vehicleCategory" defaultValue={vehicleCategory} maxLength={120} placeholder="z. B. Betonmischer" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label>
                                {!shownOcrKeys.has("manufacturer") ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Marke<input name="listing_manufacturer" defaultValue={manufacturer} maxLength={160} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label> : null}
                                <label className="space-y-1.5 text-xs font-bold text-slate-700">Aktueller Kilometerstand (km)<input name="listing_mileage" type="number" min="0" max="10000000" step="1" defaultValue={mileage ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label>
                                <label className="space-y-1.5 text-xs font-bold text-slate-700">Unreparierte Schäden vorhanden<select name="listing_currentDamageStatus" defaultValue={details.currentDamageStatus} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium"><option value="unknown">Unbekannt</option><option value="known">Ja</option><option value="none">Nein</option></select></label>
                                <PriceTypeFields key={`${details.priceType ?? ""}:${salePriceNet ?? ""}`} value={details.priceType ?? (salePriceNet === null ? "" : "fixed")} salePriceNet={salePriceNet} />
                            </div>
                        </section>
                        <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
                            <div><h3 className="font-bold text-slate-900">Optionale Ergänzungen</h3><p className="mt-1 text-xs text-slate-500">Nur zusätzliche Felder, die oben noch nicht dargestellt sind.</p></div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {!shownOcrKeys.has("firstRegistration") ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Erstzulassung<input name="listing_firstRegistration" type="date" defaultValue={firstRegistration ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label> : null}
                                {!shownOcrKeys.has("enginePowerKw") ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Motorleistung (kW)<input name="listing_enginePowerKw" type="number" min="1" max="3000" step="1" defaultValue={details.enginePowerKw ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label> : null}
                                <label className="space-y-1.5 text-xs font-bold text-slate-700">Kraftstoff<input name="listing_fuelType" maxLength={80} defaultValue={details.fuelType ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label>
                                {!shownOcrKeys.has("transmission") ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Getriebe<input name="listing_transmission" maxLength={120} defaultValue={details.transmission ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label> : null}
                                {!shownOcrKeys.has("emissionClass") ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Schadstoffklasse<input name="listing_emissionClass" maxLength={80} defaultValue={details.emissionClass ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label> : null}
                                {!shownOcrKeys.has("axleFormula") ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Achsformel<input name="listing_axleFormula" maxLength={80} defaultValue={details.axleFormula ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label> : null}
                                <label className="space-y-1.5 text-xs font-bold text-slate-700">F.2 zulässiges Gesamtgewicht (kg)<input name="listing_permittedMassF2Kg" type="number" min="1" max="100000" step="1" defaultValue={details.permittedMassF2Kg ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /></label>
                            </div>
                            <label className="block space-y-1.5 text-xs font-bold text-slate-700">Zusätzliche Angaben für die Beschreibung
                                <textarea name="listing_descriptionAdditionalDetails" maxLength={4000} defaultValue={details.descriptionAdditionalDetails ?? ""} rows={6} placeholder={"• Aufbauhersteller und bestätigtes Nennvolumen\n• Bekannte Schäden und Mängel\n• Durchgeführte Reparaturen\n• Retarder, Klimaanlage oder weitere Ausstattung\n• Enthaltenes und nicht enthaltenes Zubehör\n• HU/SP gültig bis"} className="min-h-36 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" />
                                <span className="block font-medium text-slate-500">Stichpunkte reichen. Trage hier Zustand, Schäden, Reparaturen, Ausstattung, Aufbau, Zubehör und weitere Besonderheiten ein. Nur Angaben eintragen, die im Inserat erscheinen dürfen.</span>
                            </label>
                            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-700">Weitere gespeicherte Angaben</summary><div className="mt-3"><VehicleListingDetailsFields namePrefix="listing_" vehicleType={vehicleType} value={listingDetails} excludedFields={["enginePowerKw", "fuelType", "transmission", "emissionClass", "axleFormula", "permittedMassF2Kg", "currentDamageStatus", "descriptionAdditionalDetails"]} title="Weitere gespeicherte Fahrzeug-, Zustands- und Aufbaudaten" /></div></details>
                        </section>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button type="submit" variant="outline" disabled={isStarting || currentOcrActive} className="rounded-xl font-bold"><Save className="mr-2 size-4" />{isStarting ? "Speichert …" : "Angaben speichern"}</Button>
                        </div>
                    </fieldset>
                </form>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700"><Sparkles className="size-5" /></div>
                        <div>
                            <h2 className="font-extrabold text-slate-950">Inserat vorbereiten</h2>
                            <p className="mt-1 text-sm text-slate-600">Entwurf aus bestätigten Fahrzeugdaten, Fahrzeugschein und OneDrive-Fahrzeugfotos vorbereiten.</p>
                            <p className="mt-1 text-xs font-semibold text-slate-400">{purchaseLabel} · Vorbereitung erstellt keine Veröffentlichung bei mobile.de.</p>
                        </div>
                    </div>
                    {job ? <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${job.status === "draft_ready" && !hasOpenItems ? "bg-emerald-50 text-emerald-800" : job.status === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{job.status === "draft_ready" && hasOpenItems ? "Vorschau · offene Punkte" : jobLabel(job)}</span> : null}
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
                            {jobs.map((item, index) => <option key={item.id} value={item.id}>{index === 0 ? "Aktuell · " : "Vorherig · "}{jobLabel(item)} · {new Date(item.updated_at).toLocaleString("de-DE")}</option>)}
                        </select>
                    </label>
                ) : null}

                {((job && active) || currentOcrActive) ? (
                    <div role="status" className="flex flex-col gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-sm font-semibold text-cyan-950"><LoaderCircle className="size-4 animate-spin" />{leaseExpired ? "Die Bearbeitungsfrist ist abgelaufen. Der Auftrag kann mit derselben ID wieder aufgenommen werden." : currentOcrActive ? "Der Fahrzeugschein wird ausgelesen. Fahrzeugdaten werden dabei noch nicht gespeichert." : job?.status === "queued" ? "Der Auftrag wartet auf die n8n-Annahme." : isOcrJob ? "Der Fahrzeugschein wird ausgelesen. Fahrzeugdaten werden dabei noch nicht gespeichert." : "n8n erstellt den Textentwurf und übernimmt die Fahrzeugbilder."}</p>
                        {leaseExpired ? <Button type="button" onClick={currentOcrLeaseExpired ? readRegistration : prepareAgain} disabled={isStarting} variant="outline" className="rounded-xl font-bold">{currentOcrLeaseExpired ? "OCR-Auftrag wiederaufnehmen" : "Auftrag erneut senden"}</Button> : null}
                    </div>
                ) : null}

                {job?.status === "failed" ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-red-700">Letzter gespeicherter Auftragsfehler</span>{job.last_error ?? "Die Inseratsvorbereitung ist fehlgeschlagen."}</div> : null}

                {isOcrJob && job?.id !== currentOcrJob?.id ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Dieses ältere OCR-Ergebnis bleibt zur Nachvollziehbarkeit erhalten. Es befüllt das aktuelle Formular nicht.</p> : null}

                {job && !isOcrJob && (job.status === "needs_input" || job.status === "draft_ready") ? (
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
                    <Button type="button" onClick={prepareAgain} disabled={isStarting || currentOcrActive || !hasRegistration || !oneDriveReady} className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"><Sparkles className="mr-2 size-4" />{isStarting ? "Auftrag wird gesendet …" : hasPreviousDraft ? "Angaben übernehmen und neue Vorschau vorbereiten" : "Angaben übernehmen und Inserat vorbereiten"}</Button>
                    {hasPreviousDraft ? <span className="text-xs text-slate-500">Ein neuer Entwurf wird separat angelegt; gespeicherte Entwürfe bleiben erhalten.</span> : null}
                </div> : null}
            </CardContent>
        </Card>
    );
}

function PriceTypeFields({ value, salePriceNet }: { value: "fixed" | "on_request" | ""; salePriceNet: number | null }) {
    const [priceType, setPriceType] = useState(value);
    return <>
        <label className="space-y-1.5 text-xs font-bold text-slate-700">Preisart<select name="listing_priceType" value={priceType} onChange={(event) => setPriceType(event.target.value as typeof priceType)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium"><option value="">Bitte auswählen</option><option value="fixed">Festpreis</option><option value="on_request">Preis auf Anfrage</option></select></label>
        {priceType === "fixed" ? <label className="space-y-1.5 text-xs font-bold text-slate-700">Netto-Verkaufspreis (€)<input name="listing_salePriceNet" type="number" min="0" max="100000000" step="0.01" defaultValue={salePriceNet ?? ""} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" /><span className="block font-medium text-slate-500">Netto, kein Bruttopreis; es wird keine Steuerart abgeleitet.</span></label> : <input type="hidden" name="listing_salePriceNet" value={salePriceNet ?? ""} />}
    </>;
}

function hasValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim() !== "";
}

function OcrEditableField({ field, label, value, suggestion }: { field: string; label: string; value: string | number | null; suggestion: unknown }) {
    const saved = hasValue(value);
    const proposed = hasValue(suggestion) ? suggestion : null;
    const displayValue = saved ? value : proposed;
    const initialValue = field === "huUntil" || field === "spUntil" ? String(displayValue ?? "").slice(0, 7) : displayValue === null || displayValue === undefined ? "" : String(displayValue);
    const [editedValue, setEditedValue] = useState(initialValue);
    const baseSource = saved ? "Gespeichert" : proposed !== null ? "Fahrzeugschein" : "";
    const sourceLabel = editedValue !== initialValue ? "Manuell geändert" : baseSource;
    const conflict = saved && proposed !== null && String(value).trim().toLocaleLowerCase("de-DE") !== String(proposed).trim().toLocaleLowerCase("de-DE");
    const fieldNames: Record<string, string> = {
        manufacturer: "manufacturer", model: "model", vin: "vin", vehicleType: "vehicleType",
        firstRegistration: "firstRegistration", constructionYear: "constructionYear", color: "color",
        enginePowerKw: "enginePowerKw", transmission: "transmission", emissionClass: "emissionClass",
        axleFormula: "axleFormula", frontSuspension: "frontSuspension", rearSuspension: "rearSuspension",
        grossVehicleWeightKg: "grossVehicleWeightKg", curbWeightKg: "curbWeightKg", payloadKg: "payloadKg",
        wheelbaseMm: "wheelbaseMm", huUntil: "huUntil", spUntil: "spUntil",
    };
    const numericFields = new Set(["constructionYear", "enginePowerKw", "grossVehicleWeightKg", "curbWeightKg", "payloadKg", "wheelbaseMm"]);
    const inputType = field === "firstRegistration" ? "date" : field === "huUntil" || field === "spUntil" ? "month" : numericFields.has(field) ? "number" : "text";
    return <label className="space-y-1.5 text-xs font-bold text-slate-700">
        <span className="flex items-center justify-between gap-2">{label}<span className="text-[10px] font-semibold text-slate-400">{sourceLabel}</span></span>
        <input name={`listing_${fieldNames[field]}`} type={inputType} min={numericFields.has(field) ? 0 : undefined} max={field === "constructionYear" ? 2100 : undefined} step={numericFields.has(field) ? 1 : undefined} value={editedValue} onChange={(event) => setEditedValue(event.target.value)} maxLength={numericFields.has(field) || inputType !== "text" ? undefined : field === "vin" ? 80 : 500} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium" />
        {conflict ? <span className="block rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900">Fahrzeugscheinwert weicht ab: {String(proposed)}. Der gespeicherte Wert bleibt vorausgefüllt; prüfe und ändere das Feld bei Bedarf.</span> : null}
    </label>;
}

function normalizeDetails(value: unknown) {
    return normalizeVehicleListingDetails(value);
}
function normalizeClass(value: unknown) {
    return normalizeDetails(value).listingVehicleClass ?? "";
}

function jobLabel(job: PurchaseListingJob): string {
    if (job.contract_version === 5 && job.source_snapshot?.operation === "registration_ocr") {
        return job.status === "needs_input" ? "Fahrzeugschein ausgelesen" : `Fahrzeugschein · ${statusLabels[job.status] ?? job.status}`;
    }
    return statusLabels[job.status] ?? job.status;
}

function ListingDraftEditor({ job, purchaseId, onMessage, onSaved }: {
    job: PurchaseListingJob;
    purchaseId: string;
    onMessage: (message: string) => void;
    onSaved: () => void;
}) {
    const [title, setTitle] = useState(job.title ?? "");
    const [description, setDescription] = useState(job.description ?? "");
    const suggestions = normalizeSuggestions(job.extracted_suggestions, job.contract_version >= 2 ? technicalSuggestionFields : legacySuggestionFields);
    const [imageIds, setImageIds] = useState<string[]>(job.selected_image_ids ?? []);
    const [isSaving, saveTransition] = useTransition();
    const sortedImages = useMemo(() => job.images.filter((image) => image.upload_status === "available").sort((a, b) => {
        const ai = imageIds.indexOf(a.id);
        const bi = imageIds.indexOf(b.id);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.file_name.localeCompare(b.file_name);
    }), [job.images, imageIds]);
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

    return (
        <>
            {job.missing_fields.length ? <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p><span className="font-bold">Offene Hinweise zum Entwurf:</span> {job.missing_fields.map((item) => openPointLabels[String(item)] ?? "Angabe prüfen").join(", ")}. Das ist keine vollständige Prüfung der mobile.de-Pflichtfelder.</p></div> : null}
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
