-- A response may update the job only while its claimed inspection lease is
-- still current. Expired claims can be replaced by claim_purchase_vehicle_folder_check.
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
      and j.check_lease_expires_at > now()
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

revoke all on function public.complete_purchase_vehicle_folder_check(uuid, uuid, uuid, text, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_purchase_vehicle_folder_check(uuid, uuid, uuid, text, uuid, uuid, text, text, text, text) to service_role;
