create or replace function public.delete_automation_return_document_version(
    p_company_id uuid,
    p_sale_id uuid,
    p_document_id uuid
)
returns table(
    deleted_upload_id uuid,
    deleted_version_id uuid,
    deleted_storage_path text,
    restored_version_id uuid,
    document_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    target_document public.documents%rowtype;
    target_version public.document_versions%rowtype;
    target_upload public.automation_return_uploads%rowtype;
    previous_version public.document_versions%rowtype;
    previous_upload public.automation_return_uploads%rowtype;
    was_document_deleted boolean := false;
begin
    select * into target_document
    from public.documents
    where id = p_document_id
      and company_id = p_company_id
      and sale_id = p_sale_id
      and source = 'automation_return'
    for update;

    if not found then
        raise exception 'automation return document not found';
    end if;
    if target_document.active_version_id is null then
        raise exception 'automation return document has no active version';
    end if;

    select * into target_version
    from public.document_versions
    where id = target_document.active_version_id
      and company_id = p_company_id
      and document_id = p_document_id
      and is_active = true
    for update;
    if not found then
        raise exception 'active automation return version not found';
    end if;

    select * into target_upload
    from public.automation_return_uploads
    where company_id = p_company_id
      and sale_id = p_sale_id
      and document_id = p_document_id
      and document_version_id = target_version.id
      and upload_kind = 'sale_document'
      and processing_status = 'completed'
    for update;
    if not found then
        raise exception 'automation return upload ledger not found';
    end if;

    select * into previous_version
    from public.document_versions
    where company_id = p_company_id
      and document_id = p_document_id
      and id <> target_version.id
    order by version_number desc
    limit 1
    for update;

    delete from public.automation_return_uploads
    where id = target_upload.id;

    update public.documents
    set active_version_id = null
    where id = p_document_id;

    delete from public.document_audit_log
    where company_id = p_company_id
      and document_id = p_document_id
      and version_id = target_version.id;

    delete from public.document_versions
    where id = target_version.id;

    if previous_version.id is not null then
        update public.document_versions
        set is_active = true
        where id = previous_version.id;

        select * into previous_upload
        from public.automation_return_uploads
        where company_id = p_company_id
          and sale_id = p_sale_id
          and document_id = p_document_id
          and document_version_id = previous_version.id
          and upload_kind = 'sale_document'
          and processing_status = 'completed'
        limit 1;

        update public.documents
        set
            active_version_id = previous_version.id,
            file_name = previous_version.original_file_name,
            file_path = previous_version.storage_path,
            mime_type = previous_version.mime_type,
            file_size = previous_version.file_size_bytes,
            status = case
                when previous_upload.signature_status = 'present'
                  and previous_upload.review_status <> 'rejected'
                then 'available'
                else 'needs_review'
            end,
            metadata = coalesce(previous_version.metadata, '{}'::jsonb),
            updated_at = now()
        where id = p_document_id;
    else
        delete from public.document_relations
        where company_id = p_company_id and document_id = p_document_id;

        delete from public.document_audit_log
        where company_id = p_company_id and document_id = p_document_id;

        delete from public.documents
        where id = p_document_id and company_id = p_company_id;

        was_document_deleted := true;
    end if;

    return query select
        target_upload.id,
        target_version.id,
        target_version.storage_path,
        previous_version.id,
        was_document_deleted;
end;
$$;

revoke all on function public.delete_automation_return_document_version(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.delete_automation_return_document_version(uuid, uuid, uuid)
to service_role;
