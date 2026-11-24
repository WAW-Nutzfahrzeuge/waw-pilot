alter table public.companies
    add column if not exists email_signature_html text not null default '',
    add column if not exists email_signature_includes_closing boolean not null default false,
    add column if not exists email_signature_assets jsonb not null default '[]'::jsonb;

alter table public.companies
    drop constraint if exists companies_email_signature_assets_array_check;

alter table public.companies
    add constraint companies_email_signature_assets_array_check
    check (jsonb_typeof(email_signature_assets) = 'array');

comment on column public.companies.email_signature_html is
    'Sanitized HTML signature appended to outgoing customer email. Inline images use CID references.';
comment on column public.companies.email_signature_includes_closing is
    'When true, known standard email sign-offs are removed before appending the configured signature.';
comment on column public.companies.email_signature_assets is
    'Private company email signature asset metadata; binary files remain in the private documents bucket.';
