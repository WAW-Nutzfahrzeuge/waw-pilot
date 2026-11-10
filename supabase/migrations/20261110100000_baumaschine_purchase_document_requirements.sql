-- Baumaschinen do not require a vehicle registration document in the purchase
-- file. Their purchase invoice remains required. Recompute only existing
-- construction-machine purchases; all other purchase statuses stay unchanged.
update public.purchase_cases as purchase
set
    document_check_status = case
        when exists (
            select 1
            from public.documents as document
            where document.company_id = purchase.company_id
              and document.document_type = 'purchase_invoice'
              and document.status = 'available'
              and (
                    document.purchase_case_id = purchase.id
                    or document.vehicle_id = purchase.vehicle_id
              )
        ) then 'complete'
        else 'missing'
    end,
    updated_at = now()
from public.vehicles as vehicle
where vehicle.id = purchase.vehicle_id
  and vehicle.company_id = purchase.company_id
  and (
        lower(coalesce(vehicle.vehicle_type, '')) ~ '(^|[^[:alnum:]])baumaschinen?([^[:alnum:]]|$)'
        or lower(coalesce(vehicle.vehicle_category, '')) ~ '(^|[^[:alnum:]])baumaschinen?([^[:alnum:]]|$)'
  )
  and purchase.document_check_status is distinct from case
        when exists (
            select 1
            from public.documents as document
            where document.company_id = purchase.company_id
              and document.document_type = 'purchase_invoice'
              and document.status = 'available'
              and (
                    document.purchase_case_id = purchase.id
                    or document.vehicle_id = purchase.vehicle_id
              )
        ) then 'complete'
        else 'missing'
  end;
