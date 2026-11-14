import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createUserScopedSupabase } from "@/lib/supabase/user";

type Tables = Database["public"]["Tables"];
type JournalInsert = Omit<Tables["trader_journal_entries"]["Insert"], "owner_id">;
type EvidenceBundleInsert = Omit<Tables["trader_evidence_bundles"]["Insert"], "owner_id">;
type ReasoningReportInsert = Omit<Tables["trader_reasoning_reports"]["Insert"], "owner_id">;
type ScenarioInsert = Omit<Tables["trader_scenarios"]["Insert"], "owner_id">;
type ExperimentInsert = Omit<Tables["trader_experiments"]["Insert"], "owner_id">;
type ProfileUpsert = Omit<Tables["trader_profiles"]["Insert"], "user_id">;

async function requireUserScope() {
  const scope = await createUserScopedSupabase();
  if (!scope) throw new Error("Authentication is required to access private Trader data.");
  return scope;
}

export async function listTraderJournalEntries(limit = 50) {
  const { supabase } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_journal_entries")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));

  if (error) throw new Error(`Could not load private journal entries: ${error.message}`);
  return data;
}

export async function createTraderJournalEntry(input: JournalInsert) {
  const { supabase, userId } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_journal_entries")
    .insert({ ...input, owner_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save private journal entry: ${error.message}`);
  return data;
}

export async function saveTraderEvidenceBundle(input: EvidenceBundleInsert) {
  const { supabase, userId } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_evidence_bundles")
    .insert({ ...input, owner_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save private evidence bundle: ${error.message}`);
  return data;
}

export async function saveTraderReasoningReport(input: ReasoningReportInsert) {
  const { supabase, userId } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_reasoning_reports")
    .insert({ ...input, owner_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save private reasoning report: ${error.message}`);
  return data;
}

export async function saveTraderScenario(input: ScenarioInsert) {
  const { supabase, userId } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_scenarios")
    .insert({ ...input, owner_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save private scenario: ${error.message}`);
  return data;
}

export async function saveTraderExperiment(input: ExperimentInsert) {
  const { supabase, userId } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_experiments")
    .insert({ ...input, owner_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save private experiment: ${error.message}`);
  return data;
}

export async function upsertTraderProfile(input: ProfileUpsert) {
  const { supabase, userId } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_profiles")
    .upsert({ ...input, user_id: userId })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save private trader profile: ${error.message}`);
  return data;
}

export async function listTraderEvidenceBundles(limit = 50) {
  const { supabase } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_evidence_bundles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));

  if (error) throw new Error(`Could not load private evidence bundles: ${error.message}`);
  return data;
}

export async function listTraderReasoningReports(limit = 50) {
  const { supabase } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_reasoning_reports")
    .select("*")
    .order("evaluated_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));

  if (error) throw new Error(`Could not load private reasoning reports: ${error.message}`);
  return data;
}

export async function listTraderScenarios(limit = 50) {
  const { supabase } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_scenarios")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));

  if (error) throw new Error(`Could not load private scenarios: ${error.message}`);
  return data;
}

export async function listTraderExperiments(limit = 50) {
  const { supabase } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_experiments")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));

  if (error) throw new Error(`Could not load private experiments: ${error.message}`);
  return data;
}

export async function updateTraderJournalEntry(
  id: string,
  patch: Tables["trader_journal_entries"]["Update"],
) {
  const { supabase } = await requireUserScope();
  const { data, error } = await supabase
    .from("trader_journal_entries")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Could not update private journal entry: ${error.message}`);
  return data;
}

export async function deleteTraderJournalEntry(id: string) {
  const { supabase } = await requireUserScope();
  const { error } = await supabase
    .from("trader_journal_entries")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Could not delete private journal entry: ${error.message}`);
}
