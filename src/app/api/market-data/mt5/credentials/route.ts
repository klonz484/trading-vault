import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const maxDuration = 20;

type BrokerId = "RCG_MARKETS" | "VAULT_MARKETS";

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireOwner() {
  const session = await createServerClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { user: null, failure: reply({ error: "Sign in is required." }, 401) };
  const ownerId = process.env.TRADING_VAULT_OWNER_USER_ID;
  if (!ownerId) return { user: null, failure: reply({ error: "Owner access is not configured." }, 503) };
  if (user.id !== ownerId) return { user: null, failure: reply({ error: "Owner access is required." }, 403) };
  return { user, failure: null };
}

/**
 * Owner-only lifecycle management for scoped, revocable MT5 collector tokens.
 * The raw token is returned only at creation and is never persisted.
 * This route does not connect a terminal or activate market-data collection.
 */
export async function POST(request: Request) {
  const owner = await requireOwner();
  if (owner.failure || !owner.user) return owner.failure;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "A valid JSON request is required." }, 400);
  }
  if (!isRecord(body)) return reply({ error: "A JSON object is required." }, 400);

  const brokerId = body.brokerId;
  const terminalInstanceId = body.terminalInstanceId;
  const expiresInDays = body.expiresInDays === undefined ? 90 : body.expiresInDays;
  if (brokerId !== "RCG_MARKETS" && brokerId !== "VAULT_MARKETS") {
    return reply({ error: "brokerId must be RCG_MARKETS or VAULT_MARKETS." }, 400);
  }
  if (typeof terminalInstanceId !== "string" ||
      terminalInstanceId.trim().length < 1 || terminalInstanceId.trim().length > 128) {
    return reply({ error: "terminalInstanceId must contain 1–128 characters." }, 400);
  }
  if (!Number.isInteger(expiresInDays) || (expiresInDays as number) < 1 || (expiresInDays as number) > 365) {
    return reply({ error: "expiresInDays must be an integer from 1 to 365." }, 400);
  }

  const supabase = serviceClient();
  if (!supabase) return reply({ error: "The private connector service is not configured." }, 503);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + (expiresInDays as number) * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("mt5_connector_credentials")
    .insert({
      user_id: owner.user.id,
      broker_id: brokerId,
      terminal_instance_id: terminalInstanceId.trim(),
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id, broker_id, terminal_instance_id, created_at, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "An active credential already exists for this broker terminal. Revoke it before issuing a replacement." }, 409);
    }
    console.error("MT5 connector credential creation failed:", error.message);
    return reply({ error: "The connector credential could not be created. Confirm the staged migration is applied." }, 503);
  }

  return reply({
    credential: data,
    token,
    warning: "Copy this token now. It is shown only once. Never use your MT5 account password as a connector token.",
    collectionEnabled: false,
  }, 201);
}

export async function PATCH(request: Request) {
  const owner = await requireOwner();
  if (owner.failure || !owner.user) return owner.failure;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "A valid JSON request is required." }, 400);
  }
  if (!isRecord(body) || typeof body.credentialId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.credentialId)) {
    return reply({ error: "A valid credentialId UUID is required." }, 400);
  }

  const supabase = serviceClient();
  if (!supabase) return reply({ error: "The private connector service is not configured." }, 503);

  const { data, error } = await supabase
    .from("mt5_connector_credentials")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", body.credentialId)
    .eq("user_id", owner.user.id)
    .is("revoked_at", null)
    .select("id, broker_id, terminal_instance_id, revoked_at")
    .maybeSingle();

  if (error) {
    console.error("MT5 connector credential revocation failed:", error.message);
    return reply({ error: "The connector credential could not be revoked." }, 503);
  }
  if (!data) return reply({ error: "No active credential was found for this owner." }, 404);
  return reply({ credential: data, revoked: true }, 200);
}
