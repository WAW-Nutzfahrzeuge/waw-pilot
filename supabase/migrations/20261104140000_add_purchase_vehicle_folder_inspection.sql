-- Add a durable, separate inspection lease. Folder creation and the
-- purchase.folder.ensure request contract remain unchanged.
alter table public.purchase_vehicle_folder_jobs
    add column if not exists check_lease_token uuid,
    add column if not exists check_lease_expires_at timestamptz,
    add column if not exists folder_event_id text;

-- Preserve the event identity used by existing jobs. A confirmed manual
-- recreation receives a new stable identity; retries keep that identity.
update public.purchase_vehicle_folder_jobs
set folder_event_id = id::text
where folder_event_id is null;

alter table public.purchase_vehicle_folder_jobs
    alter column folder_event_id set default gen_random_uuid()::text,
    alter column folder_event_id set not null;

-- A non-ready row may retain the last known folder mapping while it is being
-- checked or recreated. Only ready rows require the full folder mapping.
alter table public.purchase_vehicle_folder_jobs
    drop constraint if exists purchase_vehicle_folder_jobs_ready_fields_check;

alter table public.purchase_vehicle_folder_jobs
    add constraint purchase_vehicle_folder_jobs_ready_fields_check
    check (status <> 'ready' or (
        folder_id is not null
        and folder_url is not null
        and images_folder_id is not null
        and drive_id is not null
        and root_folder_id is not null
    ));

create or replace function public.claim_purchase_vehicle_folder_check(
    p_job_id uuid,
    p_company_id uuid,
    p_lease_seconds integer default 60
)
returns setof public.purchase_vehicle_folder_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    update public.purchase_vehicle_folder_jobs j
    set check_lease_token = gen_random_uuid(),
        check_lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 60), 180))),
        updated_at = now()
    where j.id = p_job_id
      and j.company_id = p_company_id
      and j.status = 'ready'
      and j.folder_id is not null
      and j.drive_id is not null
      and (j.check_lease_token is null or coalesce(j.check_lease_expires_at, '-infinity'::timestamptz) <= now())
    returning j.*;
end;
$$;

create or replace function public.complete_purchase_vehicle_folder_check(
    p_job_id uuid,
    p_company_id uuid,
    p_check_lease_token uuid,
    p_event_id text,
    p_purchase_id uuid,
    p_vehicle_id uuid,
    p_drive_id text,
    p_folder_id text,
    p_result text,
    p_folder_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.purchase_vehicle_folder_jobs j
    set status = case when p_result = 'missing' then 'error' else 'ready' end,
        folder_url = case when p_result = 'found' then p_folder_url else j.folder_url end,
        last_error_code = case
            when p_result = 'missing' then 'FOLDER_NOT_FOUND'
            when p_result = 'unavailable' then 'FOLDER_CHECK_FAILED'
            else null
        end,
        last_error = case
            when p_result = 'missing' then 'Der OneDrive-Ordner wurde gelöscht oder ist nicht mehr vorhanden.'
            when p_result = 'unavailable' then 'Ordner konnte gerade nicht geprüft werden.'
            else null
        end,
        check_lease_token = null,
        check_lease_expires_at = null,
        updated_at = now()
    where j.id = p_job_id
      and j.company_id = p_company_id
      and j.status = 'ready'
      and j.check_lease_token = p_check_lease_token
      and p_event_id = j.folder_event_id
      and p_purchase_id = j.purchase_case_id
      and p_vehicle_id = j.vehicle_id
      and p_drive_id = j.drive_id
      and p_folder_id = j.folder_id
      and (
          (p_result = 'found'
              and p_folder_url ~* '^https://([^/]+\.)?sharepoint\.com(/|$)|^https://(1drv\.ms|onedrive\.live\.com)(/|$)')
          or (p_result = 'missing' and p_folder_url is null)
          or (p_result = 'unavailable' and p_folder_url is null)
      );

    return found;
end;
$$;

create or replace function public.requeue_missing_purchase_vehicle_folder(
    p_job_id uuid,
    p_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.purchase_vehicle_folder_jobs j
    set status = 'pending',
        folder_event_id = gen_random_uuid()::text,
        last_error_code = null,
        last_error = null,
        updated_at = now()
    where j.id = p_job_id
      and j.company_id = p_company_id
      and j.status = 'error'
      and j.last_error_code = 'FOLDER_NOT_FOUND'
      and j.check_lease_token is null
      and j.lease_token is null;

    return found;
end;
$$;

-- The complete RPC is replaced only to use the durable per-generation event
-- identity. Every other identity and lease check remains in place.
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
        registration_folder_id = coalesce(nullif(btrim(p_registration_folder_id), ''), j.registration_folder_id),
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
      and p_event_id = j.folder_event_id
      and p_purchase_id = j.purchase_case_id
      and p_vehicle_id = j.vehicle_id
      and p_folder_name = j.folder_name
      and p_drive_id = j.drive_id
      and nullif(btrim(p_folder_id), '') is not null
      and (p_registration_folder_id is null or nullif(btrim(p_registration_folder_id), '') is not null)
      and nullif(btrim(p_images_folder_id), '') is not null
      and p_folder_url ~ '^https://';

    return found;
end;
$$;

revoke all on function public.claim_purchase_vehicle_folder_check(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_purchase_vehicle_folder_check(uuid, uuid, uuid, text, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.requeue_missing_purchase_vehicle_folder(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_purchase_vehicle_folder_job(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_purchase_vehicle_folder_check(uuid, uuid, integer) to service_role;
grant execute on function public.complete_purchase_vehicle_folder_check(uuid, uuid, uuid, text, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.requeue_missing_purchase_vehicle_folder(uuid, uuid) to service_role;
grant execute on function public.complete_purchase_vehicle_folder_job(uuid, uuid, text, uuid, uuid, text, text, text, text, text, text) to service_role;
