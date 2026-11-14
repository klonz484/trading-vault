import "server-only";

import { randomUUID } from "node:crypto";
import type { Json } from "../supabase/database.types";
import { createUserScopedSupabase } from "../supabase/user";

const CHART_BUCKET = "trader-charts";
const MAX_CHART_BYTES = 15 * 1024 * 1024;
const ALLOWED_CHART_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface SaveJournalEntryInput {
  instrument: string;
  timeframe?: string | null;
  entryType?: string;
  occurredAt?: string;
  payload: Json;
}

export interface SaveEvidenceBundleInput {
  bundleId: string;
  bundleVersion: string;
  workflow: "current_market" | "upcoming_session";
  instrument: string;
  payload: Json;
}

export interface SaveReasoningReportInput {
  reportId: string;
  reportVersion: string;
  evidenceBundleRowId?: string | null;
  workflow: "current_market" | "upcoming_session";
  instrument: string;
  evaluatedAt: string;
  payload: Json;
}

export interface SavePrivateExperimentInput {
  experimentId: string;
  version: string;
  payload: Json;
}

export interface SaveScenarioInput {
  scenarioId: string;
  scenarioVersion: string;
  workflow: "current_market" | "upcoming_session";
  instrument: string;
  timeframe: string;
  state: "candidate" | "waiting_for_trigger";
  evidenceBundleRowId?: string | null;
  reasoningReportRowId?: string | null;
  expiresAt?: string | null;
  payload: Json;
}

/**
 * All persistence in this module uses the caller's verified Supabase session.
 * owner_id is always derived from verified JWT claims, never from input.
 * RLS remains the final tenant-isolation boundary.
 */
export async function listPrivateJournalEntries(limit = 50) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_journal_entries")
    .select("*")
    .eq("owner_id", context.userId)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 100));
}

export async function savePrivateJournalEntry(input: SaveJournalEntryInput) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_journal_entries")
    .insert({
      owner_id: context.userId,
      instrument: input.instrument,
      timeframe: input.timeframe ?? null,
      entry_type: input.entryType ?? "note",
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      payload: input.payload,
    })
    .select("*")
    .single();
}

export async function savePrivateEvidenceBundle(input: SaveEvidenceBundleInput) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_evidence_bundles")
    .insert({
      bundle_id: input.bundleId,
      bundle_version: input.bundleVersion,
      workflow: input.workflow,
      instrument: input.instrument,
      payload: input.payload,
      owner_id: context.userId,
    })
    .select("*")
    .single();
}

export async function savePrivateReasoningReport(input: SaveReasoningReportInput) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_reasoning_reports")
    .insert({
      report_id: input.reportId,
      report_version: input.reportVersion,
      evidence_bundle_row_id: input.evidenceBundleRowId ?? null,
      workflow: input.workflow,
      instrument: input.instrument,
      evaluated_at: input.evaluatedAt,
      payload: input.payload,
      owner_id: context.userId,
    })
    .select("*")
    .single();
}

export async function savePrivateScenario(input: SaveScenarioInput) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_scenarios")
    .insert({
      scenario_id: input.scenarioId,
      scenario_version: input.scenarioVersion,
      workflow: input.workflow,
      instrument: input.instrument,
      timeframe: input.timeframe,
      state: input.state,
      evidence_bundle_row_id: input.evidenceBundleRowId ?? null,
      reasoning_report_row_id: input.reasoningReportRowId ?? null,
      expires_at: input.expiresAt ?? null,
      payload: input.payload,
      owner_id: context.userId,
    })
    .select("*")
    .single();
}

export async function savePrivateExperiment(input: SavePrivateExperimentInput) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_experiments")
    .insert({
      owner_id: context.userId,
      experiment_id: input.experimentId,
      version: input.version,
      state: "proposed",
      requires_owner_approval_for_release: true,
      payload: input.payload,
    })
    .select("*")
    .single();
}

export async function listPrivateExperiments(limit = 50) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_experiments")
    .select("*")
    .eq("owner_id", context.userId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 100));
}

export async function listPrivateScenarios(limit = 50) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_scenarios")
    .select("*")
    .eq("owner_id", context.userId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 100));
}

/**
 * Uploads a private chart image to a path scoped to the verified user ID.
 * The bucket is private and its Storage policies independently enforce the path.
 */
export async function uploadPrivateChartImage(file: File) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  if (!ALLOWED_CHART_TYPES.has(file.type)) {
    return { data: null, error: new Error("Unsupported chart image type") };
  }
  if (file.size <= 0 || file.size > MAX_CHART_BYTES) {
    return { data: null, error: new Error("Chart image must be between 1 byte and 15 MB") };
  }

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const date = new Date();
  const path = [
    context.userId,
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    `${randomUUID()}.${extension}`,
  ].join("/");

  const { data, error } = await context.supabase.storage
    .from(CHART_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  return { data, error };
}

export async function createPrivateChartSignedUrl(path: string, expiresInSeconds = 300) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  if (!path.startsWith(`${context.userId}/`) || path.includes("..")) {
    return { data: null, error: new Error("Chart image does not belong to the authenticated user") };
  }

  return context.supabase.storage
    .from(CHART_BUCKET)
    .createSignedUrl(path, Math.min(Math.max(Math.trunc(expiresInSeconds), 30), 900));
}

export async function deletePrivateJournalEntry(entryId: string) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_journal_entries")
    .delete()
    .eq("id", entryId)
    .eq("owner_id", context.userId)
    .select("id")
    .maybeSingle();
}

export async function updatePrivateJournalEntry(
  entryId: string,
  input: SaveJournalEntryInput,
) {
  const context = await createUserScopedSupabase();
  if (!context) return { data: null, error: new Error("Authentication required") };

  return context.supabase
    .from("trader_journal_entries")
    .update({
      instrument: input.instrument,
      timeframe: input.timeframe ?? null,
      entry_type: input.entryType ?? "trade",
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      payload: input.payload,
    })
    .eq("id", entryId)
    .eq("owner_id", context.userId)
    .select("*")
    .maybeSingle();
}
