import { NextResponse } from "next/server";
import {
  deletePrivateJournalEntry,
  listPrivateJournalEntries,
  savePrivateJournalEntry,
  updatePrivateJournalEntry,
} from "@/lib/trading-brain/private-repository";
import type { Json } from "@/lib/supabase/database.types";

const MAX_BODY_BYTES = 32 * 1024;
const INSTRUMENT_PATTERN = /^[A-Z0-9._-]{2,20}$/;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
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

    return NextResponse.json({ entries: result.data ?? [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("The private journal is not configured or is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);

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

    return NextResponse.json({ entry: result.data }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("The private journal is not configured or is temporarily unavailable.", 503);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024) return jsonError("Delete request is too large.", 413);

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 1024) {
      return jsonError("Delete request is too large.", 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError("Send a valid JSON delete request.", 400);
  }

  if (!isRecord(body) || typeof body.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
    return jsonError("Provide a valid journal entry ID.", 400);
  }

  try {
    const result = await deletePrivateJournalEntry(body.id);
    if (result.error) {
      const status = result.error.message === "Authentication required" ? 401 : 503;
      return jsonError(
        status === 401 ? "Sign in to delete a private journal entry." : "The journal entry could not be deleted.",
        status,
      );
    }
    if (!result.data) return jsonError("Journal entry not found.", 404);
    return NextResponse.json({ deleted: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("The private journal is not configured or is temporarily unavailable.", 503);
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Cross-origin request rejected.", 403);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return jsonError("Journal entry is too large.", 413);

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return jsonError("Journal entry is too large.", 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return jsonError("Send a valid JSON journal update.", 400);
  }

  if (!isRecord(body) ||
      typeof body.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
    return jsonError("Provide a valid journal entry ID.", 400);
  }

  const instrument = body.instrument;
  const timeframe = body.timeframe;
  const occurredAt = body.occurredAt;
  const payload = body.payload;

  if (typeof instrument !== "string" || !INSTRUMENT_PATTERN.test(instrument)) {
    return jsonError("Provide a valid instrument symbol.", 400);
  }
  if (timeframe !== undefined && timeframe !== null &&
      (typeof timeframe !== "string" || timeframe.length > 12)) {
    return jsonError("Timeframe must be 12 characters or fewer.", 400);
  }
  if (typeof occurredAt !== "string" || !Number.isFinite(Date.parse(occurredAt))) {
    return jsonError("Provide a valid occurrence timestamp.", 400);
  }
  if (!isRecord(payload) || !isJsonValue(payload) ||
      Buffer.byteLength(JSON.stringify(payload), "utf8") > 24 * 1024) {
    return jsonError("Journal payload must be a JSON object no larger than 24 KB.", 400);
  }

  try {
    const result = await updatePrivateJournalEntry(body.id, {
      instrument,
      timeframe: typeof timeframe === "string" ? timeframe : null,
      entryType: "trade",
      occurredAt: new Date(occurredAt).toISOString(),
      payload: payload as Json,
    });

    if (result.error) {
      const status = result.error.message === "Authentication required" ? 401 : 503;
      return jsonError(
        status === 401 ? "Sign in to update a private journal entry." : "The journal entry could not be updated.",
        status,
      );
    }
    if (!result.data) return jsonError("Journal entry not found.", 404);
    return NextResponse.json({ entry: result.data }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("The private journal is not configured or is temporarily unavailable.", 503);
  }
}
