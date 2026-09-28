-- Bugfix: the regular ("standard") invoice branch of get_next_invoice_number()
-- has always used a 2-digit year prefix (to_char(..., 'YY') -> "26"), while
-- every other part of the system uses/expects a 3-digit year prefix (e.g.
-- "026"):
--   - the proforma branch itself (to_char(..., 'YYY') -> "026-...")
--   - the reservation-queue rows added by
--     20260925182900_reserve_gap_invoice_numbers.sql, which derive their
--     invoice_number directly from the proforma's own 3-digit prefix
--     (e.g. "026-141")
--   - the historic-data seed regex in
--     20260907120000_add_atomic_number_counters.sql ('^[0-9]{3}-([0-9]+)$')
--   - tests/numbering.test.ts and every mock/fixture across the codebase
--
-- This produced inconsistent, visibly wrong invoice numbers such as "26-145"
-- next to "PRO-026-002" / "026-141" once proforma and regular numbers were
-- shown together in the UI.
--
-- This migration ONLY changes the textual year-prefix format used for
-- newly-generated regular invoice numbers going forward. It does not:
--   - rename/renumber any already-issued invoice_number
--   - reset or alter the underlying 'invoice' counter's current_value
--   - touch the proforma branch or the reservation-draining logic
--
-- Already-issued invoice numbers in the old 2-digit format remain as
-- historical records and must not be edited by this migration.
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

    -- Fixed: 3-digit year prefix ("026"), consistent with the proforma
    -- branch, the reservation queue and every existing test/fixture.
    invoice_year_prefix := to_char(p_invoice_date, 'YYY');

    insert into public.number_counters(company_id, counter_key, current_value)
    values (p_company_id, 'invoice', 1)
    on conflict (company_id, counter_key) do update
    set current_value = public.number_counters.current_value + 1,
        updated_at = now()
    returning current_value into next_number;

    return invoice_year_prefix || '-' || lpad(next_number::text, 3, '0');
end;
$$;
