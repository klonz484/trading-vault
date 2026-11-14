import { NextResponse } from "next/server";
import {
  createTraderChartReadUrl,
  createTraderChartUploadTarget,
  deleteTraderChart,
} from "@/lib/trading-brain/chart-storage";

const MAX_REQUEST_BYTES = 15 * 1024 * 1024;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validPath(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(value);
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("Cross-origin request rejected.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Send valid JSON chart metadata.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return errorResponse("Chart metadata must be an object.", 400);
  }

  const input = body as Record<string, unknown>;
  if (typeof input.contentType !== "string" ||
      typeof input.sizeBytes !== "number" ||
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 || input.sizeBytes > MAX_REQUEST_BYTES) {
    return errorResponse("Provide a valid chart image type and size up to 15 MiB.", 400);
  }

  try {
    const target = await createTraderChartUploadTarget({
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    return NextResponse.json(target, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chart upload is unavailable.";
    const status = message.includes("Authentication is required") ? 401 :
      message.includes("accepted") || message.includes("15 MiB") ? 400 : 503;
    return errorResponse(message, status);
  }
}

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path");
  if (!validPath(path)) return errorResponse("Provide a valid private chart path.", 400);

  try {
    const signedUrl = await createTraderChartReadUrl(path);
    return NextResponse.json({ signedUrl }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chart is unavailable.";
    const status = message.includes("Authentication is required") ? 401 :
      message.includes("does not belong") || message.includes("invalid") ? 403 : 503;
    return errorResponse(message, status);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return errorResponse("Cross-origin request rejected.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Send valid JSON chart metadata.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body) ||
      !validPath((body as Record<string, unknown>).path)) {
    return errorResponse("Provide a valid private chart path.", 400);
  }

  try {
    await deleteTraderChart((body as { path: string }).path);
    return NextResponse.json({ deleted: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chart deletion is unavailable.";
    const status = message.includes("Authentication is required") ? 401 :
      message.includes("does not belong") || message.includes("invalid") ? 403 : 503;
    return errorResponse(message, status);
  }
}
