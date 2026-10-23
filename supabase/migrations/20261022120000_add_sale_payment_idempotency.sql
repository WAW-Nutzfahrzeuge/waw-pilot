alter table public.sale_payments
    add column if not exists idempotency_key uuid,
    add column if not exists request_fingerprint text,
    add column if not exists finalization_status text not null default 'completed',
    add column if not exists finalization_started_at timestamptz;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'sale_payments_finalization_status_check'
          and conrelid = 'public.sale_payments'::regclass
    ) then
        alter table public.sale_payments
            add constraint sale_payments_finalization_status_check
            check (finalization_status in ('pending', 'processing', 'failed', 'completed'));
    end if;
end;
$$;

create unique index if not exists sale_payments_company_idempotency_key_uidx
    on public.sale_payments (company_id, idempotency_key)
    where idempotency_key is not null;

comment on column public.sale_payments.idempotency_key is
    'Stable client-generated key that prevents duplicate sale-payment inserts on request retries.';

comment on column public.sale_payments.request_fingerprint is
    'SHA-256 fingerprint of the normalized payment request, used to reject key reuse with different values.';

comment on column public.sale_payments.finalization_status is
    'Tracks retryable audit/status/financial-journal finalization after a sale-payment row is inserted.';
