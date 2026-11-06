-- Trading Vault: least-privilege grants for the public schema.
-- RLS policies remain the row-level authorization boundary. This migration
-- aligns SQL privileges with those policies and prevents anonymous table access.
-- Apply as the Supabase migration owner (normally postgres).

begin;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

-- Private trader-owned records: RLS policies restrict every row to auth.uid().
grant select, insert, update, delete on table
  public.chart_scans,
  public.journal_entries,
  public.trades,
  public.user_experiments
to authenticated;

-- Profiles are provisioned by the auth-user trigger; users may read/update
-- their own profile, but cannot create/delete profile rows directly.
grant select, update on table public.profiles to authenticated;

-- Published shared Core Brain content is read-only to authenticated traders.
grant select on table
  public.core_brain_versions,
  public.core_brain_rules
to authenticated;

-- Traders may submit and read their own change proposals; review/approval
-- remains an owner-controlled process.
grant select, insert on table public.brain_change_proposals to authenticated;

-- UUID-backed tables do not need public sequence access. Keep sequences private.
revoke all privileges on all sequences in schema public from anon, authenticated;

-- Future tables/sequences created by postgres in public must receive explicit
-- grants in their migration rather than inheriting broad API-role privileges.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

commit;
