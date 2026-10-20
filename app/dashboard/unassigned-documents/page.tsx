import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ExternalLink, FileText } from "lucide-react";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { ownerIdFallbackTimeZone } from "@/lib/automation/owner-id-fallback";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { IntakeActions } from "./intake-actions";

export const dynamic = "force-dynamic";

type IntakeRow = {
    id: string; status: string; processing_status: string; received_at: string; reason_code: string;
    country_code: string | null; candidate_sale_ids: string[]; original_file_name: string;
    original_upload_id: string; derived_storage_path: string | null; error_code: string | null;
    assigned_at: string | null; ignored_at: string | null; ignored_reason: string | null;
};
type SaleRow = { id: string; sale_number: string | null; sale_identifier: string; sale_date: string | null; status: string; customers: { company_name: string | null; first_name: string | null; last_name: string | null } | { company_name: string | null; first_name: string | null; last_name: string | null }[] | null; vehicles: { vin: string | null; make: string | null; model: string | null } | { vin: string | null; make: string | null; model: string | null }[] | null };
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const reasonLabels: Record<string, string> = {
    source_not_inbound_email: "Quelle ist keine eingehende E-Mail",
    mail_analysis_incomplete: "E-Mail wurde nicht vollständig analysiert",
    attachment_enumeration_incomplete: "Anhangsliste ist nicht vollständig",
    attachment_count_invalid: "Ursprüngliche Anhangszahl ist ungültig",
    attachment_count_mismatch: "Ursprüngliche Anhangszahl stimmt nicht mit der Analyse überein",
    mail_has_multiple_attachments: "Die E-Mail hatte mehr als einen Anhang",
    mail_has_conflicting_or_unknown_identifiers: "Zuordnungsmerkmale sind widersprüchlich oder ungeklärt",
    attachment_analysis_incomplete: "Anhang wurde nicht vollständig analysiert",
    page_coverage_incomplete: "Seitenabdeckung ist unvollständig",
    owner_document_not_identified: "Das Ausweisdokument wurde in der Analyse nicht eindeutig gefunden",
    attachment_contains_other_documents: "Der Anhang enthält weitere Dokumente",
    attachment_contains_unknown_pages: "Mindestens eine Seite ist unbekannt oder nicht zugeordnet",
    owner_document_does_not_cover_all_pages: "Nicht alle Anhangsseiten sind dem Ausweis zugeordnet",
    owner_document_page_mapping_invalid: "Die Seitenverknüpfung des Ausweises ist ungültig",
    reliable_residence_country_missing: "Zuverlässiges Wohnsitzland fehlt",
    residence_country_unrecognized: "Wohnsitzland konnte nicht normalisiert werden",
    received_at_invalid: "Eingangsdatum ist nicht auswertbar",
    no_country_candidate: "Kein passender Verkauf im Zeitraum gefunden",
    multiple_country_candidates: "Mehrere Verkäufe passen zum Länder- und Zeitraumabgleich",
    strong_identifier_conflict: "Starke Zuordnungsmerkmale widersprechen sich",
    strong_identifier_ambiguous: "Starke Kennung ergibt mehrere mögliche Verkäufe",
    strong_identifier_unresolved: "Starke Zuordnungsmerkmale konnten nicht eindeutig aufgelöst werden",
    strong_match_is_cancelled: "Eindeutiger Treffer ist storniert",
    matched_sale_invalid_or_missing_sale_date: "Treffer ist fachlich ungültig oder hat kein Verkaufsdatum",
    derived_document_unavailable: "Abgeleitete Ausweis-PDF fehlt oder konnte nicht gespeichert werden",
    derived_pdf_invalid: "Die abgeleitete Datei ist keine gültige PDF",
    derived_pdf_unreadable: "Die abgeleitete PDF ist beschädigt oder nicht lesbar",
    derived_pdf_page_count_mismatch: "Seitenzahl der abgeleiteten PDF passt nicht zur Analyse",
    original_file_unavailable: "Das gespeicherte Original ist nicht erreichbar",
    original_pdf_unreadable: "Das Original-PDF ist beschädigt oder nicht lesbar",
    original_page_count_mismatch: "Die analysierte Seitenzahl passt nicht zur tatsächlichen Originaldatei",
    original_file_type_unsupported: "Der Originaldateityp kann für die Seitenprüfung nicht verarbeitet werden",
    derived_storage_failed: "Die abgeleitete PDF konnte nicht privat gespeichert werden",
    derived_path_registration_failed: "Der Storage-Pfad der PDF konnte nicht registriert werden",
    database_finalize_failed: "Der Vorgang konnte nicht vollständig in der Datenbank abgeschlossen werden",
};

export default async function UnassignedDocumentsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
    const user = await getCurrentUserContext();
    if (user.profile.role !== "admin" || user.companyId !== getCurrentCompanyId()) redirect("/dashboard");
    const showingAll = (await searchParams).show === "all";
    const supabase = createAutomationSupabaseClient();
    let intakeQuery = supabase.from("automation_owner_id_intakes").select("id, status, processing_status, received_at, reason_code, country_code, candidate_sale_ids, original_file_name, original_upload_id, derived_storage_path, error_code, assigned_at, ignored_at, ignored_reason")
        .eq("company_id", user.companyId).order("received_at", { ascending: false });
    if (!showingAll) intakeQuery = intakeQuery.eq("status", "open");
    const [{ data: intakeRows, error: intakeError }, { data: salesRows, error: salesError }] = await Promise.all([
        intakeQuery,
        supabase.from("sales").select("id, sale_number, sale_identifier, sale_date, status, customers:buyer_customer_id(company_name, first_name, last_name), vehicles(vin, make, model)")
            .eq("company_id", user.companyId).neq("status", "cancelled").order("sale_date", { ascending: false }).limit(1000),
    ]);
    if (intakeError || salesError) {
        console.error("owner_id_intake.overview_query_failed", { intakeCode: intakeError?.code ?? null, salesCode: salesError?.code ?? null });
    }
    const sales = ((salesRows ?? []) as unknown as SaleRow[]).map((sale) => {
        const customer = one(sale.customers);
        const vehicle = one(sale.vehicles);
        const customerName = customer?.company_name ?? [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ?? "Kunde unbekannt";
        const vehicleName = [vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
        const label = `${sale.sale_number ?? "Ohne Nummer"} · ${customerName}${vehicleName ? ` · ${vehicleName}` : ""}`;
        return { id: sale.id, label, searchText: `${label} ${sale.sale_identifier} ${vehicle?.vin ?? ""}` };
    });
    const saleLabel = new Map(sales.map((sale) => [sale.id, sale.label]));
    const intakes = (intakeRows ?? []) as IntakeRow[];

    return (
        <div className="space-y-6">
            <PageHeader eyebrow="Dokumenteneingang" title="Nicht zugeordnete Dokumente" description="Unklare Ausweiszuordnungen prüfen. Ein Länderabgleich ist nur ein Vorschlag und gibt das Dokument nicht frei." action={<Link className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700" href={showingAll ? "/dashboard/unassigned-documents" : "/dashboard/unassigned-documents?show=all"}>{showingAll ? "Nur offene Fälle" : "Erledigte Fälle anzeigen"}</Link>} />
            {intakeError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Die offenen Fälle konnten nicht geladen werden.</div>}
            {!intakeError && intakes.length === 0 && <Card className="rounded-3xl"><CardContent className="flex items-center gap-3 p-8 text-sm text-slate-600"><FileText className="size-5" />Keine offenen Fälle.</CardContent></Card>}
            {intakes.map((intake) => (
                <Card key={intake.id} className="rounded-3xl border-slate-200 shadow-sm">
                    <CardContent className="p-5 sm:p-6">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-extrabold text-slate-950">Ausweisdokument</h2>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${intake.status !== "open" ? "bg-emerald-100 text-emerald-800" : intake.processing_status === "error" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                                        {intake.status === "assigned" ? "Zugeordnet" : intake.status === "ignored" ? "Ignoriert" : intake.processing_status === "error" ? "Technischer Prüffall" : "Manuelle Zuordnung erforderlich"}
                                    </span>
                                </div>
                                <p className="mt-2 break-all text-sm text-slate-600">{intake.original_file_name}</p>
                                <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                                    <div><dt className="inline font-semibold text-slate-700">Eingang: </dt><dd className="inline text-slate-600">{new Date(intake.received_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: ownerIdFallbackTimeZone })}</dd></div>
                                    <div><dt className="inline font-semibold text-slate-700">Land: </dt><dd className="inline text-slate-600">{intake.country_code ?? "Nicht zuverlässig verfügbar"}</dd></div>
                                    <div className="sm:col-span-2"><dt className="inline font-semibold text-slate-700">Grund: </dt><dd className="inline text-slate-600">{reasonLabels[intake.error_code ?? intake.reason_code] ?? intake.error_code ?? intake.reason_code}</dd></div>
                                    {intake.candidate_sale_ids.length > 0 && <div className="sm:col-span-2"><dt className="inline font-semibold text-slate-700">Kandidaten: </dt><dd className="text-slate-600">{intake.candidate_sale_ids.map((id) => saleLabel.get(id) ?? "Kandidat nicht mehr verfügbar").join(" · ")}</dd></div>}
                                    {intake.status === "ignored" && intake.ignored_reason && <div className="sm:col-span-2"><dt className="inline font-semibold text-slate-700">Erledigt mit Begründung: </dt><dd className="inline text-slate-600">{intake.ignored_reason}</dd></div>}
                                    {intake.status === "assigned" && intake.assigned_at && <div className="sm:col-span-2"><dt className="inline font-semibold text-slate-700">Zuordnungszeitpunkt: </dt><dd className="inline text-slate-600">{new Date(intake.assigned_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: ownerIdFallbackTimeZone })}</dd></div>}
                                </dl>
                                {intake.error_code && <p className="mt-3 flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="size-4 shrink-0" />{intake.error_code}</p>}
                            </div>
                            <div className="flex shrink-0 flex-wrap content-start gap-2">
                                {intake.derived_storage_path && <a className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700" href={`/dashboard/unassigned-documents/${intake.id}/file?kind=document`} target="_blank" rel="noreferrer">Dokument öffnen <ExternalLink className="size-4" /></a>}
                                <a className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700" href={`/dashboard/unassigned-documents/${intake.id}/file?kind=original`} target="_blank" rel="noreferrer">Original öffnen <ExternalLink className="size-4" /></a>
                            </div>
                        </div>
                        {intake.status === "open" ? <IntakeActions intakeId={intake.id} sales={sales} canAssign={Boolean(intake.derived_storage_path) && ["ready", "error"].includes(intake.processing_status)} /> : null}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
