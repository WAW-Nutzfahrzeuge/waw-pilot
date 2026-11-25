-- Keep the vehicle record for audit/history, but stop treating it as active
-- inventory after its purchase case is successfully deleted.
alter table public.vehicles
    add column if not exists purchase_cancelled_at timestamptz;

do $$
begin
    if to_regprocedure('public.admin_delete_purchase_case_legacy(uuid,uuid,uuid,text)') is null then
        if to_regprocedure('public.admin_delete_purchase_case(uuid,uuid,uuid,text)') is null then
            raise exception 'Expected public.admin_delete_purchase_case(uuid,uuid,uuid,text) to exist before applying this migration.';
        end if;

        execute 'alter function public.admin_delete_purchase_case(uuid,uuid,uuid,text) rename to admin_delete_purchase_case_legacy';
    end if;
end;
$$;

revoke all on function public.admin_delete_purchase_case_legacy(uuid,uuid,uuid,text)
    from public, anon, authenticated;

create or replace function public.admin_delete_purchase_case(
    p_company_id uuid,
    p_purchase_id uuid,
    p_actor_auth_user_id uuid,
    p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_vehicle_id uuid;
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
        raise exception 'Nur Admins des zugehörigen Unternehmens dürfen Ankäufe endgültig löschen.'
            using errcode = '42501';
    end if;

    select pc.vehicle_id
    into v_vehicle_id
    from public.purchase_cases pc
    where pc.id = p_purchase_id
      and pc.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Ankauf wurde nicht gefunden oder gehört nicht zur aktuellen Firma.'
            using errcode = 'P0002';
    end if;

    if v_vehicle_id is not null then
        perform 1
        from public.vehicles v
        where v.id = v_vehicle_id
          and v.company_id = p_company_id
        for update;

        if not found then
            raise exception 'Das zum Ankauf gehörende Fahrzeug wurde nicht gefunden.'
                using errcode = 'P0002';
        end if;

        if exists (
            select 1
            from public.sales s
            where s.company_id = p_company_id
              and s.vehicle_id = v_vehicle_id
        ) then
            raise exception 'Der Ankauf kann nicht gelöscht werden, weil das Fahrzeug einem Verkauf zugeordnet ist.'
                using errcode = 'P0001';
        end if;
    end if;

    v_result := public.admin_delete_purchase_case_legacy(
        p_company_id,
        p_purchase_id,
        p_actor_auth_user_id,
        p_actor_name
    );

    if exists (
        select 1
        from public.purchase_cases pc
        where pc.id = p_purchase_id
          and pc.company_id = p_company_id
    ) then
        raise exception 'Ankauf wurde nicht vollständig gelöscht; Änderungen wurden zurückgerollt.'
            using errcode = 'P0001';
    end if;

    if v_vehicle_id is not null then
        update public.vehicles
        set purchase_cancelled_at = coalesce(purchase_cancelled_at, now())
        where id = v_vehicle_id
          and company_id = p_company_id;

        if not found then
            raise exception 'Fahrzeug konnte nach dem Löschen des Ankaufs nicht als storniert markiert werden.'
                using errcode = 'P0001';
        end if;
    end if;

    return v_result || jsonb_build_object(
        'purchaseCancelledVehicleId', v_vehicle_id,
        'purchaseCancelledAt', case when v_vehicle_id is null then null else now() end
    );
end;
$$;

alter function public.admin_delete_purchase_case(uuid,uuid,uuid,text) owner to postgres;
revoke all on function public.admin_delete_purchase_case(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.admin_delete_purchase_case(uuid,uuid,uuid,text) to authenticated;

comment on column public.vehicles.purchase_cancelled_at is
    'Set when its purchase case is administratively deleted; excludes the vehicle from active inventory while retaining a cancelled row in the inventory list.';

comment on function public.admin_delete_purchase_case(uuid,uuid,uuid,text) is
    'Admin-only purchase hard delete. Preserves the linked vehicle row, rejects vehicles with sales, and marks the vehicle as cancelled after a successful purchase deletion.';

notify pgrst, 'reload schema';
