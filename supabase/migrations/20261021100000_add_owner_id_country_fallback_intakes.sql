begin;

create table if not exists public.automation_owner_id_intakes (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    idempotency_key text not null,
    request_fingerprint text not null,
    status text not null default 'open' check (status in ('open', 'assigned', 'ignored')),
    processing_status text not null default 'processing' check (processing_status in ('processing', 'ready', 'error')),
    document_type text not null default 'owner_id' check (document_type = 'owner_id'),
    received_at timestamptz not null,
    return_id text not null,
    source_email_id text not null,
    source_attachment_id text not null,
    original_upload_id uuid not null references public.automation_return_uploads(id) on delete restrict,
    original_page_numbers integer[] not null default '{}',
    original_file_name text not null,
    derived_storage_bucket text,
    derived_storage_path text,
    derived_file_name text,
    derived_mime_type text,
    derived_file_size_bytes bigint,
    derived_sha256 text,
    country_source text,
    country_code text,
    reason_code text not null,
    candidate_sale_ids uuid[] not null default '{}',
    assignment_source text check (assignment_source in ('direct_identifier', 'same_email_identifier', 'country_fallback', 'manual')),
    rule_version text not null,
    search_start_date date,
    search_end_date date,
    decision_metadata jsonb not null default '{}'::jsonb,
    sale_id uuid references public.sales(id) on delete restrict,
    document_id uuid references public.documents(id) on delete restrict,
    document_version_id uuid references public.document_versions(id) on delete restrict,
    assigned_by uuid,
    assigned_at timestamptz,
    ignored_by uuid,
    ignored_at timestamptz,
    ignored_reason text,
    error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint automation_owner_id_intakes_idempotency_key unique (company_id, idempotency_key),
    constraint automation_owner_id_intakes_source_lengths check (
        length(return_id) between 1 and 500 and length(source_email_id) between 1 and 500
        and length(source_attachment_id) between 1 and 500
    ),
    constraint automation_owner_id_intakes_assignment_check check (
        (status = 'assigned' and sale_id is not null and assigned_at is not null)
        or status <> 'assigned'
    ),
    constraint automation_owner_id_intakes_ignored_check check (
        (status = 'ignored' and ignored_at is not null and ignored_reason is not null)
        or status <> 'ignored'
    )
);

create index if not exists automation_owner_id_intakes_open_idx
on public.automation_owner_id_intakes(company_id, received_at desc)
where status = 'open';

create index if not exists automation_owner_id_intakes_sale_idx
on public.automation_owner_id_intakes(company_id, sale_id)
where sale_id is not null;

create table if not exists public.automation_owner_id_intake_events (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    intake_id uuid not null references public.automation_owner_id_intakes(id) on delete restrict,
    event_type text not null check (event_type in ('registered', 'assigned', 'ignored', 'processing_error')),
    actor_id uuid,
    sale_id uuid references public.sales(id) on delete restrict,
    reason text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists automation_owner_id_intake_events_lookup_idx
on public.automation_owner_id_intake_events(company_id, intake_id, created_at);

alter table public.automation_owner_id_intakes enable row level security;
alter table public.automation_owner_id_intake_events enable row level security;

comment on table public.automation_owner_id_intakes is
'Durable company-scoped queue and decision audit for owner ID documents received through the automation API.';

create or replace function public.finalize_automation_owner_id_intake(
    p_intake_id uuid,
    p_company_id uuid,
    p_processing_status text,
    p_error_code text default null
)
returns table(outcome text, document_id uuid, document_version_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
    target public.automation_owner_id_intakes%rowtype;
    target_sale public.sales%rowtype;
    target_document_id uuid;
    target_version_id uuid;
    target_upload_id uuid;
begin
    select * into target from public.automation_owner_id_intakes
    where id = p_intake_id and company_id = p_company_id for update;
    if not found then raise exception 'owner id intake not found'; end if;
    if target.processing_status = 'ready' then
        return query select 'already_completed'::text, target.document_id, target.document_version_id;
        return;
    end if;
    if target.processing_status <> 'processing' then raise exception 'owner id intake is not processing'; end if;
    if p_processing_status not in ('ready', 'error') then raise exception 'invalid processing status'; end if;

    if p_processing_status = 'error' then
        update public.automation_owner_id_intakes set status = 'open', processing_status = 'error',
            sale_id = null, assignment_source = null, assigned_at = null,
            error_code = coalesce(p_error_code, 'document_processing_failed'), updated_at = now()
        where id = target.id;
        insert into public.automation_owner_id_intake_events(company_id, intake_id, event_type, reason)
        values (p_company_id, target.id, 'processing_error', coalesce(p_error_code, 'document_processing_failed'));
        return query select 'error'::text, null::uuid, null::uuid;
        return;
    end if;

    if target.sale_id is not null and target.derived_storage_path is null then
        raise exception 'assigned owner id document has no private storage path';
    end if;

    if target.derived_storage_path is not null and target.sale_id is not null then
        select * into target_sale from public.sales where id = target.sale_id and company_id = p_company_id;
        if not found or target_sale.status = 'cancelled' then raise exception 'assigned sale is not valid'; end if;

        insert into public.documents (
            company_id, sale_id, vehicle_id, customer_id, document_type, source, status,
            file_name, file_path, mime_type, file_size, generated_by_system, title, metadata
        ) values (
            p_company_id, target_sale.id, target_sale.vehicle_id, target_sale.buyer_customer_id,
            'owner_id', 'automation_return', 'needs_review', target.derived_file_name,
            target.derived_storage_path, target.derived_mime_type, target.derived_file_size_bytes,
            false, 'Ausweis Inhaber Käufer', jsonb_build_object('automationReturn', jsonb_build_object(
                'ownerIdIntakeId', target.id, 'assignmentSource', target.assignment_source,
                'reasonCode', target.reason_code, 'countrySource', target.country_source,
                'countryCode', target.country_code, 'receivedAt', target.received_at,
                'searchStartDate', target.search_start_date, 'searchEndDate', target.search_end_date,
                'ruleVersion', target.rule_version, 'candidateSaleIds', to_jsonb(target.candidate_sale_ids),
                'originalUploadId', target.original_upload_id, 'originalPageNumbers', to_jsonb(target.original_page_numbers),
                'reviewStatus', 'needs_review', 'signatureStatus', 'not_applicable'
            ))
        ) returning id into target_document_id;

        select active_version_id into target_version_id from public.documents where id = target_document_id;
        insert into public.automation_return_uploads (
            company_id, upload_kind, idempotency_key, request_fingerprint, processing_status,
            sale_id, sale_identifier, document_id, document_version_id, parent_original_upload_id,
            document_type, original_file_name, storage_bucket, storage_path, mime_type,
            file_size_bytes, sha256, return_id, source_email_id, source_attachment_id,
            original_page_numbers, received_at, signature_status, review_status, completed_at
        ) values (
            p_company_id, 'sale_document', 'owner-id-intake:' || target.id::text,
            target.request_fingerprint, 'completed', target_sale.id, target_sale.sale_identifier,
            target_document_id, target_version_id, target.original_upload_id, 'owner_id',
            target.derived_file_name, target.derived_storage_bucket, target.derived_storage_path,
            target.derived_mime_type, target.derived_file_size_bytes, target.derived_sha256,
            target.return_id, target.source_email_id, target.source_attachment_id,
            target.original_page_numbers, target.received_at, 'not_applicable', 'needs_review', now()
        ) returning id into target_upload_id;

        update public.documents set metadata = metadata || jsonb_build_object('automationReturn',
            metadata->'automationReturn' || jsonb_build_object('uploadId', target_upload_id))
        where id = target_document_id;
    end if;

    update public.automation_owner_id_intakes set processing_status = 'ready',
        document_id = target_document_id, document_version_id = target_version_id,
        error_code = null, updated_at = now()
    where id = target.id;
    insert into public.automation_owner_id_intake_events(company_id, intake_id, event_type, sale_id)
    values (p_company_id, target.id, 'registered', target.sale_id);
    return query select 'completed'::text, target_document_id, target_version_id;
end;
$$;

create or replace function public.assign_automation_owner_id_intake(
    p_intake_id uuid,
    p_company_id uuid,
    p_sale_id uuid,
    p_actor_id uuid
)
returns table(outcome text, document_id uuid, document_version_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
    target public.automation_owner_id_intakes%rowtype;
    target_sale public.sales%rowtype;
    target_document_id uuid;
    target_version_id uuid;
    target_upload_id uuid;
begin
    select * into target from public.automation_owner_id_intakes
    where id = p_intake_id and company_id = p_company_id for update;
    if not found then return query select 'not_found'::text, null::uuid, null::uuid; return; end if;
    if target.status = 'assigned' then
        if target.sale_id = p_sale_id then
            return query select 'already_assigned'::text, target.document_id, target.document_version_id;
        else
            return query select 'conflict'::text, target.document_id, target.document_version_id;
        end if;
        return;
    end if;
    if target.status <> 'open' or target.processing_status not in ('ready', 'error') then
        return query select 'not_open'::text, null::uuid, null::uuid; return;
    end if;
    select * into target_sale from public.sales where id = p_sale_id and company_id = p_company_id;
    if not found or target_sale.status = 'cancelled' then
        return query select 'sale_not_found'::text, null::uuid, null::uuid; return;
    end if;
    if target.derived_storage_path is null then
        return query select 'document_unavailable'::text, null::uuid, null::uuid; return;
    end if;

    insert into public.documents (
        company_id, sale_id, vehicle_id, customer_id, document_type, source, status,
        file_name, file_path, mime_type, file_size, generated_by_system, title, metadata
    ) values (
        p_company_id, target_sale.id, target_sale.vehicle_id, target_sale.buyer_customer_id,
        'owner_id', 'automation_return', 'needs_review', target.derived_file_name,
        target.derived_storage_path, target.derived_mime_type, target.derived_file_size_bytes,
        false, 'Ausweis Inhaber Käufer', jsonb_build_object('automationReturn', jsonb_build_object(
            'ownerIdIntakeId', target.id, 'assignmentSource', 'manual', 'reasonCode', target.reason_code,
            'countrySource', target.country_source, 'countryCode', target.country_code,
            'receivedAt', target.received_at, 'ruleVersion', target.rule_version,
            'originalUploadId', target.original_upload_id, 'originalPageNumbers', to_jsonb(target.original_page_numbers),
            'reviewStatus', 'needs_review', 'signatureStatus', 'not_applicable'
        ))
    ) returning id into target_document_id;
    select active_version_id into target_version_id from public.documents where id = target_document_id;

    insert into public.automation_return_uploads (
        company_id, upload_kind, idempotency_key, request_fingerprint, processing_status,
        sale_id, sale_identifier, document_id, document_version_id, parent_original_upload_id,
        document_type, original_file_name, storage_bucket, storage_path, mime_type,
        file_size_bytes, sha256, return_id, source_email_id, source_attachment_id,
        original_page_numbers, received_at, signature_status, review_status, completed_at
    ) values (
        p_company_id, 'sale_document', 'owner-id-intake:' || target.id::text,
        target.request_fingerprint, 'completed', target_sale.id, target_sale.sale_identifier,
        target_document_id, target_version_id, target.original_upload_id, 'owner_id',
        target.derived_file_name, target.derived_storage_bucket, target.derived_storage_path,
        target.derived_mime_type, target.derived_file_size_bytes, target.derived_sha256,
        target.return_id, target.source_email_id, target.source_attachment_id,
        target.original_page_numbers, target.received_at, 'not_applicable', 'needs_review', now()
    ) returning id into target_upload_id;
    update public.documents set metadata = metadata || jsonb_build_object('automationReturn',
        metadata->'automationReturn' || jsonb_build_object('uploadId', target_upload_id))
    where id = target_document_id;

    update public.automation_owner_id_intakes set status = 'assigned', assignment_source = 'manual',
        sale_id = target_sale.id, document_id = target_document_id, document_version_id = target_version_id,
        assigned_by = p_actor_id, assigned_at = now(), updated_at = now()
    where id = target.id;
    insert into public.automation_owner_id_intake_events(company_id, intake_id, event_type, actor_id, sale_id)
    values (p_company_id, target.id, 'assigned', p_actor_id, target_sale.id);
    return query select 'assigned'::text, target_document_id, target_version_id;
end;
$$;

create or replace function public.ignore_automation_owner_id_intake(
    p_intake_id uuid,
    p_company_id uuid,
    p_actor_id uuid,
    p_reason text
)
returns text
language plpgsql security definer set search_path = public
as $$
declare target public.automation_owner_id_intakes%rowtype;
begin
    select * into target from public.automation_owner_id_intakes
    where id = p_intake_id and company_id = p_company_id for update;
    if not found then return 'not_found'; end if;
    if target.status = 'ignored' then return 'already_ignored'; end if;
    if target.status <> 'open' then return 'not_open'; end if;
    if length(btrim(p_reason)) not between 1 and 500 then raise exception 'invalid ignore reason'; end if;
    update public.automation_owner_id_intakes set status = 'ignored', ignored_by = p_actor_id,
        ignored_at = now(), ignored_reason = btrim(p_reason), updated_at = now() where id = target.id;
    insert into public.automation_owner_id_intake_events(company_id, intake_id, event_type, actor_id, reason)
    values (p_company_id, target.id, 'ignored', p_actor_id, btrim(p_reason));
    return 'ignored';
end;
$$;

revoke all on function public.finalize_automation_owner_id_intake(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.assign_automation_owner_id_intake(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ignore_automation_owner_id_intake(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_automation_owner_id_intake(uuid, uuid, text, text) to service_role;
grant execute on function public.assign_automation_owner_id_intake(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.ignore_automation_owner_id_intake(uuid, uuid, uuid, text) to service_role;

commit;
