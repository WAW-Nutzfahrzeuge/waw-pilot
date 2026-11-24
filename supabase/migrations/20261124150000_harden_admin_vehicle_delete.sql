-- The existing hard-delete routine is SECURITY INVOKER. Under the current
-- vehicles RLS policies, its DELETE may affect zero rows without raising an
-- error, while the routine still records an activity and returns success.
-- Preserve its complete cleanup logic under a private legacy name, then expose
-- an authenticated, admin-checked SECURITY DEFINER wrapper that rolls back the
-- whole transaction unless the vehicle is actually gone.
do $$
begin
    if to_regprocedure('public.admin_delete_vehicle_legacy(uuid,uuid,uuid,text)') is null then
        if to_regprocedure('public.admin_delete_vehicle(uuid,uuid,uuid,text)') is null then
            raise exception 'Expected public.admin_delete_vehicle(uuid,uuid,uuid,text) to exist before applying this migration.';
        end if;

        execute 'alter function public.admin_delete_vehicle(uuid,uuid,uuid,text) rename to admin_delete_vehicle_legacy';
    end if;
end;
$$;

revoke all on function public.admin_delete_vehicle_legacy(uuid,uuid,uuid,text)
    from public, anon, authenticated;

create or replace function public.admin_delete_vehicle(
    p_company_id uuid,
    p_vehicle_id uuid,
    p_actor_auth_user_id uuid,
    p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null
       or auth.uid() is distinct from p_actor_auth_user_id
       or not exists (
            select 1
            from public.profiles p
            where p.auth_user_id = auth.uid()
              and p.company_id = p_company_id
              and p.role = 'admin'
       ) then
        raise exception 'Nur Admins des zugehörigen Unternehmens dürfen Fahrzeuge endgültig löschen.'
            using errcode = '42501';
    end if;

    -- Serialize against sale creation and make the no-sale rule explicit at
    -- the security boundary, not only in the UI or legacy routine.
    perform 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Fahrzeug wurde nicht gefunden oder gehört nicht zur aktuellen Firma.'
            using errcode = 'P0002';
    end if;

    if exists (
        select 1
        from public.sales s
        where s.company_id = p_company_id
          and s.vehicle_id = p_vehicle_id
    ) then
        raise exception 'Fahrzeug kann nicht gelöscht werden, weil es einem Verkauf zugeordnet ist.'
            using errcode = 'P0001';
    end if;

    v_result := public.admin_delete_vehicle_legacy(
        p_company_id,
        p_vehicle_id,
        p_actor_auth_user_id,
        p_actor_name
    );

    if v_result ->> 'deletedVehicleId' is distinct from p_vehicle_id::text
       or exists (
            select 1
            from public.vehicles v
            where v.id = p_vehicle_id
              and v.company_id = p_company_id
       ) then
        raise exception 'Fahrzeuglöschung wurde nicht vollständig abgeschlossen; zugehörige Dateien bleiben erhalten.'
            using errcode = 'P0001';
    end if;

    return v_result;
end;
$$;

alter function public.admin_delete_vehicle(uuid,uuid,uuid,text) owner to postgres;
revoke all on function public.admin_delete_vehicle(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.admin_delete_vehicle(uuid,uuid,uuid,text) to authenticated;

comment on function public.admin_delete_vehicle(uuid,uuid,uuid,text) is
    'Admin-only vehicle hard delete. Verifies same-company admin, rejects vehicles in any sale, and fails atomically unless the vehicle row is actually deleted.';

notify pgrst, 'reload schema';
