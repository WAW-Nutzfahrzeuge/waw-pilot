create table if not exists public.purchase_vehicle_folder_jobs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    purchase_case_id uuid not null references public.purchase_cases(id) on delete cascade,
    vehicle_id uuid not null references public.vehicles(id) on delete restrict,
    folder_name text not null check (char_length(folder_name) between 1 and 220),
    drive_id text,
    root_folder_id text,
    folder_id text,
    folder_url text,
    registration_folder_id text,
    images_folder_id text,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'ready', 'error')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    lease_token uuid,
    lease_expires_at timestamptz,
    last_error_code text,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    unique (company_id, purchase_case_id),
    check ((status = 'ready') = (
        folder_id is not null
        and folder_url is not null
        and registration_folder_id is not null
        and images_folder_id is not null
        and drive_id is not null
        and root_folder_id is not null
    )),
    check (status <> 'ready' or folder_url ~* '^https://([^/]+\.)?sharepoint\.com(/|$)|^https://(1drv\.ms|onedrive\.live\.com)(/|$)')
);

create index if not exists purchase_vehicle_folder_jobs_claim_idx
    on public.purchase_vehicle_folder_jobs(status, lease_expires_at, created_at)
    where status in ('pending', 'processing', 'error');

create index if not exists purchase_vehicle_folder_jobs_purchase_idx
    on public.purchase_vehicle_folder_jobs(company_id, purchase_case_id);

comment on table public.purchase_vehicle_folder_jobs is
    'Durable, server-only n8n/OneDrive folder creation state for purchase vehicle files.';
comment on column public.purchase_vehicle_folder_jobs.folder_name is
    'Immutable human-readable name persisted before the first n8n call; retries reuse it.';

alter table public.purchase_vehicle_folder_jobs enable row level security;
revoke all on public.purchase_vehicle_folder_jobs from public, anon, authenticated;
grant all on public.purchase_vehicle_folder_jobs to service_role;

create or replace function public.validate_purchase_vehicle_folder_job_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'UPDATE' and (
        new.company_id is distinct from old.company_id
        or new.purchase_case_id is distinct from old.purchase_case_id
        or new.vehicle_id is distinct from old.vehicle_id
        or new.folder_name is distinct from old.folder_name
        or (old.drive_id is not null and new.drive_id is distinct from old.drive_id)
        or (old.root_folder_id is not null and new.root_folder_id is distinct from old.root_folder_id)
    ) then
        raise exception 'purchase folder job identity is immutable' using errcode = '23514';
    end if;

    if not exists (
        select 1
        from public.purchase_cases p
        where p.id = new.purchase_case_id
          and p.company_id = new.company_id
          and p.vehicle_id = new.vehicle_id
    ) then
        raise exception 'purchase and vehicle do not belong to the same company purchase' using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists purchase_vehicle_folder_job_identity_guard
    on public.purchase_vehicle_folder_jobs;
create trigger purchase_vehicle_folder_job_identity_guard
    before insert or update on public.purchase_vehicle_folder_jobs
    for each row execute function public.validate_purchase_vehicle_folder_job_identity();

revoke all on function public.validate_purchase_vehicle_folder_job_identity() from public, anon, authenticated;

create or replace function public.claim_purchase_vehicle_folder_job(
    p_job_id uuid,
    p_lease_seconds integer default 120
)
returns setof public.purchase_vehicle_folder_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update public.purchase_vehicle_folder_jobs j
    set status = 'processing',
        attempt_count = j.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300))),
        last_error_code = null,
        last_error = null,
        started_at = coalesce(j.started_at, now()),
        updated_at = now()
    where j.id = p_job_id
      and j.status <> 'ready'
      and (
          j.status in ('pending', 'error')
          or (j.status = 'processing' and j.lease_expires_at <= now())
      )
    returning j.*;
end;
$$;

create or replace function public.complete_purchase_vehicle_folder_job(
    p_job_id uuid,
    p_lease_token uuid,
    p_event_id text,
    p_purchase_id uuid,
    p_vehicle_id uuid,
    p_folder_name text,
    p_drive_id text,
    p_folder_id text,
    p_folder_url text,
    p_registration_folder_id text,
    p_images_folder_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.purchase_vehicle_folder_jobs j
    set status = 'ready',
        folder_id = p_folder_id,
        folder_url = p_folder_url,
        registration_folder_id = p_registration_folder_id,
        images_folder_id = p_images_folder_id,
        last_error_code = null,
        last_error = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = now(),
        updated_at = now()
    where j.id = p_job_id
      and j.status = 'processing'
      and j.lease_token = p_lease_token
      and p_event_id = j.id::text
      and p_purchase_id = j.purchase_case_id
      and p_vehicle_id = j.vehicle_id
      and p_folder_name = j.folder_name
      and p_drive_id = j.drive_id
      and nullif(btrim(p_folder_id), '') is not null
      and nullif(btrim(p_registration_folder_id), '') is not null
      and nullif(btrim(p_images_folder_id), '') is not null
      and p_folder_url ~ '^https://';

    return found;
end;
$$;

revoke all on function public.claim_purchase_vehicle_folder_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_purchase_vehicle_folder_job(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_purchase_vehicle_folder_job(uuid, integer) to service_role;
grant execute on function public.complete_purchase_vehicle_folder_job(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text) to service_role;
