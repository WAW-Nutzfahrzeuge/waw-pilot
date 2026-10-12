create table if not exists public.automation_signature_requests (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null,
    notification_key text not null check (char_length(notification_key) between 1 and 200),
    request_fingerprint text not null check (char_length(request_fingerprint) = 64),
    sale_id uuid not null references public.sales(id) on delete restrict,
    original_document_types text[] not null,
    remaining_document_types text[] not null,
    recipient_email text,
    recipient_source text,
    status text not null check (status in ('processing', 'sent', 'failed', 'unknown', 'suppressed', 'needs_review')),
    suppression_reason text,
    reservation_token_hash text,
    provider_message_id text,
    result_reason text,
    attempt_count integer not null default 1 check (attempt_count > 0),
    claimed_at timestamptz,
    result_recorded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint automation_signature_requests_document_types_check check (
        original_document_types <@ array['entry_certificate', 'transport_proof', 'handover_protocol']::text[]
        and remaining_document_types <@ array['entry_certificate', 'transport_proof', 'handover_protocol']::text[]
        and cardinality(original_document_types) > 0
    ),
    constraint automation_signature_requests_processing_check check (
        status <> 'processing'
        or (
            reservation_token_hash is not null
            and recipient_email is not null
            and cardinality(remaining_document_types) > 0
            and claimed_at is not null
        )
    )
);

create unique index if not exists automation_signature_requests_company_notification_key
on public.automation_signature_requests(company_id, notification_key);

create index if not exists automation_signature_requests_sale_idx
on public.automation_signature_requests(company_id, sale_id, created_at desc);

alter table public.automation_signature_requests enable row level security;

comment on table public.automation_signature_requests is
'Server-only idempotency ledger for n8n signature follow-up emails. No email is sent by WAW Pilot.';

comment on column public.automation_signature_requests.recipient_email is
'Normalized email stored on the buyer linked through sales.buyer_customer_id at claim time; syntax validation does not verify mailbox ownership.';

create or replace function public.claim_automation_signature_request(
    p_company_id uuid,
    p_notification_key text,
    p_request_fingerprint text,
    p_sale_id uuid,
    p_original_document_types text[],
    p_remaining_document_types text[],
    p_recipient_email text,
    p_recipient_source text,
    p_initial_status text,
    p_suppression_reason text,
    p_reservation_token_hash text
)
returns table(request_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_id uuid;
    existing_request public.automation_signature_requests%rowtype;
begin
    if p_initial_status not in ('processing', 'suppressed', 'needs_review') then
        raise exception 'invalid initial signature request status';
    end if;

    if not exists (
        select 1 from public.sales
        where id = p_sale_id and company_id = p_company_id
    ) then
        raise exception 'sale does not belong to company';
    end if;

    if cardinality(p_original_document_types) = 0
       or not (p_remaining_document_types <@ p_original_document_types) then
        raise exception 'invalid signature request document types';
    end if;

    insert into public.automation_signature_requests (
        company_id, notification_key, request_fingerprint, sale_id,
        original_document_types, remaining_document_types,
        recipient_email, recipient_source, status, suppression_reason,
        reservation_token_hash, claimed_at
    ) values (
        p_company_id, p_notification_key, p_request_fingerprint, p_sale_id,
        p_original_document_types, p_remaining_document_types,
        p_recipient_email, p_recipient_source, p_initial_status, p_suppression_reason,
        case when p_initial_status = 'processing' then p_reservation_token_hash else null end,
        case when p_initial_status = 'processing' then now() else null end
    )
    on conflict (company_id, notification_key) do nothing
    returning id into inserted_id;

    if inserted_id is not null then
        return query select inserted_id,
            case p_initial_status
                when 'processing' then 'claimed'
                when 'suppressed' then 'suppressed'
                else 'needs_review'
            end;
        return;
    end if;

    select * into existing_request
    from public.automation_signature_requests
    where company_id = p_company_id
      and notification_key = p_notification_key
    for update;

    if existing_request.request_fingerprint <> p_request_fingerprint
       or existing_request.sale_id <> p_sale_id
       or existing_request.original_document_types <> p_original_document_types then
        return query select existing_request.id, 'conflict'::text;
        return;
    end if;

    if existing_request.status = 'failed' and p_initial_status = 'processing' then
        update public.automation_signature_requests set
            remaining_document_types = p_remaining_document_types,
            recipient_email = p_recipient_email,
            recipient_source = p_recipient_source,
            status = 'processing',
            suppression_reason = null,
            reservation_token_hash = p_reservation_token_hash,
            provider_message_id = null,
            result_reason = null,
            attempt_count = attempt_count + 1,
            claimed_at = now(),
            result_recorded_at = null,
            updated_at = now()
        where id = existing_request.id;
        return query select existing_request.id, 'claimed'::text;
        return;
    end if;

    return query select existing_request.id,
        case existing_request.status
            when 'sent' then 'already_sent'
            when 'processing' then 'processing'
            when 'suppressed' then 'suppressed'
            else 'needs_review'
        end;
end;
$$;

revoke all on function public.claim_automation_signature_request(uuid, text, text, uuid, text[], text[], text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.claim_automation_signature_request(uuid, text, text, uuid, text[], text[], text, text, text, text, text)
to service_role;

create or replace function public.record_automation_signature_request_result(
    p_company_id uuid,
    p_request_id uuid,
    p_reservation_token_hash text,
    p_result_status text,
    p_provider_message_id text,
    p_result_reason text
)
returns table(outcome text, stored_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
    target_request public.automation_signature_requests%rowtype;
begin
    if p_result_status not in ('sent', 'failed', 'unknown') then
        raise exception 'invalid signature request result status';
    end if;

    select * into target_request
    from public.automation_signature_requests
    where id = p_request_id and company_id = p_company_id
    for update;

    if not found then
        return query select 'not_found'::text, null::text;
        return;
    end if;

    if target_request.reservation_token_hash is distinct from p_reservation_token_hash then
        return query select 'invalid_reservation'::text, target_request.status;
        return;
    end if;

    if target_request.status = 'sent' then
        if p_result_status = 'sent'
           and target_request.provider_message_id is not distinct from p_provider_message_id then
            return query select 'idempotent'::text, target_request.status;
        else
            return query select 'already_sent'::text, target_request.status;
        end if;
        return;
    end if;

    if target_request.status = 'unknown' then
        if p_result_status = 'unknown'
           and target_request.provider_message_id is not distinct from p_provider_message_id
           and target_request.result_reason is not distinct from p_result_reason then
            return query select 'idempotent'::text, target_request.status;
        else
            return query select 'unknown_requires_review'::text, target_request.status;
        end if;
        return;
    end if;

    if target_request.status = 'failed' then
        if p_result_status = 'failed'
           and target_request.provider_message_id is not distinct from p_provider_message_id
           and target_request.result_reason is not distinct from p_result_reason then
            return query select 'idempotent'::text, target_request.status;
        else
            return query select 'result_conflict'::text, target_request.status;
        end if;
        return;
    end if;

    if target_request.status <> 'processing' then
        return query select 'result_conflict'::text, target_request.status;
        return;
    end if;

    update public.automation_signature_requests set
        status = p_result_status,
        provider_message_id = p_provider_message_id,
        result_reason = p_result_reason,
        result_recorded_at = now(),
        updated_at = now()
    where id = target_request.id;

    return query select 'recorded'::text, p_result_status;
end;
$$;

revoke all on function public.record_automation_signature_request_result(uuid, uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.record_automation_signature_request_result(uuid, uuid, text, text, text, text)
to service_role;

