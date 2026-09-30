alter table public.companies
    add column if not exists datev_invoice_upload_email text;

alter table public.companies
    alter column datev_invoice_upload_email
    set default '56abe163-b367-433f-896e-8f66073a75b1@uploadmail.datev.de';

update public.companies
set datev_invoice_upload_email = '56abe163-b367-433f-896e-8f66073a75b1@uploadmail.datev.de'
where datev_invoice_upload_email is null
   or btrim(datev_invoice_upload_email) = '';
