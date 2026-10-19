begin;

-- Canonicalize the temporary sale-specific type. This intentionally updates
-- metadata rows only: document IDs, versions, storage objects, provenance,
-- review status, and historical audit entries remain untouched.
with migrated_documents as (
    update public.documents
    set document_type = 'commercial_register',
        metadata = case
            when jsonb_typeof(metadata->'automationReturn') = 'object'
             and metadata->'automationReturn' ? 'documentType'
            then jsonb_set(metadata, '{automationReturn,documentType}', to_jsonb('commercial_register'::text), true)
            else metadata
        end,
        updated_at = now()
    where document_type = 'sale_commercial_register'
    returning id, company_id, active_version_id
)
insert into public.document_audit_log (
    company_id, document_id, version_id, action, previous_values,
    new_values, reason
)
select
    migrated.company_id,
    migrated.id,
    migrated.active_version_id,
    'SALE_DOCUMENT_TYPE_CANONICALIZED',
    jsonb_build_object('documentType', 'sale_commercial_register'),
    jsonb_build_object('documentType', 'commercial_register'),
    'Migration: Vereinheitlichung des Handelsregister-Dokumenttyps.'
from migrated_documents migrated
where not exists (
    select 1
    from public.document_audit_log audit
    where audit.document_id = migrated.id
      and audit.action = 'SALE_DOCUMENT_TYPE_CANONICALIZED'
      and audit.version_id is not distinct from migrated.active_version_id
);

update public.automation_return_uploads
set document_type = 'commercial_register',
    updated_at = now()
where upload_kind = 'sale_document'
  and document_type = 'sale_commercial_register';

create or replace function public.review_automation_fixed_sale_document(
    p_company_id uuid,
    p_sale_id uuid,
    p_document_id uuid,
    p_document_version_id uuid,
    p_reviewer_id uuid,
    p_decision text,
    p_reason text default null
)
returns table(outcome text, review_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
    target_document public.documents%rowtype;
    target_version public.document_versions%rowtype;
    target_upload public.automation_return_uploads%rowtype;
    normalized_reason text;
    audit_action text;
begin
    if p_decision not in ('accepted', 'rejected') then
        raise exception 'invalid fixed document review decision';
    end if;
    normalized_reason := nullif(btrim(coalesce(p_reason, '')), '');
    if p_decision = 'rejected' and normalized_reason is null then
        raise exception 'rejection reason is required';
    end if;

    select * into target_document
    from public.documents
    where id = p_document_id
      and company_id = p_company_id
      and sale_id = p_sale_id
      and document_type in ('owner_id', 'commercial_register')
      and source = 'automation_return'
      and archive_status = 'ACTIVE'
      and active_version_id = p_document_version_id
    for update;
    if not found then
        return query select 'inactive_or_not_found'::text, null::text;
        return;
    end if;

    select * into target_version
    from public.document_versions
    where id = p_document_version_id
      and company_id = p_company_id
      and document_id = p_document_id
      and is_active = true
    for update;
    if not found then
        return query select 'inactive_or_not_found'::text, null::text;
        return;
    end if;

    select * into target_upload
    from public.automation_return_uploads
    where company_id = p_company_id
      and sale_id = p_sale_id
      and document_id = p_document_id
      and document_version_id = p_document_version_id
      and upload_kind = 'sale_document'
      and processing_status = 'completed'
      and document_type in ('owner_id', 'commercial_register')
      and signature_status = 'not_applicable'
    for update;
    if not found then
        return query select 'upload_not_found'::text, null::text;
        return;
    end if;

    if p_decision = 'accepted' and target_upload.review_status = 'accepted' then
        return query select 'idempotent'::text, target_upload.review_status;
        return;
    end if;
    if p_decision = 'rejected'
       and target_upload.review_status = 'rejected'
       and target_upload.review_reason is not distinct from normalized_reason then
        return query select 'idempotent'::text, target_upload.review_status;
        return;
    end if;
    if target_upload.review_status not in ('pending', 'needs_review') then
        return query select 'already_reviewed'::text, target_upload.review_status;
        return;
    end if;

    audit_action := case
        when p_decision = 'accepted' then 'AUTOMATION_FIXED_DOCUMENT_ACCEPTED'
        else 'AUTOMATION_FIXED_DOCUMENT_REJECTED'
    end;
    update public.automation_return_uploads
    set review_status = p_decision,
        review_reason = case when p_decision = 'rejected' then normalized_reason else null end,
        reviewed_by = p_reviewer_id,
        reviewed_at = now(),
        updated_at = now()
    where id = target_upload.id;

    update public.documents
    set status = case when p_decision = 'accepted' then 'available' else 'needs_review' end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'automationReturn',
            coalesce(metadata->'automationReturn', '{}'::jsonb) || jsonb_build_object(
                'reviewStatus', p_decision,
                'reviewReason', case when p_decision = 'rejected' then normalized_reason else null end,
                'reviewedAt', now()
            )
        ),
        updated_at = now()
    where id = target_document.id;

    insert into public.document_audit_log (
        company_id, document_id, version_id, action, previous_values,
        new_values, changed_by, reason
    ) values (
        p_company_id, p_document_id, p_document_version_id, audit_action,
        jsonb_build_object('reviewStatus', target_upload.review_status),
        jsonb_build_object('reviewStatus', p_decision),
        p_reviewer_id,
        case when p_decision = 'rejected' then normalized_reason else null end
    );

    return query select 'reviewed'::text, p_decision;
end;
$$;

create or replace function public.reclassify_sale_custom_document(
    p_company_id uuid,
    p_sale_id uuid,
    p_document_id uuid,
    p_document_version_id uuid,
    p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    target_document public.documents%rowtype;
begin
    select * into target_document
    from public.documents
    where id = p_document_id
      and company_id = p_company_id
      and sale_id = p_sale_id
      and document_type = 'sale_custom_document'
      and source = 'uploaded'
      and archive_status = 'ACTIVE'
      and active_version_id = p_document_version_id
    for update;
    if not found then return 'inactive_or_not_reclassifiable'; end if;

    if not exists (
        select 1 from public.document_versions
        where id = p_document_version_id
          and company_id = p_company_id
          and document_id = p_document_id
          and is_active = true
    ) then return 'inactive_or_not_reclassifiable'; end if;

    update public.documents
    set document_type = 'commercial_register', title = null, updated_at = now()
    where id = p_document_id;

    insert into public.document_audit_log (
        company_id, document_id, version_id, action, previous_values,
        new_values, changed_by, reason
    ) values (
        p_company_id, p_document_id, p_document_version_id,
        'SALE_DOCUMENT_RECLASSIFIED',
        jsonb_build_object('documentType', target_document.document_type, 'title', target_document.title),
        jsonb_build_object('documentType', 'commercial_register', 'title', 'Handelsregisterauszug'),
        p_actor_id,
        'Manuelle Umklassifizierung nach ausdrücklicher Bestätigung.'
    );

    return 'reclassified';
end;
$$;

revoke all on function public.review_automation_fixed_sale_document(uuid, uuid, uuid, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.review_automation_fixed_sale_document(uuid, uuid, uuid, uuid, uuid, text, text)
to service_role;

revoke all on function public.reclassify_sale_custom_document(uuid, uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.reclassify_sale_custom_document(uuid, uuid, uuid, uuid, uuid)
to service_role;

commit;
