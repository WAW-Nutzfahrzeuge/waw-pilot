-- Enables an explicitly confirmed vehicle deletion together with its linked
-- purchases and safely deletable sales. Existing admin routines remain the
-- source of truth for cleanup and accounting effects.
do $$
begin
    if to_regprocedure('public.admin_delete_vehicle(uuid,uuid,uuid,text)') is null
       or to_regprocedure('public.admin_delete_purchase_case(uuid,uuid,uuid,text)') is null
       or to_regprocedure('public.admin_delete_sale(uuid,uuid,uuid,text)') is null then
        raise exception 'Apply the existing admin vehicle/purchase delete migrations and ensure admin_delete_sale(uuid,uuid,uuid,text) exists first.';
    end if;
end;
$$;

create or replace function public.admin_delete_vehicle_with_relations(
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
    v_sale_id uuid;
    v_purchase_id uuid;
    v_sale_ids uuid[] := array[]::uuid[];
    v_purchase_ids uuid[] := array[]::uuid[];
    v_vehicle_result jsonb;
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
        raise exception 'Nur Admins des zugehörigen Unternehmens dürfen Fahrzeuge und verknüpfte Vorgänge endgültig löschen.'
            using errcode = '42501';
    end if;

    perform 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.company_id = p_company_id
    for update;

    if not found then
        raise exception 'Fahrzeug wurde nicht gefunden oder gehört nicht zur aktuellen Firma.'
            using errcode = 'P0002';
    end if;

    -- Final invoices, corrections, and refunds must use the correction workflow.
    if exists (
        select 1
        from public.sales s
        join public.invoices i on i.sale_id = s.id and i.company_id = s.company_id
        where s.company_id = p_company_id
          and s.vehicle_id = p_vehicle_id
          and (
              i.invoice_type <> 'proforma'
              or i.correction_of_invoice_id is not null
              or i.root_invoice_id is not null
              or i.invoice_type in ('cancellation_invoice', 'credit_note')
          )
    ) then
        raise exception 'Ein verknüpfter Verkauf hat eine finale Rechnung oder Rechnungskorrektur. Bitte kläre zuerst die erforderliche Stornierung.'
            using errcode = 'P0001';
    end if;

    if exists (
        select 1
        from public.sales s
        join public.sale_refunds r on r.sale_id = s.id and r.company_id = s.company_id
        where s.company_id = p_company_id
          and s.vehicle_id = p_vehicle_id
    ) then
        raise exception 'Ein verknüpfter Verkauf hat Rückzahlungen. Bitte kläre diese zuerst fachlich.'
            using errcode = 'P0001';
    end if;

    select coalesce(array_agg(s.id order by s.id), array[]::uuid[])
    into v_sale_ids
    from public.sales s
    where s.company_id = p_company_id and s.vehicle_id = p_vehicle_id;

    select coalesce(array_agg(pc.id order by pc.id), array[]::uuid[])
    into v_purchase_ids
    from public.purchase_cases pc
    where pc.company_id = p_company_id and pc.vehicle_id = p_vehicle_id;

    -- Delete sales first, so purchase guards can still require no linked sale.
    for v_sale_id in select unnest(v_sale_ids) loop
        perform public.admin_delete_sale(
            p_company_id, v_sale_id, p_actor_auth_user_id, p_actor_name
        );
    end loop;

    for v_purchase_id in select unnest(v_purchase_ids) loop
        perform public.admin_delete_purchase_case(
            p_company_id, v_purchase_id, p_actor_auth_user_id, p_actor_name
        );
    end loop;

    v_vehicle_result := public.admin_delete_vehicle(
        p_company_id, p_vehicle_id, p_actor_auth_user_id, p_actor_name
    );

    if exists (
        select 1 from public.vehicles v
        where v.id = p_vehicle_id and v.company_id = p_company_id
    ) then
        raise exception 'Fahrzeug wurde nicht vollständig gelöscht; die gesamte Aktion wurde zurückgerollt.'
            using errcode = 'P0001';
    end if;

    return jsonb_build_object(
        'deletedVehicleId', p_vehicle_id,
        'deletedSaleIds', to_jsonb(v_sale_ids),
        'deletedPurchaseIds', to_jsonb(v_purchase_ids),
        'vehicleDeleteResult', v_vehicle_result
    );
end;
$$;

alter function public.admin_delete_vehicle_with_relations(uuid,uuid,uuid,text) owner to postgres;
revoke all on function public.admin_delete_vehicle_with_relations(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.admin_delete_vehicle_with_relations(uuid,uuid,uuid,text) to authenticated;

comment on function public.admin_delete_vehicle_with_relations(uuid,uuid,uuid,text) is
    'Admin-only atomic cascade for explicitly confirmed vehicle deletion. Deletes linked proforma-only sales and their purchases through existing routines, and rejects final invoices, corrections, or refunds.';

notify pgrst, 'reload schema';
