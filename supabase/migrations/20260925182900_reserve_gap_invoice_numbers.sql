-- Gap-fill for the historic proforma-numbering bug (see
-- 20260925170900_separate_proforma_invoice_numbering.sql for the root-cause
-- fix). Before that fix, proforma invoices consumed sequence values from the
-- shared regular ('invoice') counter but were stored with a "PRO-" prefix
-- (e.g. "PRO-026-141"), so the plain regular number ("026-141") was reserved
-- in the counter but never actually issued as a real invoice document.
--
-- Business decision: these specific reserved-but-unused regular numbers
-- should be handed out to the next real ("standard") invoices created,
-- INSTEAD OF renumbering/renaming any already-issued invoice (some of which
-- have already been emailed to customers and must never change).
--
-- This migration is intentionally read/derive-only with respect to existing
-- invoice_number values: it does NOT alter, rename or delete a single
-- existing invoice, and it does NOT rewind/reset the regular 'invoice'
-- counter. It only adds a small, generic, concurrency-safe "reservation
-- queue" that get_next_invoice_number() drains (in order) before falling
-- back to the normal atomic counter increment.

create table if not exists public.invoice_number_reservations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    invoice_type text not null,
    invoice_number text not null,
    reason text,
    created_at timestamptz not null default now(),
    used_at timestamptz,
    used_by_invoice_id uuid references public.invoices(id) on delete set null
);

create unique index if not exists invoice_number_reservations_company_number_key
on public.invoice_number_reservations(company_id, invoice_number);

create index if not exists invoice_number_reservations_pending_idx
on public.invoice_number_reservations(company_id, invoice_type, invoice_number)
where used_at is null;

-- Derive the reservation generically from existing data: for every proforma
-- invoice whose number matches the PRO-<year>-<seq> pattern, reserve the
-- corresponding plain "<year>-<seq>" regular number for that same company,
-- unless a real invoice with that exact number already exists somehow.
insert into public.invoice_number_reservations (company_id, invoice_type, invoice_number, reason)
select
    p.company_id,
    'standard',
    split_part(p.invoice_number, '-', 2) || '-' || split_part(p.invoice_number, '-', 3),
    'Luecke aus dem frueheren Proforma-Zaehler-Bug: Nummer wurde durch '
        || p.invoice_number || ' verbraucht, aber nie als reguläre Rechnung ausgestellt.'
from public.invoices p
where p.invoice_type = 'proforma'
  and p.invoice_number ~ '^PRO-[0-9]{3}-[0-9]+$'
  and not exists (
      select 1
      from public.invoices existing
      where existing.company_id = p.company_id
        and existing.invoice_number =
            split_part(p.invoice_number, '-', 2) || '-' || split_part(p.invoice_number, '-', 3)
  )
on conflict (company_id, invoice_number) do nothing;

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
    reserved_number text;
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

    -- Drain a manually reserved gap number first (atomic, race-safe via
    -- SKIP LOCKED). Reservations are a one-off correction mechanism, not a
    -- replacement for the regular counter: once drained, this has no effect
    -- and numbering falls back to the atomic counter below.
    update public.invoice_number_reservations
    set used_at = now()
    where id = (
        select id
        from public.invoice_number_reservations
        where company_id = p_company_id
          and invoice_type = p_invoice_type
          and used_at is null
        order by invoice_number asc
        for update skip locked
        limit 1
    )
    returning invoice_number into reserved_number;

    if reserved_number is not null then
        return reserved_number;
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
