-- Cover tenant-scoped foreign keys used by Brain records.
create index if not exists trader_reasoning_reports_owner_evidence_idx
  on public.trader_reasoning_reports (owner_id, evidence_bundle_row_id);

create index if not exists trader_scenarios_owner_evidence_idx
  on public.trader_scenarios (owner_id, evidence_bundle_row_id);

create index if not exists trader_scenarios_owner_reasoning_idx
  on public.trader_scenarios (owner_id, reasoning_report_row_id);
