import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { validateMT5IngestBatch, type MT5IngestBatch } from "@/lib/market-data/mt5-ingest";
import {
  decideMT5Replay,
  hashMT5BatchPayload,
  hashMT5CollectorToken,
  isWithinMT5ClockSkew,
} from "@/lib/market-data/mt5-ingest-server";

export const maxDuration = 20;

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_REQUESTS = 30;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
  });
}

function serverClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secretKey) return null;
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function readBodyLimited(request: Request): Promise<{ body: string | null; tooLarge: boolean }> {
  if (!request.body) return { body: null, tooLarge: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { body: null, tooLarge: true };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(bytes), tooLarge: false };
  } catch {
    return { body: null, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Private, credential-scoped MT5 ingestion endpoint.
 * Requires the staged migration and a server-only Supabase secret key.
 * Collector credentials are hashed at rest and bound to one broker terminal.
 * Delayed queue batches are allowed; the request timestamp prevents stale
 * HTTP request replay without rejecting valid offline-queue history.
 */
export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return response({ error: "Content-Type must be application/json." }, 415);
  }

  const authorization = request.headers.get("authorization") ?? "";
  const tokenMatch = /^Bearer ([A-Za-z0-9._~-]{32,256})$/.exec(authorization);
  const tokenHash = tokenMatch ? hashMT5CollectorToken(tokenMatch[1]) : null;
  if (!tokenHash) return response({ error: "A valid connector credential is required." }, 401);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return response({ error: "The ingest batch exceeds the 5 MB limit." }, 413);
  }

  const readResult = await readBodyLimited(request);
  if (readResult.tooLarge) return response({ error: "The ingest batch exceeds the 5 MB limit." }, 413);
  if (readResult.body === null) {
    return response({ error: "The ingest request body could not be read as valid UTF-8." }, 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(readResult.body);
  } catch {
    return response({ error: "The ingest body must contain valid JSON." }, 400);
  }

  const validation = validateMT5IngestBatch(payload);
  if (validation.status !== "ACCEPTABLE") {
    return response({ error: "The MT5 batch failed validation.", validation }, 422);
  }
  const batch = payload as MT5IngestBatch;

  // This is the time of this HTTPS attempt, not the batch's original capture
  // time. Offline queue retries therefore remain possible.
  const requestTimestamp = request.headers.get("x-tv-request-timestamp") ?? "";
  if (!isWithinMT5ClockSkew(requestTimestamp, MAX_CLOCK_SKEW_SECONDS)) {
    return response({ error: "A valid request timestamp within five minutes is required." }, 400);
  }

  const supabase = serverClient();
  if (!supabase) return response({ error: "The private MT5 ingestion service is not configured." }, 503);

  const { data: credential, error: credentialError } = await supabase
    .from("mt5_connector_credentials")
    .select("id, user_id, broker_id, terminal_instance_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (credentialError) {
    console.error("MT5 credential lookup failed:", credentialError.message);
    return response({ error: "Connector authentication is temporarily unavailable." }, 503);
  }
  if (
    !credential ||
    credential.broker_id !== batch.brokerId ||
    credential.terminal_instance_id !== batch.terminalInstanceId ||
    (credential.expires_at && Date.parse(credential.expires_at) <= Date.now())
  ) {
    return response({ error: "The connector credential is invalid, expired or not authorized for this terminal." }, 401);
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
    return response({ error: "MT5 ingestion is temporarily unavailable because its request limit could not be checked." }, 503);
  }
  if (withinRateLimit !== true) {
    return response({ error: "The collector request limit has been reached. Retry later." }, 429);
  }

  const futureLimitMs = Date.now() + MAX_CLOCK_SKEW_SECONDS * 1000;
  if (Date.parse(batch.sentAt) > futureLimitMs) {
    return response({ error: "The batch sentAt timestamp is more than five minutes in the future." }, 422);
  }
  const hasFutureCandle = batch.candles.some((candle) => Date.parse(candle.sourceTime) > futureLimitMs);
  const hasFutureTick = batch.ticks.some((tick) => tick.sourceTimeMs > futureLimitMs);
  if (hasFutureCandle || hasFutureTick) {
    return response({ error: "The batch contains an observation timestamp more than five minutes in the future." }, 422);
  }

  const payloadHash = hashMT5BatchPayload(batch);
  const { data: existing, error: existingError } = await supabase
    .from("mt5_ingest_batches")
    .select("collector_credential_id, terminal_instance_id, payload_hash, received_at")
    .eq("collector_credential_id", credential.id)
    .eq("batch_id", batch.batchId)
    .maybeSingle();

  if (existingError) {
    console.error("MT5 duplicate batch lookup failed:", existingError.message);
    return response({ error: "The batch acknowledgement could not be verified." }, 503);
  }
  if (existing) {
    if (decideMT5Replay(existing, credential.id, batch.terminalInstanceId, payloadHash) !== "ACK_DUPLICATE") {
      return response({ error: "The batch identifier was already used with different content or collector identity." }, 409);
    }
    return response({
      accepted: true,
      acknowledged: true,
      durable: true,
      duplicate: true,
      batchId: batch.batchId,
      receivedAt: existing.received_at,
      acceptedCandleCount: batch.candles.length,
      acceptedTickCount: batch.ticks.length,
    }, 200);
  }

  const { data: inserted, error: insertError } = await supabase
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

  if (insertError?.code === "23505") {
    // A concurrent retry may have won the unique-key race. Verify the exact
    // collector and canonical payload before acknowledging that retry.
    const { data: raced, error: raceLookupError } = await supabase
      .from("mt5_ingest_batches")
      .select("collector_credential_id, terminal_instance_id, payload_hash, received_at")
      .eq("collector_credential_id", credential.id)
      .eq("batch_id", batch.batchId)
      .maybeSingle();

    if (raceLookupError) {
      console.error("MT5 concurrent retry lookup failed:", raceLookupError.message);
      return response({ error: "The batch acknowledgement could not be verified." }, 503);
    }
    if (!raced || decideMT5Replay(raced, credential.id, batch.terminalInstanceId, payloadHash) !== "ACK_DUPLICATE") {
      return response({ error: "The batch identifier conflicts with an existing ingestion record." }, 409);
    }
    return response({
      accepted: true,
      acknowledged: true,
      durable: true,
      duplicate: true,
      batchId: batch.batchId,
      receivedAt: raced.received_at,
      acceptedCandleCount: batch.candles.length,
      acceptedTickCount: batch.ticks.length,
    }, 200);
  }

  if (insertError || !inserted) {
    console.error("MT5 batch persistence failed:", insertError?.message ?? "No insert acknowledgement returned.");
    return response({ error: "The MT5 batch was not durably accepted; retain it locally and retry." }, 503);
  }

  const { error: updateError } = await supabase
    .from("mt5_connector_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credential.id);
  if (updateError) {
    // The batch is already durable; this telemetry update must not cause a retry.
    console.error("MT5 credential last-used update failed:", updateError.message);
  }

  // This is the only first-delivery acknowledgement, after durable insertion.
  return response({
    accepted: true,
    acknowledged: true,
    durable: true,
    duplicate: false,
    batchId: batch.batchId,
    durableBatchId: inserted.id,
    receivedAt: inserted.received_at,
    acceptedCandleCount: batch.candles.length,
    acceptedTickCount: batch.ticks.length,
  }, 201);
}
