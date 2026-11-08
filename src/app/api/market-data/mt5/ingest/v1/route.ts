import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { validateMT5IngestBatch, type MT5IngestBatch } from "@/lib/market-data/mt5-ingest";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
 * Requires the staged migration and a server-only Supabase service-role key.
 * Credentials are hashed at rest; broker identity and terminal identity are
 * bound to the credential. No broker trading operations are exposed.
 */
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token.length < 32 || token.length > 256) {
    return response({ error: "A valid connector credential is required." }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return response({ error: "The ingest batch exceeds the 5 MB limit." }, 413);
  }

  const readResult = await readBodyLimited(request);
  if (readResult.tooLarge) {
    return response({ error: "The ingest batch exceeds the 5 MB limit." }, 413);
  }
  if (readResult.body === null) {
    return response({ error: "The ingest request body could not be read as valid UTF-8." }, 400);
  }
  const rawBody = readResult.body;

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response({ error: "The ingest body must contain valid JSON." }, 400);
  }

  const validation = validateMT5IngestBatch(payload);
  if (validation.status !== "ACCEPTABLE") {
    return response({ error: "The MT5 batch failed validation.", validation }, 400);
  }
  const batch = payload as MT5IngestBatch;
  // The request timestamp is checked independently from batch.sentAt so an
  // offline collector can safely replay an older durable local-queue batch.
  const requestTimestamp = request.headers.get("x-tv-request-timestamp") ?? "";
  const requestTimestampMs = Date.parse(requestTimestamp);
  if (!requestTimestamp || !Number.isFinite(requestTimestampMs) ||
      Math.abs(Date.now() - requestTimestampMs) > MAX_CLOCK_SKEW_MS) {
    return response({ error: "A valid request timestamp within five minutes is required." }, 400);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return response({ error: "The private MT5 ingestion service is not configured." }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const tokenHash = sha256(token);
  const { data: credential, error: credentialError } = await supabase
    .from("mt5_connector_credentials")
    .select("id, broker_id, terminal_instance_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (credentialError) {
    console.error("MT5 credential lookup failed:", credentialError.message);
    return response({ error: "Connector authentication is temporarily unavailable." }, 503);
  }
  if (!credential || credential.broker_id !== batch.brokerId ||
      credential.terminal_instance_id !== batch.terminalInstanceId ||
      (credential.expires_at && Date.parse(credential.expires_at) <= Date.now())) {
    return response({ error: "The connector credential is invalid, expired or not authorized for this terminal." }, 401);
  }

  const payloadHash = sha256(rawBody);
  const { data: inserted, error: insertError } = await supabase
    .from("mt5_ingest_batches")
    .insert({
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
    const { data: existing, error: duplicateError } = await supabase
      .from("mt5_ingest_batches")
      .select("id, received_at, payload_hash")
      .eq("broker_id", batch.brokerId)
      .eq("batch_id", batch.batchId)
      .maybeSingle();
    if (duplicateError) {
      console.error("MT5 duplicate batch lookup failed:", duplicateError.message);
      return response({ error: "The batch acknowledgement could not be verified." }, 503);
    }
    if (!existing || existing.payload_hash !== payloadHash) {
      return response({ error: "The batch identifier was already used with different content." }, 409);
    }
    return response({
      accepted: true,
      duplicate: true,
      batchId: batch.batchId,
      durableBatchId: existing.id,
      receivedAt: existing.received_at,
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
    // The batch is already durable. Do not turn a successful durable write into
    // a retry-inducing failure; report the accepted batch and log the telemetry issue.
    console.error("MT5 credential last-used update failed:", updateError.message);
  }

  return response({
    accepted: true,
    duplicate: false,
    batchId: batch.batchId,
    durableBatchId: inserted.id,
    receivedAt: inserted.received_at,
    acceptedCandleCount: batch.candles.length,
    acceptedTickCount: batch.ticks.length,
  }, 201);
}
