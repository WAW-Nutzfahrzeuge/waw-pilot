-- public.document_audit_log has row level security enabled (see
-- 20260721143000_add_document_center_versioning.sql) but only ever received a
-- SELECT policy. No INSERT policy was ever created, so every insert from an
-- authenticated (anon-key, session-bound) request has always been rejected by
-- Postgres' default-deny RLS behavior. ArchiveDocumentUseCase has therefore
-- never been able to write an audit entry since it was introduced. This adds
-- the missing INSERT policy, scoped the same way as the existing SELECT
-- policy: a user may only write an audit row for a document that belongs to
-- their own company.

drop policy if exists "Users can create document audit log entries for their company" on public.document_audit_log;
create policy "Users can create document audit log entries for their company"
on public.document_audit_log
for insert
with check (
    exists (
        select 1
        from public.documents document
        where document.id = document_audit_log.document_id
          and document.company_id = document_audit_log.company_id
    )
);
