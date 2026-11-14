-- Read-only catalog assertions for the private Trader workspace.
do $$
declare
  table_name text;
  expected_tables text[] := array[
    'trader_profiles',
    'trader_evidence_bundles',
    'trader_reasoning_reports',
    'trader_scenarios',
    'trader_experiments',
    'trader_journal_entries'
  ];
  expected_policies text[] := array[
    'trader_profiles_owner_all',
    'trader_evidence_bundles_owner_all',
    'trader_reasoning_reports_owner_all',
    'trader_scenarios_owner_all',
    'trader_experiments_owner_all',
    'trader_journal_entries_owner_all'
  ];
  policy_name text;
begin
  foreach table_name in array expected_tables loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relrowsecurity
        and c.relforcerowsecurity
    ) then
      raise exception 'RLS missing or not forced on public.%', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'anon unexpectedly has SELECT on public.%', table_name;
    end if;
  end loop;

  foreach policy_name in array expected_policies loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and policyname = policy_name
        and roles @> array['authenticated']::name[]
        and cmd = 'ALL'
        and qual like '%auth.uid()%'
        and with_check like '%auth.uid()%'
    ) then
      raise exception 'Missing or incomplete owner policy: %', policy_name;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets
    where id = 'trader-charts'
      and public = false
      and file_size_limit = 15728640
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
  ) then
    raise exception 'Private trader-charts bucket configuration is incorrect';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'trader_charts_%'
      and roles @> array['authenticated']::name[]
  ) <> 4 then
    raise exception 'Expected four authenticated trader chart object policies';
  end if;

  if has_function_privilege('authenticated', 'private.set_updated_at()', 'EXECUTE') then
    raise exception 'Timestamp trigger helper must not be directly executable by authenticated';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trader_experiments'::regclass
      and conname = 'trader_experiments_private_state_check'
  ) then
    raise exception 'Private experiment state boundary is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trader_experiments'::regclass
      and conname = 'trader_experiments_owner_approval_required_check'
  ) then
    raise exception 'Owner approval requirement is not enforced';
  end if;
end;
$$;
