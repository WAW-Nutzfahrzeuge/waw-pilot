create table if not exists public.number_counters (
    company_id uuid not null,
    counter_key text not null,
    current_value integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (company_id, counter_key)
);

insert into public.number_counters(company_id, counter_key, current_value)
select
    company_id,
    'purchase:' || right(purchase_number, 4),
    max(nullif(regexp_replace(purchase_number, '^EK-([0-9]+)-([0-9]{4})$', '\1'), purchase_number)::integer)
from public.purchase_cases
where purchase_number ~ '^EK-[0-9]+-[0-9]{4}$'
group by company_id, right(purchase_number, 4)
on conflict (company_id, counter_key) do update
set current_value = greatest(
        public.number_counters.current_value,
        excluded.current_value
    ),
    updated_at = now();

insert into public.number_counters(company_id, counter_key, current_value)
select
    company_id,
    'sale:' || split_part(sale_number, '-', 1),
    max(nullif(regexp_replace(sale_number, '^[0-9]{3}-([0-9]+)$', '\1'), sale_number)::integer)
from public.sales
where sale_number ~ '^[0-9]{3}-[0-9]+$'
group by company_id, split_part(sale_number, '-', 1)
on conflict (company_id, counter_key) do update
set current_value = greatest(
        public.number_counters.current_value,
        excluded.current_value
    ),
    updated_at = now();

insert into public.number_counters(company_id, counter_key, current_value)
select
    company_id,
    'invoice',
    max(nullif(regexp_replace(invoice_number, '^[0-9]{3}-([0-9]+)$', '\1'), invoice_number)::integer)
from public.invoices
where invoice_number ~ '^[0-9]{3}-[0-9]+$'
group by company_id
on conflict (company_id, counter_key) do update
set current_value = greatest(
        public.number_counters.current_value,
        excluded.current_value
    ),
    updated_at = now();

create or replace function public.next_purchase_number(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    current_year text := to_char(now(), 'YYYY');
    next_number integer;
begin
    insert into public.number_counters(company_id, counter_key, current_value)
    values (target_company_id, 'purchase:' || current_year, 1)
    on conflict (company_id, counter_key) do update
    set current_value = public.number_counters.current_value + 1,
        updated_at = now()
    returning current_value into next_number;

    return 'EK-' || lpad(next_number::text, 3, '0') || '-' || current_year;
end;
$$;

create or replace function public.next_sale_number(target_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    sale_year_prefix text := to_char(now(), 'YY');
    next_number integer;
begin
    insert into public.number_counters(company_id, counter_key, current_value)
    values (target_company_id, 'sale:' || sale_year_prefix, 1)
    on conflict (company_id, counter_key) do update
    set current_value = public.number_counters.current_value + 1,
        updated_at = now()
    returning current_value into next_number;

    return sale_year_prefix || '-' || lpad(next_number::text, 3, '0');
end;
$$;

create or replace function public.get_next_invoice_number(
    p_company_id uuid,
    p_invoice_type text default 'standard',
    p_invoice_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    invoice_year_prefix text := to_char(p_invoice_date, 'YY');
    next_number integer;
begin
    insert into public.number_counters(company_id, counter_key, current_value)
    values (p_company_id, 'invoice', 1)
    on conflict (company_id, counter_key) do update
    set current_value = public.number_counters.current_value + 1,
        updated_at = now()
    returning current_value into next_number;

    return invoice_year_prefix || '-' || lpad(next_number::text, 3, '0');
end;
$$;
