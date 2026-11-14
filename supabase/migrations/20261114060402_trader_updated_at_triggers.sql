-- Keep updated_at trustworthy without exposing a callable RPC.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger trader_profiles_set_updated_at
before update on public.trader_profiles
for each row execute function private.set_updated_at();

create trigger trader_scenarios_set_updated_at
before update on public.trader_scenarios
for each row execute function private.set_updated_at();

create trigger trader_experiments_set_updated_at
before update on public.trader_experiments
for each row execute function private.set_updated_at();

create trigger trader_journal_entries_set_updated_at
before update on public.trader_journal_entries
for each row execute function private.set_updated_at();
