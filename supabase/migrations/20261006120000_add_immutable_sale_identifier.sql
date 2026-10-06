-- Stable, non-secret correlation identifier for automated document returns.
-- Existing sale_number values remain untouched and keep their financial meaning.

alter table public.sales
    add column if not exists sale_identifier text;

create or replace function public.generate_sale_identifier()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
    candidate text;
begin
    -- Serialize the tiny identifier-allocation section so even the extremely
    -- unlikely concurrent collision is regenerated before the unique check.
    perform pg_advisory_xact_lock(hashtext('sales:sale_identifier'));

    loop
        -- gen_random_uuid() is available in Supabase/PostgreSQL without
        -- depending on the schema in which pgcrypto was installed. Ten hex
        -- characters provide 40 random bits; the loop plus unique index
        -- safely handles the unlikely event of a collision.
        candidate := 'VK-' || upper(
            substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
        );

        exit when not exists (
            select 1
            from public.sales
            where sale_identifier = candidate
        );
    end loop;

    return candidate;
end;
$$;

alter table public.sales
    alter column sale_identifier set default public.generate_sale_identifier();

-- Repeatable backfill: rerunning the migration body only fills missing values.
update public.sales
set sale_identifier = public.generate_sale_identifier()
where sale_identifier is null or btrim(sale_identifier) = '';

alter table public.sales
    alter column sale_identifier set not null;

alter table public.sales
    drop constraint if exists sales_sale_identifier_format_check;

alter table public.sales
    add constraint sales_sale_identifier_format_check
    check (sale_identifier ~ '^VK-[A-F0-9]{10}$');

create unique index if not exists sales_sale_identifier_key
on public.sales(sale_identifier);

create or replace function public.protect_sale_identifier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        if new.sale_identifier is null or btrim(new.sale_identifier) = '' then
            new.sale_identifier := public.generate_sale_identifier();
        end if;

        return new;
    end if;

    if new.sale_identifier is distinct from old.sale_identifier then
        raise exception 'Die Verkaufskennung ist unveränderlich.'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_protect_sale_identifier on public.sales;
create trigger trg_protect_sale_identifier
before insert or update of sale_identifier on public.sales
for each row
execute function public.protect_sale_identifier();

comment on column public.sales.sale_identifier is
    'Unveränderliche, nicht geheime Kennung zur Zuordnung zurückgesendeter Verkaufsdokumente.';
