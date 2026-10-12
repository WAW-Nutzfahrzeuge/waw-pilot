-- Automation return uploads are regular private sale documents, but keep a
-- distinct source so that their review and version metadata remain intact.
-- Preserve the deployed source constraint verbatim and extend it only with
-- the new source instead of assuming which legacy values it contains.
do $$
declare
    existing_expression text;
begin
    select pg_get_expr(constraint_row.conbin, constraint_row.conrelid)
      into existing_expression
      from pg_constraint as constraint_row
     where constraint_row.conrelid = 'public.documents'::regclass
       and constraint_row.conname = 'documents_source_check'
       and constraint_row.contype = 'c';

    if existing_expression is null then
        raise exception 'Required constraint public.documents.documents_source_check was not found';
    end if;

    if existing_expression like '%automation_return%' then
        return;
    end if;

    alter table public.documents
        drop constraint documents_source_check;

    execute format(
        'alter table public.documents add constraint documents_source_check check ((source = %L) or (%s)) not valid',
        'automation_return',
        existing_expression
    );

    alter table public.documents
        validate constraint documents_source_check;
end;
$$;

