-- MT5 ingestion transport hardening.
-- This migration is safe to apply to the existing private MT5 tables: it only
-- adds the credential binding/rate-limit state and tightens server-only access.
begin;

create table if not exists public.mt5_connector_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null check (broker_id in ('RCG_MARKETS', 'VAULT_MARKETS')),
  terminal_instance_id text not null check (length(terminal_instance_id) between 1 and 128),
  token_hash text not null unique check (length(token_hash) = 64),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create table if not exists public.mt5_ingest_batches (
  id uuid primary key default gen_random_uuid(),
  broker_id text not null check (broker_id in ('RCG_MARKETS', 'VAULT_MARKETS')),
  batch_id text not null check (length(batch_id) between 1 and 128),
  terminal_instance_id text not null check (length(terminal_instance_id) between 1 and 128),
  payload_hash text not null check (length(payload_hash) = 64),
  sent_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  candle_count integer not null check (candle_count >= 0),
  tick_count integer not null check (tick_count >= 0),
  candles jsonb not null,
  ticks jsonb not null,
  constraint mt5_ingest_batches_broker_batch_unique unique (broker_id, batch_id)
);

alter table public.mt5_ingest_batches
  add column if not exists collector_credential_id uuid
  references public.mt5_connector_credentials(id) on delete restrict;

create index if not exists mt5_ingest_batches_collector_received_idx
  on public.mt5_ingest_batches (collector_credential_id, received_at desc);

create unique index if not exists mt5_ingest_batches_collector_batch_uidx
  on public.mt5_ingest_batches (collector_credential_id, batch_id)
  where collector_credential_id is not null;

create table if not exists public.mt5_ingest_rate_limits (
  credential_id uuid not null references public.mt5_connector_credentials(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (credential_id, window_start)
);

alter table public.mt5_connector_credentials enable row level security;
alter table public.mt5_ingest_batches enable row level security;
alter table public.mt5_ingest_rate_limits enable row level security;

revoke all on table public.mt5_connector_credentials from anon, authenticated;
revoke all on table public.mt5_ingest_batches from anon, authenticated;
revoke all on table public.mt5_ingest_rate_limits from anon, authenticated;

grant all on table public.mt5_connector_credentials to service_role;
grant all on table public.mt5_ingest_batches to service_role;
grant select, insert, update, delete on table public.mt5_ingest_rate_limits to service_role;

create or replace function public.consume_mt5_ingest_rate_limit(
  p_credential_id uuid,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_window_start timestamptz;
  v_allowed boolean;
begin
  if p_window_seconds < 1 or p_window_seconds > 3600
     or p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'Invalid MT5 ingestion rate-limit configuration';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.mt5_ingest_rate_limits (credential_id, window_start, request_count)
  values (p_credential_id, v_window_start, 1)
  on conflict (credential_id, window_start)
  do update
    set request_count = public.mt5_ingest_rate_limits.request_count + 1
    where public.mt5_ingest_rate_limits.request_count < p_max_requests
  returning true into v_allowed;

  delete from public.mt5_ingest_rate_limits
  where window_start < clock_timestamp() - interval '2 days';

  return coalesce(v_allowed, false);
end;
$function$;

revoke all on function public.consume_mt5_ingest_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_mt5_ingest_rate_limit(uuid, integer, integer) to service_role;

commit;
