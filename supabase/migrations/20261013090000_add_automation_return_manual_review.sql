alter table public.automation_return_uploads
    add column if not exists reviewed_by uuid,
    add column if not exists reviewed_at timestamptz;

comment on column public.automation_return_uploads.reviewed_by is
'Authenticated WAW user who manually accepted or rejected this exact automated return version.';

comment on column public.automation_return_uploads.reviewed_at is
'Timestamp of the final manual review decision. A visible signature is not an authenticity assessment.';

create unique index if not exists document_audit_log_one_automation_return_review_per_version
on public.document_audit_log(company_id, version_id)
where action in ('AUTOMATION_RETURN_ACCEPTED', 'AUTOMATION_RETURN_REJECTED');

create or replace function public.review_automation_return_document(
    p_company_id uuid,
    p_sale_id uuid,
    p_document_id uuid,
    p_document_version_id uuid,
    p_reviewer_id uuid,
    p_decision text,
    p_reason text default null
)
returns table(outcome text, review_status text, signature_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
    target_document public.documents%rowtype;
    target_version public.document_versions%rowtype;
    target_upload public.automation_return_uploads%rowtype;
    next_review_status text;
    next_signature_status text;
    normalized_reason text;
    audit_action text;
begin
    if p_decision not in ('accepted', 'rejected') then
        raise exception 'invalid automation return review decision';
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
      and source = 'automation_return'
      and archive_status = 'ACTIVE'
    for update;

    if not found then
        return query select 'not_found'::text, null::text, null::text;
        return;
    end if;

    if target_document.active_version_id is distinct from p_document_version_id then
        return query select 'inactive_version'::text, null::text, null::text;
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
        return query select 'inactive_version'::text, null::text, null::text;
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
    for update;

    if not found then
        return query select 'upload_not_found'::text, null::text, null::text;
        return;
    end if;

    if p_decision = 'accepted'
       and target_upload.review_status = 'accepted'
       and target_upload.signature_status = 'present' then
        return query select 'idempotent'::text, target_upload.review_status, target_upload.signature_status;
        return;
    end if;

    if p_decision = 'rejected'
       and target_upload.review_status = 'rejected'
       and target_upload.review_reason is not distinct from normalized_reason then
        return query select 'idempotent'::text, target_upload.review_status, target_upload.signature_status;
        return;
    end if;

    if target_upload.review_status not in ('pending', 'needs_review') then
        return query select 'already_reviewed'::text, target_upload.review_status, target_upload.signature_status;
        return;
    end if;

    next_review_status := p_decision;
    next_signature_status := case
        when p_decision = 'accepted' then 'present'
        else target_upload.signature_status
    end;
    audit_action := case
        when p_decision = 'accepted' then 'AUTOMATION_RETURN_ACCEPTED'
        else 'AUTOMATION_RETURN_REJECTED'
    end;

    update public.automation_return_uploads
    set review_status = next_review_status,
        signature_status = next_signature_status,
        review_reason = case when p_decision = 'rejected' then normalized_reason else null end,
        reviewed_by = p_reviewer_id,
        reviewed_at = now(),
        updated_at = now()
    where id = target_upload.id;

    update public.documents
    set status = case when p_decision = 'accepted' then 'available' else 'needs_review' end,
        updated_at = now()
    where id = target_document.id;

    insert into public.document_audit_log (
        company_id,
        document_id,
        version_id,
        action,
        previous_values,
        new_values,
        changed_by,
        reason
    ) values (
        p_company_id,
        p_document_id,
        p_document_version_id,
        audit_action,
        jsonb_build_object(
            'reviewStatus', target_upload.review_status,
            'signatureStatus', target_upload.signature_status
        ),
        jsonb_build_object(
            'reviewStatus', next_review_status,
            'signatureStatus', next_signature_status
        ),
        p_reviewer_id,
        case when p_decision = 'rejected' then normalized_reason else null end
    );

    return query select 'reviewed'::text, next_review_status, next_signature_status;
end;
$$;

revoke all on function public.review_automation_return_document(uuid, uuid, uuid, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.review_automation_return_document(uuid, uuid, uuid, uuid, uuid, text, text)
to service_role;
