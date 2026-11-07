import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateChartObservation, type ChartObservation, type FieldObservation } from "@/lib/scanner/contracts";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_TIMEFRAMES = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1", "Not sure"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanText(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function observation<T>(value: T | null, confidence: number, source: FieldObservation<T>["source"]): FieldObservation<T> {
  const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0;
  return { value, confidence: safeConfidence, source: value === null ? "unavailable" : source, status: value === null ? "unavailable" : safeConfidence >= 0.8 ? "observed" : "uncertain" };
}
function hasValidImageSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
function parseField(value: unknown): { value: string | number | null; confidence: number } {
  if (!isRecord(value)) return { value: null, confidence: 0 };
  const raw = value.value;
  const parsed = typeof raw === "string" ? cleanText(raw, 100) || null : numberOrNull(raw);
  const confidence = typeof value.confidence === "number" ? value.confidence : 0;
  return { value: parsed, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0 };
}
function parseVisibleList(value: unknown): Array<{ label: string; price: number | null; confidence: number }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = cleanText(item.label, 80);
    if (!label) return [];
    const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence) ? Math.max(0, Math.min(1, item.confidence)) : 0;
    return [{ label, price: numberOrNull(item.price), confidence }];
  });
}
function parseObservation(raw: unknown, meta: { scanId: string; receivedAtUtc: string; sha256: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; byteLength: number; storagePath: string; symbol: string; timeframe: string; notes: string }): ChartObservation | null {
  if (!isRecord(raw)) return null;
  const stringField = (key: string) => {
    const parsed = parseField(raw[key]);
    return observation(typeof parsed.value === "string" ? parsed.value : null, parsed.confidence, "screenshot_ocr");
  };
  const numberField = (key: string) => {
    const parsed = parseField(raw[key]);
    return observation(numberOrNull(parsed.value), parsed.confidence, "screenshot_ocr");
  };
  const screen = stringField("screenType") as FieldObservation<ChartObservation["screenType"]["value"]>;
  const timestamps = isRecord(raw.timestamps) ? raw.timestamps : {};
  const timestampField = (key: string) => {
    const parsed = parseField(timestamps[key]);
    return observation(typeof parsed.value === "string" ? parsed.value : null, parsed.confidence, "screenshot_ocr");
  };
  const quality = isRecord(raw.quality) ? raw.quality : {};
  const warnings = Array.isArray(quality.warnings) ? quality.warnings.filter((v): v is string => typeof v === "string").slice(0, 12).map(v => v.slice(0, 240)) : [];
  const marketLocation = isRecord(raw.marketLocation) ? raw.marketLocation : {};
  const description = parseField(marketLocation.description);
  const features = Array.isArray(marketLocation.visibleFeatures) ? marketLocation.visibleFeatures.filter((v): v is string => typeof v === "string").slice(0, 12).map(v => v.slice(0, 160)) : [];
  const instrument = stringField("instrument");
  const timeframe = stringField("timeframe");
  const bid = numberField("bid");
  const ask = numberField("ask");
  const spread = numberField("spread");
  const marketStatusRaw = stringField("marketStatus");
  const marketStatus: FieldObservation<"OPEN" | "CLOSED"> = observation(
    marketStatusRaw.value === "OPEN" || marketStatusRaw.value === "CLOSED" ? marketStatusRaw.value : null,
    marketStatusRaw.confidence,
    "screenshot_ocr"
  );
  const criticalMissing = [
    ...(instrument.status !== "observed" ? ["instrument"] : []),
    ...(timeframe.status !== "observed" ? ["timeframe"] : []),
    ...(bid.status !== "observed" ? ["bid"] : []),
    ...(ask.status !== "observed" ? ["ask"] : []),
  ];
  const packet: ChartObservation = {
    schemaVersion: "1.0.0",
    scanId: meta.scanId,
    receivedAtUtc: meta.receivedAtUtc,
    image: { sha256: meta.sha256, mimeType: meta.mimeType, byteLength: meta.byteLength, storagePath: meta.storagePath },
    screenType: observation(screen.value && ["MT5_MOBILE", "MT5_DESKTOP", "TRADINGVIEW", "QUOTES_LIST", "ORDER_TICKET", "SIGNAL_CARD", "UNKNOWN"].includes(String(screen.value)) ? screen.value : "UNKNOWN", screen.confidence, "screenshot_ocr"),
    timestamps: {
      deviceTime: timestampField("deviceTime"),
      chartOrBrokerTime: timestampField("chartOrBrokerTime"),
      lastCandleTime: timestampField("lastCandleTime"),
      receiptTimeUtc: meta.receivedAtUtc,
      timezoneOrBrokerOffset: timestampField("timezoneOrBrokerOffset"),
    },
    instrument, timeframe, bid, ask, spread, marketStatus,
    marketLocation: {
      description: observation(typeof description.value === "string" ? description.value : null, description.confidence, "chart_visual"),
      visibleLevels: parseVisibleList(marketLocation.visibleLevels),
      visibleFeatures: features,
    },
    userContext: { instrument: meta.symbol, timeframe: meta.timeframe, notes: meta.notes },
    quality: {
      rating: quality.rating === "CLEAR" || quality.rating === "PARTIAL" ? quality.rating : "POOR",
      warnings,
    },
    packetStatus: criticalMissing.length === 0 ? "COMPLETE" : "INCOMPLETE",
    missingCriticalFields: criticalMissing,
    contextOnlyNotSignal: true,
  };
  const validation = validateChartObservation(packet);
  return validation.valid ? packet : null;
}

export async function POST(request: Request) {
  const ownerUserId = process.env.TRADING_VAULT_OWNER_USER_ID;
  if (!ownerUserId) return jsonError("Owner access is not configured for this deployment.", 503);
  let supabase;
  try { supabase = await createClient(); }
  catch { return jsonError("Authentication is unavailable because Supabase is not configured.", 503); }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Please sign in before scanning a chart.", 401);
  if (user.id !== ownerUserId) return jsonError("This workspace is restricted to its owner.", 403);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return jsonError("Chart Scanner vision is not connected. Configure GROQ_API_KEY on the server.", 503);

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return jsonError("Could not read the upload. Please choose the chart image again.", 400); }

  const image = formData.get("image");
  const symbol = cleanText(formData.get("symbol"), 20).toUpperCase();
  const timeframe = cleanText(formData.get("timeframe"), 12);
  const notes = cleanText(formData.get("notes"), 1000);
  if (!(image instanceof File)) return jsonError("Please upload a chart image.", 400);
  if (!ALLOWED_TYPES.has(image.type)) return jsonError("Unsupported image type. Use PNG, JPG, or WebP.", 415);
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) return jsonError("The image must be between 1 byte and 10 MB.", 413);
  if (!/^[A-Z0-9._-]{3,20}$/.test(symbol)) return jsonError("Enter a valid instrument symbol.", 400);
  if (!ALLOWED_TIMEFRAMES.has(timeframe)) return jsonError("Choose a supported timeframe.", 400);

  const bytes = Buffer.from(await image.arrayBuffer());
  const mimeType = image.type as "image/png" | "image/jpeg" | "image/webp";
  if (!hasValidImageSignature(bytes, mimeType)) {
    return jsonError("The file contents do not match the selected image type.", 415);
  }
  const receivedAtUtc = new Date().toISOString();
  const scanId = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const storagePath = `${user.id}/${scanId}.${extension}`;
  const model = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";
  const prompt = `You are the perception-only OEM+ ChartScanner. Extract visible facts from this screenshot. You are NOT the Trading Brain and MUST NOT analyze, recommend, predict, score a trade, or generate BUY/SELL/entry/stop/target instructions.
User-entered context (not proof of what the screenshot displays): instrument=${symbol}; timeframe=${timeframe}; notes=${notes || "none"}.
Return one JSON object with this shape:
{
 "screenType":{"value":"MT5_MOBILE|MT5_DESKTOP|TRADINGVIEW|QUOTES_LIST|ORDER_TICKET|SIGNAL_CARD|UNKNOWN","confidence":0.0},
 "instrument":{"value":null,"confidence":0.0},
 "timeframe":{"value":null,"confidence":0.0},
 "bid":{"value":null,"confidence":0.0},
 "ask":{"value":null,"confidence":0.0},
 "spread":{"value":null,"confidence":0.0},
 "marketStatus":{"value":null,"confidence":0.0},
 "timestamps":{
   "deviceTime":{"value":null,"confidence":0.0},
   "chartOrBrokerTime":{"value":null,"confidence":0.0},
   "lastCandleTime":{"value":null,"confidence":0.0},
   "timezoneOrBrokerOffset":{"value":null,"confidence":0.0}
 },
 "marketLocation":{
   "description":{"value":null,"confidence":0.0},
   "visibleLevels":[{"label":"visible label only","price":null,"confidence":0.0}],
   "visibleFeatures":["plain visual facts only"]
 },
 "quality":{"rating":"CLEAR|PARTIAL|POOR","warnings":[]}
}
Rules:
- Never copy the user-entered instrument/timeframe into screenshot-observed fields unless independently visible in the image. The separate userContext is stored by the server.
- Prices must be exact legible values. Otherwise null; never estimate.
- marketStatus only when explicitly visible; do not infer from current time or weekend.
- Times must preserve the displayed text. Never guess timezone or convert without a verified offset.
- Describe geometry/visible facts only (e.g. candles rising, visible horizontal line, chart cropped). No trend bias, support/resistance opinion, structure labels, liquidity, setup, signal, entry, stop, target, risk/reward, or trade confidence.
- Use confidence from 0 to 1 per field. Low-confidence values remain uncertain.
- Include quality warnings for blur, crop, overlays, missing axis, unreadable symbol/timeframe, or duplicate-looking image.
- No extra keys or prose.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${image.type};base64,${bytes.toString("base64")}` } },
        ] }],
        temperature: 0,
        max_completion_tokens: 1400,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(55_000),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) return jsonError("Groq rejected the server API key. Check GROQ_API_KEY.", 502);
      if (response.status === 429) return jsonError("The vision model rate limit has been reached. Try again shortly.", 429);
      console.error("Groq scanner perception failed:", response.status, errorBody?.error?.message || "Unknown provider error");
      return jsonError("The chart could not be read. Please try again shortly.", 502);
    }
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) return jsonError("The vision model returned an empty observation.", 502);
    let parsed: unknown;
    try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch { return jsonError("The observation was not valid structured data. Try a clearer screenshot.", 502); }

    const packet = parseObservation(parsed, { scanId, receivedAtUtc, sha256, mimeType, byteLength: bytes.byteLength, storagePath, symbol, timeframe, notes });
    if (!packet) return jsonError("The image observation failed schema validation. No assessment was generated.", 502);

    const { error: uploadError } = await supabase.storage.from("chart-images").upload(storagePath, bytes, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      console.error("Private chart image upload failed:", uploadError.message);
      return jsonError("The original chart image could not be saved securely. No scan was recorded.", 503);
    }

    const { error: saveError } = await supabase.from("chart_scans").insert({
      user_id: user.id,
      symbol,
      timeframe,
      image_path: storagePath,
      status: "completed",
      analysis: { observation: packet, brainStatus: "NOT_CONNECTED" },
      model_name: model,
    });
    if (saveError) {
      await supabase.storage.from("chart-images").remove([storagePath]);
      console.error("Chart observation database save failed:", saveError.message);
      return jsonError("The observation could not be saved to your private scan history. Please retry.", 503);
    }

    return NextResponse.json({
      observation: packet,
      assessment: null,
      brainStatus: "NOT_CONNECTED",
      message: "Observation captured. The Trading Brain is not connected, so no BUY, SELL or trade levels have been generated.",
      model,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return jsonError("Chart reading timed out. Try a smaller or clearer screenshot.", 504);
    console.error("Scanner perception request failed:", error);
    return jsonError("Could not reach the vision model. Check your connection and retry.", 502);
  }
}
