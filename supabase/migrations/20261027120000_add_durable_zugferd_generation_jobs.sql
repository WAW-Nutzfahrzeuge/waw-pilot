create table if not exists public.zugferd_generation_jobs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    sale_id uuid not null references public.sales(id) on delete cascade,
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    generation_key text not null check (generation_key ~ '^[a-f0-9]{64}$'),
    request_data jsonb not null,
    input_storage_path text not null,
    result_storage_path text,
    result_metadata jsonb,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed', 'superseded')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    lease_expires_at timestamptz,
    error_code text,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    finalized_at timestamptz,
    unique (company_id, invoice_id, generation_key)
);

create index if not exists zugferd_generation_jobs_claim_idx
    on public.zugferd_generation_jobs(status, created_at)
    where status in ('pending', 'processing');

create index if not exists zugferd_generation_jobs_invoice_idx
    on public.zugferd_generation_jobs(company_id, invoice_id, created_at desc);

alter table public.zugferd_generation_jobs enable row level security;
revoke all on public.zugferd_generation_jobs from public, anon, authenticated;
grant all on public.zugferd_generation_jobs to service_role;

create or replace function public.enqueue_zugferd_generation_job(
    p_company_id uuid,
    p_sale_id uuid,
    p_invoice_id uuid,
    p_generation_key text,
    p_request_data jsonb,
    p_input_storage_path text
)
returns table(job_id uuid, job_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
    existing public.zugferd_generation_jobs%rowtype;
    inserted public.zugferd_generation_jobs%rowtype;
begin
    if p_generation_key !~ '^[a-f0-9]{64}$' then
        raise exception 'invalid generation key' using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.invoices i
        where i.id = p_invoice_id
          and i.company_id = p_company_id
          and i.sale_id = p_sale_id
          and i.invoice_type = 'standard'
    ) then
        raise exception 'invoice is not eligible for ZUGFeRD generation' using errcode = '23514';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_invoice_id::text || ':zugferd', 0));

    update public.zugferd_generation_jobs
    set status = 'superseded',
        updated_at = now()
    where company_id = p_company_id
      and invoice_id = p_invoice_id
      and status = 'pending'
      and generation_key <> p_generation_key;

    insert into public.zugferd_generation_jobs (
        company_id,
        sale_id,
        invoice_id,
        generation_key,
        request_data,
        input_storage_path
    ) values (
        p_company_id,
        p_sale_id,
        p_invoice_id,
        p_generation_key,
        p_request_data,
        p_input_storage_path
    )
    on conflict (company_id, invoice_id, generation_key) do update
    set request_data = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then excluded.request_data
            else zugferd_generation_jobs.request_data
        end,
        input_storage_path = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then excluded.input_storage_path
            else zugferd_generation_jobs.input_storage_path
        end,
        status = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then 'pending'
            else zugferd_generation_jobs.status
        end,
        attempt_count = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then 0
            else zugferd_generation_jobs.attempt_count
        end,
        lease_expires_at = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then null
            else zugferd_generation_jobs.lease_expires_at
        end,
        error_code = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then null
            else zugferd_generation_jobs.error_code
        end,
        error_message = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then null
            else zugferd_generation_jobs.error_message
        end,
        result_storage_path = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then null
            else zugferd_generation_jobs.result_storage_path
        end,
        result_metadata = case
            when zugferd_generation_jobs.status in ('failed', 'superseded') then null
            else zugferd_generation_jobs.result_metadata
        end,
        updated_at = now()
    returning * into inserted;

    if inserted.status in ('pending', 'processing') or (
        inserted.status = 'completed'
        and exists (
            select 1 from public.invoices i
            where i.id = p_invoice_id
              and i.company_id = p_company_id
              and i.zugferd_validation_status is distinct from 'valid'
        )
    ) then
        update public.invoices
        set zugferd_validation_status = 'pending',
            zugferd_generation_started_at = now(),
            zugferd_validation_summary = jsonb_build_object(
                'status', 'pending',
                'renderJobId', inserted.id,
                'queuedAt', inserted.created_at,
                'generationKey', inserted.generation_key
            )
        where id = p_invoice_id and company_id = p_company_id;
    end if;

    return query select inserted.id, inserted.status;
end;
$$;

create or replace function public.claim_zugferd_generation_job()
returns setof public.zugferd_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.zugferd_generation_jobs
    set status = 'failed',
        request_data = '{}'::jsonb,
        error_code = 'RETRY_LIMIT',
        error_message = 'Der ZUGFeRD-Auftrag konnte nach mehreren Wiederanläufen nicht fortgesetzt werden.',
        lease_expires_at = null,
        updated_at = now()
    where status = 'processing'
      and lease_expires_at < now()
      and attempt_count >= 3;

    return query
    with candidate as (
        select j.id
        from public.zugferd_generation_jobs j
        where j.status = 'pending'
           or (j.status = 'processing' and j.lease_expires_at < now() and j.attempt_count < 3)
        order by j.created_at asc
        for update skip locked
        limit 1
    )
    update public.zugferd_generation_jobs j
    set status = 'processing',
        attempt_count = j.attempt_count + 1,
        started_at = coalesce(j.started_at, now()),
        lease_expires_at = now() + interval '10 minutes',
        updated_at = now()
    from candidate c
    where j.id = c.id
    returning j.*;
end;
$$;

create or replace function public.complete_zugferd_generation_job(
    p_job_id uuid,
    p_result_storage_path text,
    p_result_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.zugferd_generation_jobs
    set status = 'completed',
        result_storage_path = p_result_storage_path,
        result_metadata = p_result_metadata,
        error_code = null,
        error_message = null,
        lease_expires_at = null,
        completed_at = now(),
        updated_at = now()
    where id = p_job_id and status = 'processing';
    return found;
end;
$$;

create or replace function public.fail_zugferd_generation_job(
    p_job_id uuid,
    p_error_code text,
    p_error_message text,
    p_issues jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.zugferd_generation_jobs
    set status = 'failed',
        request_data = '{}'::jsonb,
        result_metadata = jsonb_build_object('issues', coalesce(p_issues, '[]'::jsonb)),
        error_code = left(coalesce(p_error_code, 'GENERATION_FAILED'), 80),
        error_message = left(coalesce(p_error_message, 'ZUGFeRD-Auftrag fehlgeschlagen.'), 500),
        lease_expires_at = null,
        updated_at = now()
    where id = p_job_id and status = 'processing';
    return found;
end;
$$;

create or replace function public.finalize_zugferd_generation_job(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.zugferd_generation_jobs
    set finalized_at = coalesce(finalized_at, now()),
        request_data = '{}'::jsonb,
        updated_at = now()
    where id = p_job_id and status = 'completed';
    return found;
end;
$$;

create or replace function public.claim_zugferd_generation_finalization(p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    target public.zugferd_generation_jobs%rowtype;
begin
    select * into target
    from public.zugferd_generation_jobs
    where id = p_job_id and status = 'completed';

    if not found then return false; end if;

    update public.invoices i
    set zugferd_validation_summary = jsonb_build_object(
        'status', 'finalizing',
        'renderJobId', target.id,
        'finalizationStartedAt', now()
    )
    where i.id = target.invoice_id
      and i.company_id = target.company_id
      and i.zugferd_validation_status = 'pending'
      and i.zugferd_validation_summary ->> 'renderJobId' = target.id::text
      and (
          i.zugferd_validation_summary ->> 'status' = 'pending'
          or (
              i.zugferd_validation_summary ->> 'status' = 'finalizing'
              and nullif(i.zugferd_validation_summary ->> 'finalizationStartedAt', '')::timestamptz < now() - interval '3 minutes'
          )
      );

    return found;
end;
$$;

revoke all on function public.enqueue_zugferd_generation_job(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.claim_zugferd_generation_job() from public, anon, authenticated;
revoke all on function public.complete_zugferd_generation_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_zugferd_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finalize_zugferd_generation_job(uuid) from public, anon, authenticated;
revoke all on function public.claim_zugferd_generation_finalization(uuid) from public, anon, authenticated;

grant execute on function public.enqueue_zugferd_generation_job(uuid, uuid, uuid, text, jsonb, text) to service_role;
grant execute on function public.claim_zugferd_generation_job() to service_role;
grant execute on function public.complete_zugferd_generation_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_zugferd_generation_job(uuid, text, text, jsonb) to service_role;
grant execute on function public.finalize_zugferd_generation_job(uuid) to service_role;
grant execute on function public.claim_zugferd_generation_finalization(uuid) to service_role;
