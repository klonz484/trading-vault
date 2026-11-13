import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  validateMT5IngestBatch,
  type MT5IngestBatch,
} from "@/lib/market-data/mt5-ingest";
import {
  decideMT5Replay,
  hashMT5BatchPayload,
  hashMT5CollectorToken,
  isWithinMT5ClockSkew,
} from "@/lib/market-data/mt5-ingest-server";

export const maxDuration = 20;

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_REQUESTS = 30;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return jsonError("Content-Type must be application/json.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (declaredLength > MAX_BODY_BYTES) return jsonError("The MT5 batch exceeds the 4 MB request limit.", 413);

  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{32,256})$/.exec(authorization);
  if (!match) return jsonError("A valid collector bearer credential is required.", 401);

  const tokenHash = hashMT5CollectorToken(match[1]);
  if (!tokenHash) return jsonError("A valid collector bearer credential is required.", 401);

  const supabase = getServerSupabase();
  if (!supabase) return jsonError("MT5 ingestion is not configured on this server.", 503);

  const { data: credential, error: credentialError } = await supabase
    .from("mt5_connector_credentials")
    .select("id, user_id, broker_id, terminal_instance_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (credentialError) {
    console.error("MT5 collector authentication lookup failed:", credentialError.message);
    return jsonError("MT5 ingestion authentication is temporarily unavailable.", 503);
  }

  if (
    !credential ||
    credential.revoked_at ||
    (credential.expires_at && Date.parse(credential.expires_at) <= Date.now())
  ) {
    return jsonError("The collector credential is invalid, expired or revoked.", 401);
  }

  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc(
    "consume_mt5_ingest_rate_limit",
    {
      p_credential_id: credential.id,
      p_window_seconds: RATE_WINDOW_SECONDS,
      p_max_requests: RATE_MAX_REQUESTS,
    },
  );
  if (rateLimitError) {
    console.error("MT5 ingestion rate-limit check failed:", rateLimitError.message);
    return jsonError("MT5 ingestion is temporarily unavailable because its request limit could not be checked.", 503);
  }
  if (withinRateLimit !== true) return jsonError("The collector request limit has been reached. Retry later.", 429);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("The MT5 request body could not be read.", 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return jsonError("The MT5 batch exceeds the 4 MB request limit.", 413);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonError("The MT5 request body must contain valid JSON.", 400);
  }

  const validation = validateMT5IngestBatch(parsed);
  if (validation.status !== "ACCEPTABLE") {
    return NextResponse.json(
      { error: "The MT5 batch failed validation.", validation },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  const batch = parsed as MT5IngestBatch;
  if (
    batch.brokerId !== credential.broker_id ||
    batch.terminalInstanceId !== credential.terminal_instance_id
  ) {
    return jsonError("The batch broker or terminal identity does not match this collector credential.", 403);
  }
  if (!isWithinMT5ClockSkew(batch.sentAt, MAX_CLOCK_SKEW_SECONDS)) {
    return jsonError("The batch timestamp is outside the permitted five-minute clock-skew window.", 422);
  }

  const nowMs = Date.now();
  const futureLimitMs = nowMs + MAX_CLOCK_SKEW_SECONDS * 1000;
  const hasFutureCandle = batch.candles.some((candle) => Date.parse(candle.sourceTime) > futureLimitMs);
  const hasFutureTick = batch.ticks.some((tick) => tick.sourceTimeMs > futureLimitMs);
  if (hasFutureCandle || hasFutureTick) {
    return jsonError("The batch contains an observation timestamp more than five minutes in the future.", 422);
  }

  const payloadHash = hashMT5BatchPayload(batch);
  const { data: existing, error: existingError } = await supabase
    .from("mt5_ingest_batches")
    .select("collector_credential_id, terminal_instance_id, payload_hash, received_at")
    .eq("collector_credential_id", credential.id)
    .eq("batch_id", batch.batchId)
    .maybeSingle();

  if (existingError) {
    console.error("MT5 batch replay lookup failed:", existingError.message);
    return jsonError("MT5 ingestion storage is temporarily unavailable.", 503);
  }

  if (existing) {
    const decision = decideMT5Replay(
      existing,
      credential.id,
      batch.terminalInstanceId,
      payloadHash,
    );
    if (decision === "ACK_DUPLICATE") {
      return NextResponse.json({
        acknowledged: true,
        duplicate: true,
        durable: true,
        batchId: batch.batchId,
        receivedAt: existing.received_at,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return jsonError("This batch ID was already used with different content or collector identity.", 409);
  }

  const { data: stored, error: insertError } = await supabase
    .from("mt5_ingest_batches")
    .insert({
      collector_credential_id: credential.id,
      broker_id: batch.brokerId,
      batch_id: batch.batchId,
      terminal_instance_id: batch.terminalInstanceId,
      payload_hash: payloadHash,
      sent_at: batch.sentAt,
      candle_count: batch.candles.length,
      tick_count: batch.ticks.length,
      candles: batch.candles,
      ticks: batch.ticks,
    })
    .select("id, received_at")
    .single();

  if (insertError) {
    // A concurrent retry may have won the unique-key race. Acknowledge only
    // when the committed row proves it is the exact same collector + payload.
    if (insertError.code === "23505") {
      const { data: raced, error: raceLookupError } = await supabase
        .from("mt5_ingest_batches")
        .select("collector_credential_id, terminal_instance_id, payload_hash, received_at")
        .eq("collector_credential_id", credential.id)
        .eq("batch_id", batch.batchId)
        .maybeSingle();

      if (!raceLookupError && raced && decideMT5Replay(
        raced, credential.id, batch.terminalInstanceId, payloadHash,
      ) === "ACK_DUPLICATE") {
        return NextResponse.json({
          acknowledged: true,
          duplicate: true,
          durable: true,
          batchId: batch.batchId,
          receivedAt: raced.received_at,
        }, { status: 200, headers: { "Cache-Control": "no-store" } });
      }
      return jsonError("This batch ID conflicts with an existing ingestion record.", 409);
    }
    console.error("MT5 batch durable insert failed:", insertError.message);
    return jsonError("MT5 batch storage failed. Keep the local queue file and retry later.", 503);
  }

  // This metadata update is best-effort and is not part of the durable-ack gate.
  const { error: usageUpdateError } = await supabase
    .from("mt5_connector_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credential.id);
  if (usageUpdateError) console.error("MT5 credential last-used update failed:", usageUpdateError.message);

  // Acknowledge only after Supabase confirms the batch insert has committed.
  return NextResponse.json({
    acknowledged: true,
    duplicate: false,
    durable: true,
    batchId: batch.batchId,
    receivedAt: stored.received_at,
    storedCandleCount: batch.candles.length,
    storedTickCount: batch.ticks.length,
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
