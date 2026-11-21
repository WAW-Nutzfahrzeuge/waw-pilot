create or replace function public.change_sale_type_safely(
    p_company_id uuid,
    p_sale_id uuid,
    p_expected_sale_type text,
    p_next_sale_type text,
    p_vat_rate numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    sale_row public.sales%rowtype;
    buyer_row public.customers%rowtype;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles p
        where p.auth_user_id = auth.uid()
          and p.company_id = p_company_id
    ) then
        raise exception 'SALE_TYPE_CHANGE_FORBIDDEN' using errcode = '42501';
    end if;

    if p_next_sale_type is null
       or p_next_sale_type not in ('inland', 'eu', 'export_third_country')
       or p_vat_rate is null
       or p_vat_rate not in (0, 19) then
        raise exception 'SALE_TYPE_CHANGE_INVALID_INPUT' using errcode = '22023';
    end if;

    select * into sale_row
    from public.sales
    where id = p_sale_id and company_id = p_company_id
    for update;

    if not found then
        raise exception 'SALE_TYPE_CHANGE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if sale_row.sale_type is distinct from p_expected_sale_type then
        raise exception 'SALE_TYPE_CHANGE_CONCURRENT' using errcode = '40001';
    end if;
    if sale_row.status = 'cancelled' then
        raise exception 'SALE_TYPE_CHANGE_CANCELLED' using errcode = 'P0001';
    end if;
    if sale_row.payment_status is distinct from 'open' or sale_row.datev_status = 'sent' then
        raise exception 'SALE_TYPE_CHANGE_ACCOUNTING_RECORDS_EXIST' using errcode = 'P0001';
    end if;
    if sale_row.net_amount is null or sale_row.net_amount < 0 then
        raise exception 'SALE_TYPE_CHANGE_INVALID_AMOUNT' using errcode = '22023';
    end if;

    select * into buyer_row
    from public.customers
    where id = sale_row.buyer_customer_id and company_id = p_company_id;
    if not found then
        raise exception 'SALE_TYPE_CHANGE_CUSTOMER_NOT_FOUND' using errcode = 'P0002';
    end if;
    if p_next_sale_type = 'eu'
       and buyer_row.type = 'company'
       and nullif(btrim(buyer_row.vat_id), '') is null then
        raise exception 'SALE_TYPE_CHANGE_EU_VAT_ID_REQUIRED' using errcode = 'P0001';
    end if;

    -- Lock the sale first. Inserts referencing this sale through their FK wait
    -- until this transaction finishes, closing the check-then-write race.
    if exists (
        select 1 from public.sale_payments
        where sale_id = p_sale_id and company_id = p_company_id
    ) then
        raise exception 'SALE_TYPE_CHANGE_ACCOUNTING_RECORDS_EXIST' using errcode = 'P0001';
    end if;
    if exists (
        select 1 from public.sale_refunds
        where sale_id = p_sale_id and company_id = p_company_id
    ) then
        raise exception 'SALE_TYPE_CHANGE_REFUNDS_EXIST' using errcode = 'P0001';
    end if;
    if exists (
        select 1 from public.cashbook_entries
        where sale_id = p_sale_id and company_id = p_company_id
    ) or exists (
        select 1 from public.financial_entries
        where sale_id = p_sale_id and company_id = p_company_id
    ) then
        raise exception 'SALE_TYPE_CHANGE_ACCOUNTING_RECORDS_EXIST' using errcode = 'P0001';
    end if;

    perform 1
    from public.invoices
    where sale_id = p_sale_id and company_id = p_company_id
    for update;

    if exists (
        select 1 from public.invoices i
        where i.sale_id = p_sale_id
          and i.company_id = p_company_id
          and (
              i.status is distinct from 'created'
              or i.payment_status is distinct from 'open'
              or i.datev_status = 'sent'
              or i.email_sent_at is not null
              or i.zugferd_email_sent_at is not null
              or i.correction_of_invoice_id is not null
              or i.root_invoice_id is not null
              or i.invoice_type is null
              or i.invoice_type not in ('standard', 'proforma', 'down_payment')
          )
    ) then
        raise exception 'SALE_TYPE_CHANGE_INVOICE_HISTORY' using errcode = 'P0001';
    end if;
    if exists (
        select 1 from public.invoices i
        where i.sale_id = p_sale_id
          and i.company_id = p_company_id
          and (i.net_amount is null or i.net_amount < 0)
    ) then
        raise exception 'SALE_TYPE_CHANGE_INVALID_AMOUNT' using errcode = '22023';
    end if;

    update public.sales
    set sale_type = p_next_sale_type,
        vat_rate = p_vat_rate,
        vat_amount = round(net_amount * p_vat_rate / 100, 2),
        gross_amount = round(net_amount + round(net_amount * p_vat_rate / 100, 2), 2)
    where id = p_sale_id and company_id = p_company_id;

    update public.invoices i
    set vat_rate = p_vat_rate,
        vat_amount = round(i.net_amount * p_vat_rate / 100, 2),
        gross_amount = round(i.net_amount + round(i.net_amount * p_vat_rate / 100, 2), 2),
        zugferd_validation_status = case
            when i.zugferd_file_path is not null or i.zugferd_validation_status is not null then 'invalid'
            else i.zugferd_validation_status
        end,
        zugferd_generation_started_at = case
            when i.zugferd_file_path is not null or i.zugferd_validation_status is not null then null
            else i.zugferd_generation_started_at
        end,
        zugferd_validation_summary = case
            when i.zugferd_file_path is not null or i.zugferd_validation_status is not null then
                jsonb_build_object(
                    'status', 'invalid',
                    'issues', jsonb_build_array(jsonb_build_object(
                        'severity', 'error',
                        'message', 'Der Verkaufstyp wurde geändert. Die E-Rechnung muss neu erzeugt werden.'
                    ))
                )
            else i.zugferd_validation_summary
        end
    where i.sale_id = p_sale_id and i.company_id = p_company_id;

    return true;
end;
$$;

revoke all on function public.change_sale_type_safely(uuid, uuid, text, text, numeric) from public, anon;
grant execute on function public.change_sale_type_safely(uuid, uuid, text, text, numeric) to authenticated;

comment on function public.change_sale_type_safely(uuid, uuid, text, text, numeric) is
    'Atomically changes an unpaid sale type and recalculates related invoice tax totals, only when no payment, cashbook, refund or financial journal record exists.';
