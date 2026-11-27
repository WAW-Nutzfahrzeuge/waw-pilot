-- V5 separates registration-certificate OCR from text/image draft preparation.
-- Existing V1-V4 rows and RPCs remain available unchanged.
alter table public.purchase_listing_jobs
    drop constraint if exists purchase_listing_jobs_contract_version_check;
alter table public.purchase_listing_jobs
    add constraint purchase_listing_jobs_contract_version_check check (contract_version in (1, 2, 3, 4, 5));
comment on column public.purchase_listing_jobs.contract_version is
    $$Version of the WAW-to-n8n listing contract. V5 separates registration OCR from draft generation; V1-V4 remain supported.$$;

create or replace function public.save_purchase_listing_form_v5(
    p_company_id uuid,
    p_purchase_case_id uuid,
    p_expected_vehicle jsonb,
    p_vehicle jsonb,
    p_expected_listing_details jsonb,
    p_expected_mileage numeric,
    p_expected_sale_price_net numeric,
    p_expected_first_registration date,
    p_expected_vehicle_category text,
    p_listing_details jsonb,
    p_mileage numeric,
    p_sale_price_net numeric,
    p_first_registration date,
    p_vehicle_category text,
    p_ocr_job_id uuid default null,
    p_expected_registration_document_id uuid default null,
    p_expected_registration_file_path text default null,
    p_expected_ocr_revision text default null,
    p_expected_ocr_suggestions jsonb default null,
    p_confirmed_values jsonb default '{}'::jsonb,
    p_confirmed_by uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v public.vehicles%rowtype;
    j public.purchase_listing_jobs%rowtype;
    registration_id uuid;
    registration_path text;
    allowed text[] := array['manufacturer','model','vehicle_type','vin','construction_year','color'];
    current_core jsonb;
begin
    if jsonb_typeof(p_expected_vehicle) is distinct from 'object' or jsonb_typeof(p_vehicle) is distinct from 'object' then
        raise exception 'invalid vehicle fields' using errcode = '22023';
    end if;
    if not (p_expected_vehicle ?& array['manufacturer','model','vehicle_type','vin','construction_year','color'])
       or not (p_vehicle ?& array['manufacturer','model','vehicle_type','vin','construction_year','color'])
       or exists(select 1 from jsonb_object_keys(p_expected_vehicle) k where not (k = any(allowed)))
       or exists(select 1 from jsonb_object_keys(p_vehicle) k where not (k = any(allowed))) then
        raise exception 'invalid vehicle fields' using errcode = '22023';
    end if;
    if jsonb_typeof(p_confirmed_values) is distinct from 'object' then
        raise exception 'invalid confirmation audit' using errcode = '22023';
    end if;

    select vehicle.* into v
    from public.purchase_cases purchase
    join public.vehicles vehicle on vehicle.id = purchase.vehicle_id
    where purchase.id = p_purchase_case_id and purchase.company_id = p_company_id
      and vehicle.company_id = p_company_id
    for update of vehicle;
    if not found then raise exception 'purchase vehicle not found' using errcode = '23503'; end if;

    current_core := jsonb_build_object(
        'manufacturer', v.manufacturer, 'model', v.model, 'vehicle_type', v.vehicle_type,
        'vin', v.vin, 'construction_year', v.construction_year, 'color', v.color
    );
    if current_core is distinct from p_expected_vehicle then
        raise exception 'vehicle source changed concurrently' using errcode = '40001';
    end if;

    if p_ocr_job_id is not null then
        if p_expected_registration_document_id is null or nullif(p_expected_registration_file_path, '') is null then
            raise exception 'registration source identity is missing' using errcode = '22023';
        end if;
        select d.id, d.file_path into registration_id, registration_path
        from public.documents d
        where d.company_id = p_company_id
          and d.document_type = 'vehicle_registration'
          and d.status = 'available'
          and d.file_path is not null
          and (d.purchase_case_id = p_purchase_case_id or d.vehicle_id = v.id)
        order by d.created_at desc, d.id desc
        limit 1
        for update;
        if registration_id is distinct from p_expected_registration_document_id
           or registration_path is distinct from p_expected_registration_file_path then
            raise exception 'registration document changed concurrently' using errcode = '40001';
        end if;
        select * into j from public.purchase_listing_jobs
        where id = p_ocr_job_id and company_id = p_company_id and purchase_case_id = p_purchase_case_id
        for update;
        if not found or j.contract_version <> 5 or j.source_snapshot->>'operation' <> 'registration_ocr'
           or j.status <> 'needs_input' or j.source_revision is distinct from p_expected_ocr_revision
           or j.extracted_suggestions is distinct from p_expected_ocr_suggestions then
            raise exception 'OCR result is stale' using errcode = '40001';
        end if;
        update public.purchase_listing_jobs set
            confirmed_suggestions = jsonb_build_object(
                'source', 'registration_ocr',
                'originalSuggestions', j.extracted_suggestions,
                'savedValues', p_confirmed_values,
                'confirmedAt', now(),
                'confirmedBy', p_confirmed_by
            ), updated_at = now()
        where id = j.id and company_id = p_company_id;
    end if;

    -- Reuse the established v4 row-locked validation and merge for listing_details,
    -- mileage, sale price and first-registration/category fields.
    perform public.save_purchase_listing_information(
        p_company_id, p_purchase_case_id, p_expected_listing_details,
        p_expected_mileage, p_expected_sale_price_net, p_expected_first_registration,
        p_expected_vehicle_category, p_listing_details, p_mileage,
        p_sale_price_net, p_first_registration, p_vehicle_category
    );

    if jsonb_typeof(p_vehicle->'manufacturer') not in ('string','null')
       or jsonb_typeof(p_vehicle->'model') not in ('string','null')
       or jsonb_typeof(p_vehicle->'vehicle_type') not in ('string','null')
       or jsonb_typeof(p_vehicle->'vin') not in ('string','null')
       or jsonb_typeof(p_vehicle->'color') not in ('string','null')
       or (p_vehicle->>'construction_year' is not null and
           (p_vehicle->>'construction_year' !~ '^\d{4}$' or (p_vehicle->>'construction_year')::integer < 1900 or (p_vehicle->>'construction_year')::integer > 2100))
       or length(coalesce(p_vehicle->>'manufacturer','')) > 160
       or length(coalesce(p_vehicle->>'model','')) > 200
       or length(coalesce(p_vehicle->>'vehicle_type','')) > 160
       or length(coalesce(p_vehicle->>'vin','')) > 80
       or length(coalesce(p_vehicle->>'color','')) > 80 then
        raise exception 'invalid vehicle field value' using errcode = '22023';
    end if;

    update public.vehicles set
        manufacturer = coalesce(p_vehicle->>'manufacturer',''),
        model = coalesce(p_vehicle->>'model',''),
        vehicle_type = coalesce(p_vehicle->>'vehicle_type',''),
        vin = coalesce(p_vehicle->>'vin',''),
        construction_year = nullif(p_vehicle->>'construction_year','')::integer,
        color = nullif(p_vehicle->>'color','')
    where id = v.id and company_id = p_company_id;
    return true;
end;
$$;

revoke all on function public.save_purchase_listing_form_v5(uuid,uuid,jsonb,jsonb,jsonb,numeric,numeric,date,text,jsonb,numeric,numeric,date,text,uuid,uuid,text,text,jsonb,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.save_purchase_listing_form_v5(uuid,uuid,jsonb,jsonb,jsonb,numeric,numeric,date,text,jsonb,numeric,numeric,date,text,uuid,uuid,text,text,jsonb,jsonb,uuid) to service_role;
