-- Existing deployments may already have applied the initial folder-job
-- migration. Relax its ready-state constraint without removing or rewriting
-- any existing registration-folder mappings.
alter table public.purchase_vehicle_folder_jobs
    alter column registration_folder_id drop not null;

do $$
declare
    existing_constraint record;
begin
    for existing_constraint in
        select conname
        from pg_constraint
        where conrelid = 'public.purchase_vehicle_folder_jobs'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%registration_folder_id IS NOT NULL%'
    loop
        execute format(
            'alter table public.purchase_vehicle_folder_jobs drop constraint %I',
            existing_constraint.conname
        );
    end loop;
end;
$$;

alter table public.purchase_vehicle_folder_jobs
    drop constraint if exists purchase_vehicle_folder_jobs_ready_fields_check;

alter table public.purchase_vehicle_folder_jobs
    add constraint purchase_vehicle_folder_jobs_ready_fields_check
    check ((status = 'ready') = (
        folder_id is not null
        and folder_url is not null
        and images_folder_id is not null
        and drive_id is not null
        and root_folder_id is not null
    ));

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
        registration_folder_id = coalesce(
            nullif(btrim(p_registration_folder_id), ''),
            j.registration_folder_id
        ),
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
      and (
          p_registration_folder_id is null
          or nullif(btrim(p_registration_folder_id), '') is not null
      )
      and nullif(btrim(p_images_folder_id), '') is not null
      and p_folder_url ~ '^https://';

    return found;
end;
$$;

revoke all on function public.complete_purchase_vehicle_folder_job(
    uuid, uuid, text, uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_purchase_vehicle_folder_job(
    uuid, uuid, text, uuid, uuid, text, text, text, text, text, text
) to service_role;
