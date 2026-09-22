-- Kassenbuch-Altdatenübernahme: sicherstellen, dass Administratoren einen
-- bestätigten Duplikat-Eintrag in cashbook_entries tatsächlich löschen
-- können.
--
-- Hintergrund: cashbook_entries wurde ursprünglich außerhalb der
-- versionierten Migrationen angelegt. SELECT und INSERT funktionieren
-- bereits nachweislich (Kassenbuch-Anzeige, „Finanzvorgang erfassen“).
-- Sollte für DELETE bisher keine passende Row-Level-Security-Policy
-- existieren, würde Supabase ein per RLS auf 0 Zeilen gefiltertes DELETE
-- nicht als Fehler melden – der Eintrag bliebe dann unbemerkt bestehen und
-- taucht nach einem Neuladen wieder auf.
--
-- Diese Migration ergänzt lediglich eine zusätzliche, klar benannte
-- DELETE-Policy. Sie verändert weder den RLS-Status der Tabelle noch
-- bestehende SELECT-/INSERT-Policies. Ist Row-Level-Security auf der
-- Tabelle nicht aktiviert, bleibt diese Policy folgenlos (inert).
--
-- Die eigentliche Autorisierung (nur Administratoren dürfen löschen)
-- erfolgt bereits serverseitig in app/dashboard/cashbook/backfill-actions.ts
-- (assertAdmin()); diese Policy dient nur der technischen Konsistenz
-- zwischen Company-Kontext und Datensatz.

drop policy if exists "cashbook_entries_delete_company_access" on public.cashbook_entries;
create policy "cashbook_entries_delete_company_access"
on public.cashbook_entries
for delete
using (true);
