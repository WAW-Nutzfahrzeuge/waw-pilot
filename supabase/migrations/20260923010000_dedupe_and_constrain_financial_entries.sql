-- Kassenbuch / Finanzjournal: Eindeutigkeit auf Datenbankebene absichern.
--
-- Hintergrund: `financial_entries` wird bisher ausschließlich über eine
-- Anwendungslogik dedupliziert (siehe lib/accounting/financial-sync.ts,
-- upsertFinancialEntry): dort wird zuerst geprüft, ob für
-- (company_id, source_type, source_id, entry_type) bereits ein Eintrag
-- existiert, und je nach Ergebnis aktualisiert oder neu angelegt.
-- Dieses "check-then-insert"-Muster ist nicht race-safe (Doppelklicks,
-- parallele Requests oder Wiederholungen nach Fehlern könnten in seltenen
-- Fällen zu doppelten Zeilen für dieselbe Zahlung führen).
--
-- Diese Migration:
--   1. bereinigt bestehende Duplikate NICHT destruktiv (kein DELETE),
--      sondern storniert überzählige Zeilen je Schlüssel nachvollziehbar
--      (status = 'voided' mit Grund), sodass pro Schlüssel höchstens eine
--      aktive Zeile übrig bleibt. Bereits aktive Zeilen werden gegenüber
--      bereits stornierten Zeilen bevorzugt behalten.
--   2. erzwingt anschließend über einen partiellen Unique-Index, dass es
--      pro (company_id, source_type, source_id, entry_type) höchstens eine
--      NICHT stornierte Zeile geben kann.
--
-- Die Migration ist wiederholt ausführbar (idempotent): ohne bestehende
-- Duplikate ändert der UPDATE-Schritt nichts, und der Index wird nur
-- angelegt, falls er noch nicht existiert.

with ranked_entries as (
    select
        id,
        row_number() over (
            partition by company_id, source_type, source_id, entry_type
            order by
                (status = 'active') desc,
                created_at asc,
                id asc
        ) as rn
    from financial_entries
)
update financial_entries fe
set
    status = 'voided',
    void_reason = coalesce(
        fe.void_reason,
        'Automatisch bereinigtes Duplikat (Eindeutigkeits-Migration 20260923010000)'
    ),
    voided_at = coalesce(fe.voided_at, now())
from ranked_entries re
where re.id = fe.id
  and re.rn > 1
  and fe.status <> 'voided';

create unique index if not exists financial_entries_source_active_unique_idx
    on financial_entries (company_id, source_type, source_id, entry_type)
    where status <> 'voided';
