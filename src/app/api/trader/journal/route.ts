import { NextResponse } from "next/server";
import {
  listPrivateJournalEntries,
  savePrivateJournalEntry,
} from "@/lib/trading-brain/private-repository";
import type { Json } from "@/lib/supabase/database.types";

const MAX_BODY_BYTES = 32 * 1024;
const INSTRUMENT_PATTERN = /^[A-Z0-9._-]{2,20}$/;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 50;

    const result = await listPrivateJournalEntries(limit);
    if (result.error) {
      const status = result.error.message === "Authentication required" ? 401 : 503;
      return jsonError(
        status === 401 ? "Sign in to access your private journal." : "The private journal is temporarily unavailable.",
        status,
      );
    }

    return NextResponse.json({ entries: result.data ?? [] });
  } catch {
    return jsonError("The private journal is not configured or is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonError("Journal entry is too large.", 413);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return jsonError("Journal entry is too large.", 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError("Send a valid JSON journal entry.", 400);
  }

  if (!isRecord(body)) return jsonError("Journal entry must be a JSON object.", 400);

  const instrument = body.instrument;
  const timeframe = body.timeframe;
  const entryType = body.entryType;
  const occurredAt = body.occurredAt;
  const payload = body.payload;

  if (typeof instrument !== "string" || !INSTRUMENT_PATTERN.test(instrument)) {
    return jsonError("Provide a valid instrument symbol.", 400);
  }
  if (timeframe !== undefined && timeframe !== null &&
      (typeof timeframe !== "string" || timeframe.length > 12)) {
    return jsonError("Timeframe must be 12 characters or fewer.", 400);
  }
  if (entryType !== undefined &&
      (typeof entryType !== "string" || entryType.length < 1 || entryType.length > 40)) {
    return jsonError("Entry type must be between 1 and 40 characters.", 400);
  }
  if (occurredAt !== undefined &&
      (typeof occurredAt !== "string" || !Number.isFinite(Date.parse(occurredAt)))) {
    return jsonError("Provide a valid occurrence timestamp.", 400);
  }
  if (!isRecord(payload) || !isJsonValue(payload) ||
      Buffer.byteLength(JSON.stringify(payload), "utf8") > 24 * 1024) {
    return jsonError("Journal payload must be a JSON object no larger than 24 KB.", 400);
  }

  try {
    const result = await savePrivateJournalEntry({
      instrument,
      timeframe: typeof timeframe === "string" ? timeframe : null,
      entryType: typeof entryType === "string" ? entryType : "note",
      occurredAt: typeof occurredAt === "string" ? new Date(occurredAt).toISOString() : undefined,
      payload: payload as Json,
    });

    if (result.error) {
      const status = result.error.message === "Authentication required" ? 401 : 503;
      return jsonError(
        status === 401 ? "Sign in to save a private journal entry." : "The journal entry could not be saved.",
        status,
      );
    }

    return NextResponse.json({ entry: result.data }, { status: 201 });
  } catch {
    return jsonError("The private journal is not configured or is temporarily unavailable.", 503);
  }
}
