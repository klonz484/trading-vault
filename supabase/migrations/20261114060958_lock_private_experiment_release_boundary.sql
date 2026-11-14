-- Private Trader experiments may research and recommend; they cannot approve or publish Core releases.
alter table public.trader_experiments
  drop constraint if exists trader_experiments_state_check;

alter table public.trader_experiments
  add constraint trader_experiments_private_state_check
  check (state in (
    'proposed',
    'designed',
    'approved_for_research',
    'running',
    'completed',
    'inconclusive',
    'rejected',
    'recommended'
  ));

alter table public.trader_experiments
  add constraint trader_experiments_owner_approval_required_check
  check (requires_owner_approval_for_release is true);
