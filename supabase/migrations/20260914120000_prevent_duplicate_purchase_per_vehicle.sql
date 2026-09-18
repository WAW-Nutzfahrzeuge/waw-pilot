create unique index if not exists purchase_cases_company_vehicle_key
on public.purchase_cases(company_id, vehicle_id)
where vehicle_id is not null
  and status <> 'cancelled';
