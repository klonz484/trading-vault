-- Keep private scenario state transitions deterministic and evidence-gated at the database boundary.
alter table public.trader_scenarios
  add column if not exists expires_at timestamptz;

alter table public.trader_scenarios
  add constraint trader_scenarios_expiry_after_creation_check
  check (expires_at is null or expires_at > created_at);

create or replace function private.guard_trader_scenario_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transition_allowed boolean := false;
  combined_conditions jsonb;
begin
  if jsonb_typeof(new.payload) is distinct from 'object' then
    raise exception 'Scenario payload must be a JSON object' using errcode = '23514';
  end if;

  if jsonb_typeof(new.payload -> 'triggerConditions') is distinct from 'array'
     or jsonb_array_length(coalesce(new.payload -> 'triggerConditions', '[]'::jsonb)) = 0 then
    raise exception 'Scenario requires at least one explicit trigger condition' using errcode = '23514';
  end if;

  combined_conditions :=
    coalesce(new.payload -> 'triggerConditions', '[]'::jsonb)
    || coalesce(new.payload -> 'confirmationConditions', '[]'::jsonb)
    || coalesce(new.payload -> 'invalidationConditions', '[]'::jsonb);

  if exists (
    select 1
    from jsonb_array_elements(combined_conditions) as condition(value)
    where condition.value ->> 'requiredState' = 'confirmed'
      and condition.value ->> 'candleRequirement' = 'forming_allowed'
  ) then
    raise exception 'Confirmed-only scenario conditions cannot rely on forming candles' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.state not in ('candidate', 'waiting_for_trigger') then
      raise exception 'New scenarios must begin as candidate or waiting_for_trigger' using errcode = '23514';
    end if;

    new.payload := jsonb_set(new.payload, '{state}', to_jsonb(new.state), true);
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.scenario_id is distinct from old.scenario_id
     or new.scenario_version is distinct from old.scenario_version
     or new.workflow is distinct from old.workflow
     or new.instrument is distinct from old.instrument
     or new.timeframe is distinct from old.timeframe
     or new.evidence_bundle_row_id is distinct from old.evidence_bundle_row_id
     or new.reasoning_report_row_id is distinct from old.reasoning_report_row_id
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at
     or (new.payload - 'state') is distinct from (old.payload - 'state') then
    raise exception 'Scenario definitions are immutable; create a new scenario version instead' using errcode = '23514';
  end if;

  if new.state is distinct from old.state then
    transition_allowed := case old.state
      when 'candidate' then new.state = any (array['waiting_for_trigger','suspended','cancelled','superseded','expired'])
      when 'waiting_for_trigger' then new.state = any (array['trigger_observed_provisional','confirmed','invalidated','suspended','cancelled','superseded','expired'])
      when 'trigger_observed_provisional' then new.state = any (array['waiting_for_trigger','confirmed','invalidated','suspended','cancelled','superseded','expired'])
      when 'confirmed' then new.state = any (array['invalidated','expired','cancelled','superseded','suspended'])
      when 'suspended' then new.state = any (array['waiting_for_trigger','trigger_observed_provisional','confirmed','invalidated','cancelled','superseded','expired'])
      else false
    end;

    if not transition_allowed then
      raise exception 'Scenario state transition from % to % is not allowed', old.state, new.state using errcode = '23514';
    end if;
  end if;

  if new.state = 'confirmed' and old.state is distinct from 'confirmed' then
    if new.expires_at is not null and new.expires_at <= now() then
      raise exception 'Expired scenarios cannot be confirmed' using errcode = '23514';
    end if;

    if new.evidence_bundle_row_id is null or not exists (
      select 1
      from public.trader_evidence_bundles bundle
      where bundle.id = new.evidence_bundle_row_id
        and bundle.owner_id = new.owner_id
        and bundle.instrument = new.instrument
        and jsonb_typeof(bundle.payload -> 'evidence') = 'array'
        and exists (
          select 1
          from jsonb_array_elements(bundle.payload -> 'evidence') as evidence(value)
          where evidence.value ->> 'state' = 'confirmed'
            and evidence.value ->> 'quality' = 'valid'
            and evidence.value ->> 'instrument' = new.instrument
            and evidence.value ->> 'timeframe' = new.timeframe
            and nullif(evidence.value ->> 'confirmedAt', '') is not null
        )
    ) then
      raise exception 'Scenario confirmation requires matching confirmed, valid evidence from the same trader' using errcode = '23514';
    end if;
  end if;

  new.payload := jsonb_set(new.payload, '{state}', to_jsonb(new.state), true);
  return new;
end;
$$;

revoke all on function private.guard_trader_scenario_lifecycle() from public, anon, authenticated;

create trigger trader_scenarios_lifecycle_guard
before insert or update on public.trader_scenarios
for each row execute function private.guard_trader_scenario_lifecycle();
