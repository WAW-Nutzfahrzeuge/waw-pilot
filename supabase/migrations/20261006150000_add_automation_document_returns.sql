create table if not exists public.automation_return_uploads (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    upload_kind text not null check (upload_kind in ('original', 'sale_document')),
    idempotency_key text not null,
    request_fingerprint text not null,
    processing_status text not null default 'processing'
        check (processing_status in ('processing', 'completed', 'failed')),
    sale_id uuid references public.sales(id) on delete restrict,
    sale_identifier text,
    document_id uuid references public.documents(id) on delete restrict,
    document_version_id uuid references public.document_versions(id) on delete restrict,
    parent_original_upload_id uuid references public.automation_return_uploads(id) on delete restrict,
    document_type text,
    original_file_name text not null,
    storage_bucket text not null default 'documents',
    storage_path text,
    mime_type text not null,
    file_size_bytes bigint not null check (file_size_bytes > 0),
    sha256 text not null,
    return_id text,
    source_email_id text,
    source_attachment_id text,
    original_page_numbers integer[],
    received_at timestamptz not null,
    signature_status text check (signature_status in ('present', 'absent', 'uncertain')),
    review_status text check (review_status in ('pending', 'needs_review', 'accepted', 'rejected')),
    review_reason text,
    error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint automation_return_uploads_kind_fields_check check (
        (upload_kind = 'original' and sale_id is null and document_id is null and document_type is null)
        or
        (upload_kind = 'sale_document' and sale_id is not null and document_type is not null)
    )
);

create unique index if not exists automation_return_uploads_company_idempotency_key
on public.automation_return_uploads(company_id, idempotency_key);

create index if not exists automation_return_uploads_sale_idx
on public.automation_return_uploads(company_id, sale_id, created_at desc)
where sale_id is not null;

create index if not exists automation_return_uploads_original_idx
on public.automation_return_uploads(company_id, parent_original_upload_id)
where parent_original_upload_id is not null;

alter table public.automation_return_uploads enable row level security;

comment on table public.automation_return_uploads is
'Server-only idempotency and provenance ledger for n8n document returns. Access is via the service role after dedicated API authentication.';

comment on column public.automation_return_uploads.signature_status is
'Visible signature detection only; this is neither authenticity verification nor manual approval.';

create or replace function public.complete_automation_sale_document_upload(
    p_upload_id uuid,
    p_company_id uuid,
    p_storage_path text,
    p_document_status text,
    p_document_metadata jsonb,
    p_replaces_document_id uuid default null
)
returns table(document_id uuid, document_version_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
    target_upload public.automation_return_uploads%rowtype;
    target_sale public.sales%rowtype;
    target_document_id uuid;
    target_version_id uuid;
begin
    select * into target_upload
    from public.automation_return_uploads
    where id = p_upload_id and company_id = p_company_id
    for update;

    if not found or target_upload.upload_kind <> 'sale_document' then
        raise exception 'automation upload not found';
    end if;
    if target_upload.processing_status <> 'processing' then
        raise exception 'automation upload is not processing';
    end if;
    if p_document_status not in ('available', 'needs_review') then
        raise exception 'invalid document status';
    end if;

    select * into target_sale
    from public.sales
    where id = target_upload.sale_id
      and company_id = p_company_id;
    if not found or target_sale.sale_identifier <> target_upload.sale_identifier then
        raise exception 'sale assignment changed';
    end if;

    if p_replaces_document_id is not null then
        select id into target_document_id
        from public.documents
        where id = p_replaces_document_id
          and company_id = p_company_id
          and sale_id = target_sale.id
          and document_type = target_upload.document_type
          and source = 'automation_return'
        for update;
        if not found then raise exception 'replacement document not found'; end if;

        update public.documents set
            file_name = target_upload.original_file_name,
            file_path = p_storage_path,
            mime_type = target_upload.mime_type,
            file_size = target_upload.file_size_bytes,
            status = p_document_status,
            metadata = p_document_metadata,
            title = target_upload.original_file_name
        where id = target_document_id;
    else
        insert into public.documents (
            company_id, sale_id, vehicle_id, customer_id, document_type, source, status,
            file_name, file_path, mime_type, file_size, generated_by_system, title, metadata
        ) values (
            p_company_id, target_sale.id, target_sale.vehicle_id, target_sale.buyer_customer_id,
            target_upload.document_type, 'automation_return', p_document_status,
            target_upload.original_file_name, p_storage_path, target_upload.mime_type,
            target_upload.file_size_bytes, false, target_upload.original_file_name, p_document_metadata
        ) returning id into target_document_id;
    end if;

    select active_version_id into target_version_id
    from public.documents where id = target_document_id;

    update public.automation_return_uploads set
        processing_status = 'completed', storage_path = p_storage_path,
        document_id = target_document_id, document_version_id = target_version_id,
        completed_at = now(), updated_at = now(), error_code = null
    where id = p_upload_id;

    return query select target_document_id, target_version_id;
end;
$$;

revoke all on function public.complete_automation_sale_document_upload(uuid, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.complete_automation_sale_document_upload(uuid, uuid, text, text, jsonb, uuid) to service_role;
