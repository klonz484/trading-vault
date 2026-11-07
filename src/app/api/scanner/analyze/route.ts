import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DECISIONS = new Set(["BUY", "SELL", "NO TRADE"]);
const ORDER_TYPES = new Set(["MARKET", "PENDING", "WAIT"]);
const DATA_QUALITY = new Set(["CLEAR", "PARTIAL", "POOR"]);

type PriceLevel = { price: number | null; rationale: string };
type TargetLevel = { price: number | null; rationale: string };
type ScannerSetup = {
  decision: "BUY" | "SELL" | "NO TRADE";
  orderType: "MARKET" | "PENDING" | "WAIT";
  confidence: number;
  dataQuality: "CLEAR" | "PARTIAL" | "POOR";
  summary: string;
  entry: { low: number | null; high: number | null; rationale: string };
  stopLoss: PriceLevel;
  targets: TargetLevel[];
  invalidation: string;
  supportingEvidence: string[];
  opposingEvidence: string[];
  confirmations: string[];
  uncertainties: string[];
  riskReward: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = "Not clear from the screenshot"): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 600) : fallback;
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .slice(0, 8).map((item) => item.trim().slice(0, 300));
}

function price(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSetup(value: unknown): ScannerSetup | null {
  if (!isRecord(value)) return null;
  const decision = value.decision;
  const orderType = value.orderType;
  const dataQuality = value.dataQuality;
  const confidence = value.confidence;
  if (!DECISIONS.has(String(decision)) || !ORDER_TYPES.has(String(orderType)) ||
      !DATA_QUALITY.has(String(dataQuality)) || typeof confidence !== "number" ||
      !Number.isFinite(confidence) || confidence < 0 || confidence > 100) return null;

  const entry = isRecord(value.entry) ? value.entry : {};
  const stopLoss = isRecord(value.stopLoss) ? value.stopLoss : {};
  const rawTargets = Array.isArray(value.targets) ? value.targets : [];
  const targets = rawTargets.slice(0, 3).filter(isRecord).map((target) => ({
    price: price(target.price),
    rationale: text(target.rationale),
  }));

  return {
    decision: decision as ScannerSetup["decision"],
    orderType: orderType as ScannerSetup["orderType"],
    confidence: Math.round(confidence),
    dataQuality: dataQuality as ScannerSetup["dataQuality"],
    summary: text(value.summary),
    entry: {
      low: price(entry.low),
      high: price(entry.high),
      rationale: text(entry.rationale),
    },
    stopLoss: { price: price(stopLoss.price), rationale: text(stopLoss.rationale) },
    targets,
    invalidation: text(value.invalidation),
    supportingEvidence: list(value.supportingEvidence),
    opposingEvidence: list(value.opposingEvidence),
    confirmations: list(value.confirmations),
    uncertainties: list(value.uncertainties),
    riskReward: typeof value.riskReward === "string" ? value.riskReward.slice(0, 80) : null,
  };
}

function formatAnalysis(setup: ScannerSetup): string {
  const level = (value: number | null) => value === null ? "Not readable" : String(value);
  return [
    `Decision: ${setup.decision} · ${setup.orderType}`,
    `Confidence: ${setup.confidence}% (analytical estimate, not a probability guarantee)`,
    `Summary: ${setup.summary}`,
    `Entry: ${level(setup.entry.low)} – ${level(setup.entry.high)} · ${setup.entry.rationale}`,
    `Stop loss: ${level(setup.stopLoss.price)} · ${setup.stopLoss.rationale}`,
    ...setup.targets.map((target, index) => `Target ${index + 1}: ${level(target.price)} · ${target.rationale}`),
    `Invalidation: ${setup.invalidation}`,
    `Supporting evidence: ${setup.supportingEvidence.join("; ") || "None clearly identified"}`,
    `Opposing evidence: ${setup.opposingEvidence.join("; ") || "None clearly identified"}`,
    `Confirmation needed: ${setup.confirmations.join("; ") || "None specified"}`,
    `Uncertainty: ${setup.uncertainties.join("; ") || "No additional uncertainty stated"}`,
    `Risk/reward: ${setup.riskReward ?? "Not calculated"}`,
    `Chart readability: ${setup.dataQuality}`,
  ].join("\n\n");
}

export async function POST(request: Request) {
  const ownerUserId = process.env.TRADING_VAULT_OWNER_USER_ID;
  if (!ownerUserId) return jsonError("Owner access is not configured for this deployment.", 503);

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return jsonError("Authentication is unavailable because Supabase is not configured.", 503);
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError("Please sign in before analyzing a chart.", 401);
  if (user.id !== ownerUserId) return jsonError("This workspace is restricted to its owner.", 403);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return jsonError("Chart Scanner is not connected yet. Configure GROQ_API_KEY on the server.", 503);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Could not read the upload. Please choose the chart image again.", 400);
  }

  const image = formData.get("image");
  const symbol = String(formData.get("symbol") || "Not provided").slice(0, 30);
  const timeframe = String(formData.get("timeframe") || "Not provided").slice(0, 20);
  const notes = String(formData.get("notes") || "").slice(0, 1000);

  if (!(image instanceof File)) return jsonError("Please upload a chart image.", 400);
  if (!ALLOWED_TYPES.has(image.type)) return jsonError("Unsupported image type. Use PNG, JPG, or WebP.", 415);
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) return jsonError("The image must be between 1 byte and 10 MB.", 413);

  const bytes = Buffer.from(await image.arrayBuffer());
  const base64Image = bytes.toString("base64");
  const model = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

  const prompt = `You are OEM+ ChartScanner, an evidence-led assistant for discretionary Forex and Gold traders.
Read only what is actually visible in the supplied trading chart screenshot.

Trader context:
- Instrument: ${symbol}
- Timeframe: ${timeframe}
- Notes: ${notes || "None"}

Return ONLY one valid JSON object, with exactly this shape:
{
  "decision": "BUY" | "SELL" | "NO TRADE",
  "orderType": "MARKET" | "PENDING" | "WAIT",
  "confidence": 0,
  "dataQuality": "CLEAR" | "PARTIAL" | "POOR",
  "summary": "short evidence-led explanation",
  "entry": { "low": null, "high": null, "rationale": "..." },
  "stopLoss": { "price": null, "rationale": "..." },
  "targets": [{ "price": null, "rationale": "..." }],
  "invalidation": "...",
  "supportingEvidence": ["..."],
  "opposingEvidence": ["..."],
  "confirmations": ["..."],
  "uncertainties": ["..."],
  "riskReward": null
}

Rules:
- Use numeric prices only when legible on the screenshot. Otherwise use null. Never estimate or invent a price.
- If the chart is unclear, incomplete, contradictory, or lacks a defensible setup, decision MUST be NO TRADE and orderType MUST be WAIT.
- BUY or SELL requires visible directional evidence and a clear invalidation condition. A directional bias alone is not an entry signal.
- Confidence is an analytical evidence-strength score, not a win probability. Reduce it for missing context, blurry prices, conflicting signals or incomplete candles.
- Separate supporting evidence from opposing evidence. Include structure, liquidity, displacement, key levels, session context and timeframe alignment only when visibly supported.
- Do not infer live market conditions from an old screenshot. Do not claim market data is connected.
- Never invent instrument, timeframe, indicators, volume, candles, levels or news. State uncertainty.
- Do not calculate lot size or place trades. All execution is manual in MT5.
- Keep arrays concise. No markdown fences, prose outside JSON, or extra keys.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${image.type};base64,${base64Image}` } },
          ],
        }],
        temperature: 0.1,
        max_completion_tokens: 1800,
        reasoning_effort: "low",
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const providerMessage = errorBody?.error?.message;
      if (response.status === 401 || response.status === 403) return jsonError("Groq rejected the API key. Check the server-side GROQ_API_KEY.", 502);
      if (response.status === 429) return jsonError("The model rate limit has been reached. Wait a little and try again.", 429);
      console.error("Groq vision request failed:", response.status, providerMessage || "Unknown provider error");
      return jsonError("The vision model could not complete the analysis. Please try again shortly.", 502);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || !raw.trim()) return jsonError("The model returned an empty analysis. Please try again.", 502);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, ""));
    } catch {
      return jsonError("The model response was not valid structured data. Please retry with a clearer chart.", 502);
    }
    const setup = parseSetup(parsed);
    if (!setup) return jsonError("The model response did not meet the scanner's safety and structure checks. Please retry.", 502);

    return NextResponse.json({ setup, analysis: formatAnalysis(setup), model });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return jsonError("The chart analysis timed out. Try a smaller or clearer screenshot.", 504);
    console.error("Chart Scanner request error:", error);
    return jsonError("Could not reach the vision model. Check your connection and try again.", 502);
  }
}
