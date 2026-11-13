import { createHash } from "node:crypto";

export interface ExistingMT5BatchIdentity {
  collector_credential_id: string | null;
  terminal_instance_id: string;
  payload_hash: string;
}

export type MT5ReplayDecision = "ACK_DUPLICATE" | "CONFLICT";

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}

/** Stable serialization makes retries hash identically regardless of JSON key order. */
export function stableMT5Json(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Collector credentials are high-entropy bearer tokens; only their SHA-256 digest is stored. */
export function hashMT5CollectorToken(token: string): string | null {
  if (token.length < 32 || token.length > 256 || token.trim() !== token) return null;
  return sha256Hex(token);
}

export function hashMT5BatchPayload(value: unknown): string {
  return sha256Hex(stableMT5Json(value));
}

export function isWithinMT5ClockSkew(
  timestamp: string,
  maxSkewSeconds = 300,
  nowMs = Date.now(),
): boolean {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) &&
    Number.isFinite(maxSkewSeconds) &&
    maxSkewSeconds >= 0 &&
    Math.abs(nowMs - parsed) <= maxSkewSeconds * 1000;
}

export function decideMT5Replay(
  existing: ExistingMT5BatchIdentity,
  credentialId: string,
  terminalInstanceId: string,
  payloadHash: string,
): MT5ReplayDecision {
  return existing.collector_credential_id === credentialId &&
    existing.terminal_instance_id === terminalInstanceId &&
    existing.payload_hash === payloadHash
    ? "ACK_DUPLICATE"
    : "CONFLICT";
}
