alter table public.vehicles
    add column if not exists listing_details jsonb not null default '{}'::jsonb;

alter table public.vehicles
    drop constraint if exists vehicles_listing_details_object_check;
alter table public.vehicles
    add constraint vehicles_listing_details_object_check
    check (jsonb_typeof(listing_details) = 'object');

alter table public.purchase_listing_jobs
    add column if not exists contract_version smallint not null default 1,
    add column if not exists confirmed_suggestions jsonb not null default '{}'::jsonb,
    add column if not exists confirmed_suggestions_by uuid,
    add column if not exists confirmed_suggestions_at timestamptz;

alter table public.purchase_listing_jobs
    drop constraint if exists purchase_listing_jobs_contract_version_check;
alter table public.purchase_listing_jobs
    add constraint purchase_listing_jobs_contract_version_check check (contract_version in (1, 2));
alter table public.purchase_listing_jobs
    drop constraint if exists purchase_listing_jobs_confirmed_suggestions_object_check;
alter table public.purchase_listing_jobs
    add constraint purchase_listing_jobs_confirmed_suggestions_object_check
    check (jsonb_typeof(confirmed_suggestions) = 'object');

-- Version is part of an immutable job identity just like source_revision.
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
        or new.contract_version is distinct from old.contract_version
    ) then
        raise exception 'purchase listing source identity is immutable' using errcode = '23514';
    end if;
    if not exists (
        select 1 from public.purchase_cases p
        where p.id = new.purchase_case_id and p.company_id = new.company_id and p.vehicle_id = new.vehicle_id
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

comment on column public.vehicles.listing_details is
    'Optional, explicitly confirmed, listing-facing technical and condition details. Internal vehicle notes are kept separate.';
comment on column public.purchase_listing_jobs.contract_version is
    'Version of the WAW-to-n8n listing contract. Existing jobs remain version 1; new jobs use version 2.';

create or replace function public.confirm_purchase_listing_suggestions(
    p_company_id uuid,
    p_purchase_case_id uuid,
    p_job_id uuid,
    p_expected_source_revision text,
    p_expected_manual_revision integer,
    p_confirmed_by uuid,
    p_selected_fields text[],
    p_suggestions jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    j public.purchase_listing_jobs%rowtype;
    v public.vehicles%rowtype;
    fields text[] := array[
        'manufacturer', 'model', 'vin', 'firstRegistration', 'constructionYear',
        'enginePowerKw', 'transmission', 'emissionClass', 'axleFormula',
        'frontSuspension', 'rearSuspension', 'grossVehicleWeightKg', 'curbWeightKg',
        'payloadKg', 'wheelbaseMm', 'huUntil', 'spUntil', 'color'
    ];
    field_name text;
    updated_details jsonb;
    selected_values jsonb := '{}'::jsonb;
    new_manufacturer text;
    new_model text;
    new_vin text;
    new_first_registration date;
    new_construction_year integer;
    new_color text;
begin
    if p_selected_fields is null or cardinality(p_selected_fields) = 0 or p_suggestions is null
       or jsonb_typeof(p_suggestions) <> 'object' then
        raise exception 'no suggestion fields selected' using errcode = '22023';
    end if;
    if not (p_selected_fields <@ fields) or cardinality(p_selected_fields) <> (select count(distinct x) from unnest(p_selected_fields) x) then
        raise exception 'invalid selected suggestion fields' using errcode = '22023';
    end if;

    select * into j from public.purchase_listing_jobs
    where id = p_job_id and company_id = p_company_id and purchase_case_id = p_purchase_case_id
    for update;
    if not found or j.status not in ('needs_input', 'draft_ready') or j.contract_version <> 2
       or j.source_revision <> p_expected_source_revision or j.manual_revision <> p_expected_manual_revision then
        raise exception 'listing job changed or is not editable' using errcode = '40001';
    end if;

    select vehicle.* into v
    from public.vehicles vehicle
    join public.purchase_cases purchase on purchase.vehicle_id = vehicle.id
    where purchase.id = p_purchase_case_id and purchase.company_id = p_company_id
      and vehicle.id = j.vehicle_id and vehicle.company_id = p_company_id
    for update of vehicle;
    if not found then raise exception 'purchase vehicle not found' using errcode = '23503'; end if;

    if v.manufacturer is distinct from j.confirmed_vehicle_data->>'manufacturer'
       or v.model is distinct from j.confirmed_vehicle_data->>'model'
       or v.vehicle_type is distinct from j.confirmed_vehicle_data->>'vehicleType'
       or v.vin is distinct from j.confirmed_vehicle_data->>'vin'
       or coalesce(v.first_registration::text, '') is distinct from coalesce(j.confirmed_vehicle_data->>'firstRegistration', '')
       or coalesce(v.construction_year::text, '') is distinct from coalesce(j.confirmed_vehicle_data->>'constructionYear', '')
       or coalesce(v.mileage::text, '') is distinct from coalesce(j.confirmed_vehicle_data->>'mileage', '')
       or coalesce(v.color, '') is distinct from coalesce(j.confirmed_vehicle_data->>'color', '')
       or coalesce(v.vehicle_category, '') is distinct from coalesce(j.confirmed_vehicle_data->>'vehicleCategory', '')
       or coalesce(v.listing_details, '{}'::jsonb) is distinct from coalesce(j.source_snapshot->'databaseListingDetails', '{}'::jsonb) then
        raise exception 'vehicle source changed since listing preparation' using errcode = '40001';
    end if;

    new_manufacturer := v.manufacturer;
    new_model := v.model;
    new_vin := v.vin;
    new_first_registration := v.first_registration;
    new_construction_year := v.construction_year;
    new_color := v.color;
    updated_details := coalesce(v.listing_details, '{}'::jsonb);

    foreach field_name in array p_selected_fields loop
        if not (p_suggestions ? field_name) or jsonb_typeof(p_suggestions->field_name) not in ('string', 'number') then
            raise exception 'selected suggestion is missing or invalid' using errcode = '22023';
        end if;
        if length(p_suggestions->>field_name) = 0 or length(p_suggestions->>field_name) > 500 then
            raise exception 'selected suggestion length is invalid' using errcode = '22023';
        end if;
        selected_values := selected_values || jsonb_build_object(field_name, p_suggestions->field_name);
        case field_name
            when 'manufacturer' then new_manufacturer := p_suggestions->>field_name;
            when 'model' then new_model := p_suggestions->>field_name;
            when 'vin' then
                if length(p_suggestions->>field_name) > 32 or (p_suggestions->>field_name) !~ '^[A-Za-z0-9]+$' then raise exception 'invalid VIN suggestion' using errcode = '22023'; end if;
                new_vin := upper(p_suggestions->>field_name);
            when 'firstRegistration' then
                if (p_suggestions->>field_name) !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid first registration suggestion' using errcode = '22023'; end if;
                new_first_registration := (p_suggestions->>field_name)::date;
            when 'constructionYear' then
                if (p_suggestions->>field_name) !~ '^\d{4}$' or (p_suggestions->>field_name)::integer not between 1900 and 2100 then raise exception 'invalid construction year suggestion' using errcode = '22023'; end if;
                new_construction_year := (p_suggestions->>field_name)::integer;
            when 'color' then new_color := p_suggestions->>field_name;
            else
                if field_name in ('enginePowerKw', 'grossVehicleWeightKg', 'curbWeightKg', 'payloadKg', 'wheelbaseMm') then
                    if jsonb_typeof(p_suggestions->field_name) <> 'number'
                       or (p_suggestions->>field_name)::numeric < 0
                       or (field_name = 'enginePowerKw' and (p_suggestions->>field_name)::numeric > 3000)
                       or (field_name in ('grossVehicleWeightKg', 'curbWeightKg', 'payloadKg') and (p_suggestions->>field_name)::numeric > 100000)
                       or (field_name = 'wheelbaseMm' and (p_suggestions->>field_name)::numeric > 30000)
                       or trunc((p_suggestions->>field_name)::numeric) <> (p_suggestions->>field_name)::numeric then
                        raise exception 'invalid numeric vehicle suggestion' using errcode = '22023';
                    end if;
                elsif field_name in ('huUntil', 'spUntil') then
                    if (p_suggestions->>field_name) !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid inspection period' using errcode = '22023'; end if;
                elsif jsonb_typeof(p_suggestions->field_name) <> 'string' then
                    raise exception 'invalid text vehicle suggestion' using errcode = '22023';
                end if;
                updated_details := jsonb_set(updated_details, array[field_name], p_suggestions->field_name, true);
        end case;
    end loop;

    update public.vehicles set
        manufacturer = new_manufacturer,
        model = new_model,
        vin = new_vin,
        first_registration = new_first_registration,
        construction_year = new_construction_year,
        color = new_color,
        listing_details = updated_details
    where id = v.id and company_id = p_company_id;

    update public.purchase_listing_jobs set
        confirmed_suggestions = jsonb_set(
            coalesce(confirmed_suggestions, '{}'::jsonb),
            '{fields}',
            coalesce(confirmed_suggestions->'fields', '{}'::jsonb) || selected_values,
            true
        ) || jsonb_build_object(
            'lastConfirmedAt', now(),
            'lastConfirmedBy', p_confirmed_by,
            'events', coalesce(confirmed_suggestions->'events', '[]'::jsonb) || jsonb_build_array(
                jsonb_build_object('confirmedAt', now(), 'confirmedBy', p_confirmed_by, 'fields', selected_values)
            )
        ),
        conflicts = coalesce((
            select jsonb_agg(item.value)
            from jsonb_array_elements(coalesce(conflicts, '[]'::jsonb)) as item(value)
            where not ((item.value->>'field') = any(p_selected_fields))
        ), '[]'::jsonb),
        confirmed_suggestions_by = p_confirmed_by,
        confirmed_suggestions_at = now(),
        manual_revision = manual_revision + 1,
        updated_at = now()
    where id = p_job_id and company_id = p_company_id;
    return true;
end;
$$;

revoke all on function public.confirm_purchase_listing_suggestions(uuid, uuid, uuid, text, integer, uuid, text[], jsonb) from public, anon, authenticated;
grant execute on function public.confirm_purchase_listing_suggestions(uuid, uuid, uuid, text, integer, uuid, text[], jsonb) to service_role;
