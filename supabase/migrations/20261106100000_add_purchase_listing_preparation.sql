create table if not exists public.purchase_listing_jobs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    purchase_case_id uuid not null references public.purchase_cases(id) on delete cascade,
    vehicle_id uuid not null references public.vehicles(id) on delete restrict,
    source_revision text not null check (source_revision ~ '^[a-f0-9]{64}$'),
    status text not null default 'queued'
        check (status in ('queued', 'processing', 'needs_input', 'draft_ready', 'failed')),
    source_snapshot jsonb not null default '{}'::jsonb,
    confirmed_vehicle_data jsonb not null default '{}'::jsonb,
    extracted_suggestions jsonb not null default '{}'::jsonb,
    conflicts jsonb not null default '[]'::jsonb,
    missing_fields jsonb not null default '[]'::jsonb,
    title text,
    description text,
    selected_image_ids uuid[] not null default '{}',
    manual_revision integer not null default 0 check (manual_revision >= 0),
    result_fingerprint text,
    dispatch_token uuid,
    lease_expires_at timestamptz,
    attempt_count integer not null default 0 check (attempt_count >= 0),
    last_error_code text,
    last_error text,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    unique (company_id, id),
    check (jsonb_typeof(source_snapshot) = 'object'),
    check (jsonb_typeof(confirmed_vehicle_data) = 'object'),
    check (jsonb_typeof(extracted_suggestions) = 'object'),
    check (jsonb_typeof(conflicts) = 'array'),
    check (jsonb_typeof(missing_fields) = 'array')
);

create unique index if not exists purchase_listing_jobs_active_revision_uidx
    on public.purchase_listing_jobs(company_id, purchase_case_id, source_revision)
    where status in ('queued', 'processing');
create index if not exists purchase_listing_jobs_purchase_created_idx
    on public.purchase_listing_jobs(company_id, purchase_case_id, created_at desc);
create index if not exists purchase_listing_jobs_lease_idx
    on public.purchase_listing_jobs(status, lease_expires_at)
    where status in ('queued', 'processing');

create table if not exists public.purchase_listing_job_images (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    job_id uuid not null,
    storage_path text not null unique,
    file_name text not null,
    mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
    file_size bigint not null check (file_size > 0 and file_size <= 10485760),
    sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
    source_drive_item_id text not null,
    source_e_tag text not null,
    upload_status text not null default 'pending' check (upload_status in ('pending', 'available')),
    created_at timestamptz not null default now(),
    unique (job_id, source_drive_item_id, source_e_tag),
    constraint purchase_listing_job_images_job_company_fk
        foreign key (company_id, job_id)
        references public.purchase_listing_jobs(company_id, id) on delete cascade
);
create index if not exists purchase_listing_job_images_job_idx
    on public.purchase_listing_job_images(company_id, job_id, created_at);

alter table public.purchase_listing_jobs enable row level security;
alter table public.purchase_listing_job_images enable row level security;
revoke all on public.purchase_listing_jobs from public, anon, authenticated;
revoke all on public.purchase_listing_job_images from public, anon, authenticated;
grant all on public.purchase_listing_jobs to service_role;
grant all on public.purchase_listing_job_images to service_role;

create or replace function public.validate_purchase_listing_job_identity()
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
        or new.source_revision is distinct from old.source_revision
        or new.source_snapshot is distinct from old.source_snapshot
        or new.confirmed_vehicle_data is distinct from old.confirmed_vehicle_data
    ) then
        raise exception 'purchase listing source identity is immutable' using errcode = '23514';
    end if;

    if not exists (
        select 1 from public.purchase_cases p
        where p.id = new.purchase_case_id
          and p.company_id = new.company_id
          and p.vehicle_id = new.vehicle_id
    ) then
        raise exception 'purchase listing identity mismatch' using errcode = '23514';
    end if;
    return new;
end;
$$;
drop trigger if exists purchase_listing_job_identity_guard on public.purchase_listing_jobs;
create trigger purchase_listing_job_identity_guard
    before insert or update on public.purchase_listing_jobs
    for each row execute function public.validate_purchase_listing_job_identity();
revoke all on function public.validate_purchase_listing_job_identity() from public, anon, authenticated;

create or replace function public.claim_purchase_listing_job(
    p_job_id uuid,
    p_company_id uuid,
    p_lease_seconds integer default 900
)
returns setof public.purchase_listing_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update public.purchase_listing_jobs j
    set status = 'processing',
        dispatch_token = coalesce(j.dispatch_token, gen_random_uuid()),
        lease_expires_at = now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600))),
        attempt_count = j.attempt_count + 1,
        last_error_code = null,
        last_error = null,
        updated_at = now()
    where j.id = p_job_id
      and j.company_id = p_company_id
      and j.manual_revision = 0
      and (
          j.status = 'queued'
          or (j.status = 'processing' and j.lease_expires_at <= now())
      )
    returning j.*;
end;
$$;
revoke all on function public.claim_purchase_listing_job(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_purchase_listing_job(uuid, uuid, integer) to service_role;

comment on table public.purchase_listing_jobs is
    'Private durable, revision-bound background jobs and editable listing drafts for vehicle purchases.';
comment on table public.purchase_listing_job_images is
    'Private immutable OneDrive image snapshots attached to one listing preparation job.';
