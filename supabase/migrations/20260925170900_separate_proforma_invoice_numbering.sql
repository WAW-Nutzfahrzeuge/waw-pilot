-- Fixes: proforma invoices were consuming numbers from the regular invoice
-- number circle because get_next_invoice_number() ignored p_invoice_type and
-- always used the shared 'invoice' counter for every invoice type.
--
-- This migration:
-- 1. Gives proforma invoices their own, year-scoped counter and their own
--    "PRO-<year>-<seq>" format (e.g. PRO-026-001), fully separate from the
--    regular invoice counter/format.
-- 2. Leaves the regular invoice counter (counter_key = 'invoice') and its
--    existing output format completely untouched for every other invoice
--    type (standard, down_payment, cancellation_invoice, credit_note), so no
--    already-issued regular invoice number or the running counter value is
--    affected.
-- 3. Adds a nullable, self-referencing column so a later "real" invoice
--    created from a proforma can be linked back to it (and vice versa via a
--    reverse lookup), without introducing a second/duplicate relation model.

alter table public.invoices
    add column if not exists source_proforma_invoice_id uuid references public.invoices(id) on delete restrict;

alter table public.invoices
    drop constraint if exists invoices_no_self_source_proforma;

alter table public.invoices
    add constraint invoices_no_self_source_proforma check (
        source_proforma_invoice_id is null or source_proforma_invoice_id <> id
    );

-- A proforma may only ever be converted into one single final invoice.
create unique index if not exists invoices_source_proforma_invoice_id_key
on public.invoices(source_proforma_invoice_id)
where source_proforma_invoice_id is not null;

create index if not exists invoices_company_source_proforma_idx
on public.invoices(company_id, source_proforma_invoice_id);

create or replace function public.assert_invoice_source_proforma_same_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    referenced_company_id uuid;
    referenced_invoice_type text;
begin
    if new.source_proforma_invoice_id is not null then
        select company_id, invoice_type
        into referenced_company_id, referenced_invoice_type
        from public.invoices
        where id = new.source_proforma_invoice_id;

        if referenced_company_id is null or referenced_company_id <> new.company_id then
            raise exception 'Proforma-Rechnung und finale Rechnung müssen zum selben Unternehmen gehören.';
        end if;

        if referenced_invoice_type is distinct from 'proforma' then
            raise exception 'source_proforma_invoice_id muss auf eine Proforma-Rechnung verweisen.';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_assert_invoice_source_proforma_same_company on public.invoices;
create trigger trg_assert_invoice_source_proforma_same_company
before insert or update of source_proforma_invoice_id, company_id on public.invoices
for each row
execute function public.assert_invoice_source_proforma_same_company();

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
    invoice_year_prefix text;
    proforma_year_prefix text;
    next_number integer;
begin
    if p_invoice_type = 'proforma' then
        proforma_year_prefix := to_char(p_invoice_date, 'YYY');

        insert into public.number_counters(company_id, counter_key, current_value)
        values (p_company_id, 'invoice:proforma:' || proforma_year_prefix, 1)
        on conflict (company_id, counter_key) do update
        set current_value = public.number_counters.current_value + 1,
            updated_at = now()
        returning current_value into next_number;

        return 'PRO-' || proforma_year_prefix || '-' || lpad(next_number::text, 3, '0');
    end if;

    -- Regular counter/format, unchanged for standard, down_payment,
    -- cancellation_invoice and credit_note invoices.
    invoice_year_prefix := to_char(p_invoice_date, 'YY');

    insert into public.number_counters(company_id, counter_key, current_value)
    values (p_company_id, 'invoice', 1)
    on conflict (company_id, counter_key) do update
    set current_value = public.number_counters.current_value + 1,
        updated_at = now()
    returning current_value into next_number;

    return invoice_year_prefix || '-' || lpad(next_number::text, 3, '0');
end;
$$;
