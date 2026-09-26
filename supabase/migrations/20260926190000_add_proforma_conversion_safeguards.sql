-- Hardens the proforma -> final invoice conversion flow described in the
-- "Rechnungsart bei Verkaufserstellung" feature:
--
-- 1. Until now, "at most one standard invoice and at most one proforma
--    invoice per sale" was only an app-level invariant (a SELECT-then-INSERT
--    check in createSaleInvoiceAction). Two concurrent requests (e.g. a
--    doubleclick on "In Rechnung umwandeln", or two browser tabs) could both
--    pass that check before either INSERT completed, creating two final
--    invoices (and consuming two regular invoice numbers) for one sale. This
--    adds a real, atomic database constraint for that invariant. It only
--    covers 'standard' and 'proforma' - down_payment/cancellation_invoice/
--    credit_note intentionally may occur more than once per sale (corrections
--    chain) and are left untouched.
--
-- 2. Adds 'converted' as an allowed free-text value for invoices.status so a
--    proforma that has been turned into a final invoice can be marked as
--    such (invoices.status has no CHECK constraint, so no DDL change is
--    required for that - this comment documents the new value for clarity).
--
-- IMPORTANT (manual step before running in production):
-- Run the following check first. If it returns any rows, resolve those
-- duplicates manually (e.g. via the existing Storno/correction process)
-- before applying this migration, otherwise the unique index creation below
-- will fail:
--
--   select company_id, sale_id, invoice_type, count(*)
--   from public.invoices
--   where invoice_type in ('standard', 'proforma')
--   group by company_id, sale_id, invoice_type
--   having count(*) > 1;

create unique index if not exists invoices_company_sale_single_type_key
on public.invoices(company_id, sale_id, invoice_type)
where invoice_type in ('standard', 'proforma');
