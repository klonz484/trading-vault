-- Private Trader workspace foundation.
-- Additive migration for the TradingVault-Development environment.
-- Private records are owned by one authenticated user; Shared Core remains separate.

create table if not exists public.trader_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  base_currency text not null default 'USD',
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trader_evidence_bundles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bundle_id text not null,
  bundle_version text not null,
  workflow text not null check (workflow in ('current_market', 'upcoming_session')),
  instrument text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (owner_id, bundle_id, bundle_version),
  unique (owner_id, id)
);

create table if not exists public.trader_reasoning_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  report_id text not null,
  report_version text not null,
  evidence_bundle_row_id uuid,
  workflow text not null check (workflow in ('current_market', 'upcoming_session')),
  instrument text not null,
  evaluated_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (owner_id, report_id, report_version),
  unique (owner_id, id),
  foreign key (owner_id, evidence_bundle_row_id)
    references public.trader_evidence_bundles(owner_id, id) on delete restrict
);

create table if not exists public.trader_scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scenario_id text not null,
  scenario_version text not null,
  workflow text not null check (workflow in ('current_market', 'upcoming_session')),
  instrument text not null,
  timeframe text not null,
  state text not null check (state in (
    'candidate', 'waiting_for_trigger', 'trigger_observed_provisional',
    'confirmed', 'invalidated', 'expired', 'cancelled', 'suspended', 'superseded'
  )),
  evidence_bundle_row_id uuid,
  reasoning_report_row_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, scenario_id, scenario_version),
  foreign key (owner_id, evidence_bundle_row_id)
    references public.trader_evidence_bundles(owner_id, id) on delete restrict,
  foreign key (owner_id, reasoning_report_row_id)
    references public.trader_reasoning_reports(owner_id, id) on delete restrict
);

create table if not exists public.trader_experiments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  experiment_id text not null,
  version text not null,
  state text not null check (state in (
    'proposed', 'designed', 'approved_for_research', 'running',
    'completed', 'inconclusive', 'rejected', 'recommended',
    'approved_for_release', 'released', 'rolled_back'
  )),
  requires_owner_approval_for_release boolean not null default true,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, experiment_id, version),
  unique (owner_id, id)
);

create table if not exists public.trader_journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  instrument text not null,
  timeframe text,
  entry_type text not null default 'note',
  occurred_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trader_evidence_bundles_owner_created_idx
  on public.trader_evidence_bundles (owner_id, created_at desc);
create index if not exists trader_reasoning_reports_owner_instrument_idx
  on public.trader_reasoning_reports (owner_id, instrument, evaluated_at desc);
create index if not exists trader_scenarios_owner_state_idx
  on public.trader_scenarios (owner_id, state, updated_at desc);
create index if not exists trader_experiments_owner_state_idx
  on public.trader_experiments (owner_id, state, updated_at desc);
create index if not exists trader_journal_entries_owner_occurred_idx
  on public.trader_journal_entries (owner_id, occurred_at desc);

alter table public.trader_profiles enable row level security;
alter table public.trader_evidence_bundles enable row level security;
alter table public.trader_reasoning_reports enable row level security;
alter table public.trader_scenarios enable row level security;
alter table public.trader_experiments enable row level security;
alter table public.trader_journal_entries enable row level security;

alter table public.trader_profiles force row level security;
alter table public.trader_evidence_bundles force row level security;
alter table public.trader_reasoning_reports force row level security;
alter table public.trader_scenarios force row level security;
alter table public.trader_experiments force row level security;
alter table public.trader_journal_entries force row level security;

revoke all on public.trader_profiles, public.trader_evidence_bundles,
  public.trader_reasoning_reports, public.trader_scenarios,
  public.trader_experiments, public.trader_journal_entries
  from public, anon;

grant select, insert, update, delete on public.trader_profiles,
  public.trader_evidence_bundles, public.trader_reasoning_reports,
  public.trader_scenarios, public.trader_experiments,
  public.trader_journal_entries to authenticated;

create policy trader_profiles_owner_all
  on public.trader_profiles for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy trader_evidence_bundles_owner_all
  on public.trader_evidence_bundles for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy trader_reasoning_reports_owner_all
  on public.trader_reasoning_reports for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy trader_scenarios_owner_all
  on public.trader_scenarios for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy trader_experiments_owner_all
  on public.trader_experiments for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy trader_journal_entries_owner_all
  on public.trader_journal_entries for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Private chart storage. Object path must begin with the authenticated user UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trader-charts',
  'trader-charts',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy trader_charts_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'trader-charts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy trader_charts_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trader-charts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy trader_charts_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'trader-charts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'trader-charts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy trader_charts_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'trader-charts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
