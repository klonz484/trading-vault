import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { listPrivateExperiments, listPrivateJournalEntries, savePrivateExperiment } from "@/lib/trading-brain/private-repository";
import { createPrivateExperimentDraftFromTrades, type JournalFeedbackTrade } from "@/lib/trading-brain/feedback-learning";
import type { Json } from "@/lib/supabase/database.types";

const MAX_BODY_BYTES = 24 * 1024;
function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isJsonValue(value: unknown): value is Json {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
export async function GET(request: Request) {
  try {
    const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
    const result = await listPrivateExperiments(limit);
    if (result.error) {
      const status = result.error.message === "Authentication required" ? 401 : 503;
      return jsonError(status === 401 ? "Sign in to view private research drafts." : "Private research drafts are temporarily unavailable.", status);
    }
    return NextResponse.json({ experiments: result.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Private research drafts are not configured or are temporarily unavailable.", 503);
  }
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError("Research proposal is too large.", 413);
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return jsonError("Research proposal is too large.", 413);
    body = JSON.parse(raw) as unknown;
  } catch {
    return jsonError("Send a valid JSON research proposal.", 400);
  }
  if (!isRecord(body) || !isRecord(body.payload) || !isJsonValue(body.payload) ||
      Buffer.byteLength(JSON.stringify(body.payload), "utf8") > MAX_BODY_BYTES) {
    return jsonError("Provide a valid research proposal payload.", 400);
  }
  const requestedPatternKey = body.payload.sourcePatternKey;
  if (typeof requestedPatternKey !== "string" || requestedPatternKey.length > 300) {
    return jsonError("Provide a valid private learning pattern key.", 400);
  }
  try {
    const journal = await listPrivateJournalEntries(100);
    if (journal.error) {
      const status = journal.error.message === "Authentication required" ? 401 : 503;
      return jsonError(status === 401 ? "Sign in to prepare a private research proposal." : "The private journal could not be reviewed.", status);
    }
    const trades = (journal.data ?? []).flatMap((row) => {
      if (!isRecord(row.payload)) return [];
      const candidate = isRecord(row.payload.trade) ? row.payload.trade : row.payload;
      if (typeof candidate.id !== "string" || typeof candidate.date !== "string" ||
          typeof candidate.symbol !== "string" || (candidate.side !== "BUY" && candidate.side !== "SELL") ||
          !["OPEN", "WIN", "LOSS", "BREAKEVEN"].includes(String(candidate.outcome)) ||
          ![candidate.entry, candidate.stop, candidate.target, candidate.rMultiple].every((value) => typeof value === "number" && Number.isFinite(value)) ||
          typeof candidate.notes !== "string") return [];
      return [candidate as unknown as JournalFeedbackTrade];
    });
    let verifiedDraft;
    try {
      verifiedDraft = createPrivateExperimentDraftFromTrades(trades, requestedPatternKey);
    } catch (cause) {
      return jsonError(cause instanceof Error ? cause.message : "The learning pattern is not eligible for a proposal.", 400);
    }
    const existing = await listPrivateExperiments(100);
    if (existing.error) {
      const status = existing.error.message === "Authentication required" ? 401 : 503;
      return jsonError(status === 401 ? "Sign in to review private proposals." : "Private research proposals are temporarily unavailable.", status);
    }
    const duplicate = (existing.data ?? []).some((row) =>
      isRecord(row.payload) && row.payload.sourcePatternKey === requestedPatternKey,
    );
    if (duplicate) return jsonError("A private research proposal already exists for this learning pattern.", 409);
    const result = await savePrivateExperiment({ experimentId: randomUUID(), version: "1.0", payload: verifiedDraft as unknown as Json });
    if (result.error) {
      const status = result.error.message === "Authentication required" ? 401 : 503;
      return jsonError(status === 401 ? "Sign in to save a private research proposal." : "The private research proposal could not be saved.", status);
    }
    return NextResponse.json({ experiment: result.data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("Private research proposals are not configured or are temporarily unavailable.", 503);
  }
}
