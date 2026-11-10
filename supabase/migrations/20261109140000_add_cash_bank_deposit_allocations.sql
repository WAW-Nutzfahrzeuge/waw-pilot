create table if not exists public.cash_bank_deposit_allocations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    deposit_cashbook_entry_id uuid not null references public.cashbook_entries(id) on delete cascade,
    source_financial_entry_id uuid references public.financial_entries(id) on delete restrict,
    allocation_type text not null check (
        allocation_type in ('sale_payment', 'existing_cash_balance', 'other_cash_income')
    ),
    allocation_amount numeric(12, 2) not null check (allocation_amount > 0),
    allocation_note text,
    created_by uuid,
    created_at timestamptz not null default now(),
    constraint cash_bank_deposit_allocations_source_check check (
        (allocation_type in ('sale_payment', 'other_cash_income') and source_financial_entry_id is not null)
        or (allocation_type = 'existing_cash_balance' and source_financial_entry_id is null)
    )
);

create index if not exists cash_bank_deposit_allocations_company_deposit_idx
    on public.cash_bank_deposit_allocations(company_id, deposit_cashbook_entry_id);

create index if not exists cash_bank_deposit_allocations_company_source_idx
    on public.cash_bank_deposit_allocations(company_id, source_financial_entry_id)
    where source_financial_entry_id is not null;

create unique index if not exists cash_bank_deposit_allocations_deposit_source_uidx
    on public.cash_bank_deposit_allocations(deposit_cashbook_entry_id, source_financial_entry_id)
    where source_financial_entry_id is not null;

create unique index if not exists cash_bank_deposit_allocations_deposit_residual_uidx
    on public.cash_bank_deposit_allocations(deposit_cashbook_entry_id, allocation_type)
    where source_financial_entry_id is null;

alter table public.cash_bank_deposit_allocations enable row level security;
revoke all on public.cash_bank_deposit_allocations from public, anon, authenticated;
grant all on public.cash_bank_deposit_allocations to service_role;

create or replace function public.create_cash_bank_deposit_with_allocations(
    p_company_id uuid,
    p_amount numeric,
    p_booking_date date,
    p_allocations jsonb,
    p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    allocation jsonb;
    allocation_type_value text;
    source_id uuid;
    allocation_amount_value numeric(12, 2);
    allocation_note_value text;
    source_entry public.financial_entries%rowtype;
    sale_number_value text;
    available_source_amount numeric(12, 2);
    allocated_total numeric(12, 2) := 0;
    cash_balance numeric(12, 2);
    opening_balance_value numeric(12, 2) := 0;
    deposit_id uuid;
    description_parts text[] := array[]::text[];
    sale_numbers text[] := array[]::text[];
    residual_description text;
begin
    if p_company_id is null or p_amount is null or p_amount <= 0 or p_booking_date is null then
        raise exception using errcode = '22023', message = 'invalid deposit details';
    end if;

    if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
        raise exception using errcode = '22023', message = 'allocations are required';
    end if;

    -- Serialize deposits against the active register so two concurrent deposits
    -- cannot both spend the same remaining cash balance.
    perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
    select coalesce(cr.opening_balance, 0)
      into opening_balance_value
      from public.cash_registers cr
     where cr.company_id = p_company_id and cr.active = true
     order by cr.id
     limit 1
     for update;

    select coalesce(sum(
        case
            when fe.direction = 'in' and fe.category_code <> 'cash_bank_deposit' then fe.amount
            else -fe.amount
        end
    ), 0)
      into cash_balance
      from public.financial_entries fe
     where fe.company_id = p_company_id
       and fe.is_cash_relevant = true
       and fe.status = 'active';

    cash_balance := coalesce(opening_balance_value, 0) + coalesce(cash_balance, 0);
    if p_amount > cash_balance then
        raise exception using errcode = '23514', message = 'deposit exceeds available cash balance';
    end if;

    for allocation in
        select value
          from jsonb_array_elements(p_allocations) as items(value)
         order by coalesce(value->>'sourceFinancialEntryId', '')
    loop
        allocation_type_value := allocation->>'type';
        allocation_amount_value := (allocation->>'amount')::numeric(12, 2);
        allocation_note_value := nullif(btrim(allocation->>'note'), '');
        allocated_total := allocated_total + allocation_amount_value;

        if allocation_amount_value <= 0 then
            raise exception using errcode = '22023', message = 'allocation amount must be positive';
        end if;

        if allocation_type_value in ('sale_payment', 'other_cash_income') then
            source_id := (allocation->>'sourceFinancialEntryId')::uuid;
            select fe.*
              into source_entry
              from public.financial_entries fe
             where fe.id = source_id
               and fe.company_id = p_company_id
               and fe.payment_method = 'cash'
               and fe.direction = 'in'
               and fe.is_cash_relevant = true
               and fe.status = 'active'
               and fe.category_code <> 'cash_bank_deposit'
               and (
                    (allocation_type_value = 'sale_payment' and fe.source_type = 'sale_payment' and fe.entry_type = 'sale_payment' and fe.sale_id is not null)
                    or (allocation_type_value = 'other_cash_income' and not (fe.source_type = 'sale_payment' and fe.entry_type = 'sale_payment'))
               )
             for update;

            if not found then
                raise exception using errcode = '23503', message = 'selected cash inflow is unavailable';
            end if;

            if allocation_type_value = 'sale_payment' then
                select s.sale_number
                  into sale_number_value
                  from public.sales s
                 where s.id = source_entry.sale_id and s.company_id = p_company_id;

                if sale_number_value is null then
                    raise exception using errcode = '23503', message = 'sale for selected cash payment is unavailable';
                end if;
                sale_numbers := array_append(sale_numbers, sale_number_value);
            else
                description_parts := array_append(
                    description_parts,
                    'sonstige Bareinnahme: ' || coalesce(source_entry.description, source_entry.source_reference, 'Bareinnahme')
                        || ' ' || to_char(allocation_amount_value, 'FM999999990.00') || ' EUR'
                );
            end if;

            select source_entry.amount - coalesce(sum(a.allocation_amount), 0)
              into available_source_amount
              from public.cash_bank_deposit_allocations a
              join public.financial_entries deposit_entry
                on deposit_entry.company_id = a.company_id
               and deposit_entry.source_type = 'cashbook_entry'
               and deposit_entry.source_id::text = a.deposit_cashbook_entry_id::text
               and deposit_entry.category_code = 'cash_bank_deposit'
               and deposit_entry.status = 'active'
             where a.company_id = p_company_id
               and a.source_financial_entry_id = source_id;

            if allocation_amount_value > coalesce(available_source_amount, source_entry.amount) then
                raise exception using errcode = '23514', message = 'allocation exceeds unassigned cash inflow';
            end if;

        elsif allocation_type_value = 'existing_cash_balance' then
            if allocation->>'sourceFinancialEntryId' is not null then
                raise exception using errcode = '22023', message = 'residual allocation cannot reference a sale payment';
            end if;
            residual_description := 'bereits vorhandener Kassenbestand';
            description_parts := array_append(description_parts, residual_description || ' ' || to_char(allocation_amount_value, 'FM999999990.00') || ' EUR');
        else
            raise exception using errcode = '22023', message = 'unsupported allocation type';
        end if;
    end loop;

    if allocated_total <> p_amount then
        raise exception using errcode = '23514', message = 'allocations must equal deposit amount';
    end if;

    if cardinality(sale_numbers) > 0 then
        description_parts := array_prepend(
            'Verkäufe ' || array_to_string(array(select distinct unnest(sale_numbers) order by 1), ', '),
            description_parts
        );
    end if;

    insert into public.cashbook_entries (
        company_id,
        entry_type,
        category,
        payment_method,
        amount,
        booking_date,
        description,
        customer_id,
        vehicle_id,
        sale_id,
        invoice_id,
        document_id
    ) values (
        p_company_id,
        'expense',
        'cash_bank_deposit',
        'cash',
        p_amount,
        p_booking_date,
        'Bareinzahlung auf Bank – ' || array_to_string(description_parts, '; '),
        null,
        null,
        null,
        null,
        null
    ) returning id into deposit_id;

    for allocation in select value from jsonb_array_elements(p_allocations) as items(value)
    loop
        allocation_type_value := allocation->>'type';
        insert into public.cash_bank_deposit_allocations (
            company_id,
            deposit_cashbook_entry_id,
            source_financial_entry_id,
            allocation_type,
            allocation_amount,
            allocation_note,
            created_by
        ) values (
            p_company_id,
            deposit_id,
            case when allocation_type_value in ('sale_payment', 'other_cash_income') then (allocation->>'sourceFinancialEntryId')::uuid else null end,
            allocation_type_value,
            (allocation->>'amount')::numeric(12, 2),
            nullif(btrim(allocation->>'note'), ''),
            p_created_by
        );
    end loop;

    return deposit_id;
end;
$$;

revoke all on function public.create_cash_bank_deposit_with_allocations(uuid, numeric, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_cash_bank_deposit_with_allocations(uuid, numeric, date, jsonb, uuid) to service_role;
