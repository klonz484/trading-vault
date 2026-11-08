import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseScannerSummary } from "@/lib/scanner/summary";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type PlanAudit = {
  scenario: string; entryType: "exact" | "range" | "conditional_close";
  entry: number | null; entryLow: number; entryHigh: number; stop: number; target: number;
  riskDistanceMin: number; riskDistanceMax: number; rewardDistanceMin: number; rewardDistanceMax: number;
  riskRewardMin: number; riskRewardMax: number; pipSize: number | null;
  riskPipsMin: number | null; riskPipsMax: number | null; rewardPipsMin: number | null; rewardPipsMax: number | null;
  arithmeticValid: boolean; directionValid: boolean; technicalStatus: "unverified"; valid: boolean; issues: string[];
};

function auditTradePlans(analysis: string, symbol: string): PlanAudit[] {
  const currencyCodes = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "ZAR", "SGD", "HKD", "NOK", "SEK", "DKK", "PLN", "TRY", "MXN", "CNH", "CNY"]);
  const pair = symbol.match(/^([A-Z]{3})([A-Z]{3})$/);
  const pipSize = pair && currencyCodes.has(pair[1]) && currencyCodes.has(pair[2]) ? (pair[2] === "JPY" ? 0.01 : 0.0001) : null;
  const audits: PlanAudit[] = [];
  const blockPattern = /TV_PLAN_AUDIT_START\s*\n([\s\S]*?)\nTV_PLAN_AUDIT_END/gi;
  for (const match of analysis.matchAll(blockPattern)) {
    const block = match[1];
    const read = (label: string): number | null => {
      const found = block.match(new RegExp("^\\s*" + label + "\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*$", "im"));
      return found ? Number(found[1]) : null;
    };
    const scenario = block.match(/^\s*Scenario\s*:\s*(Bearish|Bullish|Sell|Buy)\s*$/im)?.[1]?.toLowerCase();
    const rawType = block.match(/^\s*EntryType\s*:\s*(exact|range|conditional_close)\s*$/im)?.[1]?.toLowerCase();
    const entryType = (rawType || "exact") as PlanAudit["entryType"];
    const legacyEntry = read("Entry");
    const entryLow = entryType === "range" ? read("EntryLow") : legacyEntry;
    const entryHigh = entryType === "range" ? read("EntryHigh") : legacyEntry;
    const stop = read("Stop"), target = read("Target");
    if (!scenario || entryLow === null || entryHigh === null || stop === null || target === null ||
        ![entryLow, entryHigh, stop, target].every(Number.isFinite) || entryLow <= 0 || entryHigh <= 0 ||
        stop <= 0 || target <= 0 || entryLow > entryHigh) continue;
    const bearish = scenario === "bearish" || scenario === "sell";
    const risks = [Math.abs(entryLow - stop), Math.abs(entryHigh - stop)];
    const rewards = [Math.abs(target - entryLow), Math.abs(target - entryHigh)];
    const rr = risks.map((risk, i) => risk > 0 ? rewards[i] / risk : 0);
    const riskDistanceMin = Math.min(...risks), riskDistanceMax = Math.max(...risks);
    const rewardDistanceMin = Math.min(...rewards), rewardDistanceMax = Math.max(...rewards);
    const riskRewardMin = Math.min(...rr), riskRewardMax = Math.max(...rr);
    const directionValid = bearish ? stop > entryHigh && target < entryLow : stop < entryLow && target > entryHigh;
    const arithmeticValid = riskDistanceMin > 0 && rewardDistanceMin > 0;
    const issues: string[] = [];
    if (!arithmeticValid) issues.push("At least one entry price has zero stop or target distance.");
    if (!directionValid) issues.push(bearish
      ? "Bearish plan requires the stop above the entire entry area and the target below it."
      : "Bullish plan requires the stop below the entire entry area and the target above it.");
    audits.push({
      scenario, entryType, entry: entryLow === entryHigh ? entryLow : null, entryLow, entryHigh, stop, target,
      riskDistanceMin, riskDistanceMax, rewardDistanceMin, rewardDistanceMax, riskRewardMin, riskRewardMax,
      pipSize, riskPipsMin: pipSize ? riskDistanceMin / pipSize : null, riskPipsMax: pipSize ? riskDistanceMax / pipSize : null,
      rewardPipsMin: pipSize ? rewardDistanceMin / pipSize : null, rewardPipsMax: pipSize ? rewardDistanceMax / pipSize : null,
      arithmeticValid, directionValid, technicalStatus: "unverified", valid: arithmeticValid && directionValid, issues,
    });
  }
  return audits;
}


function hasValidImageSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Please sign in before analyzing a chart.", 401);
  }

  // Defense in depth: enforce the permanent owner boundary inside the API
  // handler as well as in the request proxy. This prevents accidental exposure
  // if proxy configuration changes or this handler is reused elsewhere.
  const ownerUserId = process.env.TRADING_VAULT_OWNER_USER_ID;
  if (!ownerUserId) {
    return jsonError("Chart analysis is unavailable because owner access is not configured.", 503);
  }
  if (user.id !== ownerUserId) {
    return jsonError("This Trading Vault workspace is restricted to its owner.", 403);
  }

  // Use a database-backed atomic counter so limits apply across serverless instances.
  // Fail closed if the migration/RPC is unavailable; do not silently disable abuse protection.
  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc(
    "consume_scanner_rate_limit",
    { p_window_seconds: 60, p_max_requests: 5 },
  );
  if (rateLimitError) {
    console.error("Scanner rate-limit check failed:", rateLimitError.message);
    return jsonError("Chart analysis is temporarily unavailable. Please try again shortly.", 503);
  }
  if (withinRateLimit !== true) {
    return jsonError("You have reached the chart-analysis limit. Please wait one minute and try again.", 429);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(
      "Chart Scanner is not connected yet. Add GROQ_API_KEY to your server environment and restart the app.",
      503,
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES + 64 * 1024) {
    return jsonError("The upload is larger than the 4 MB limit.", 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Could not read the upload. Please choose the chart image again.", 400);
  }

  const image = formData.get("image");
  const symbol = String(formData.get("symbol") || "EURUSD").trim().toUpperCase().slice(0, 20);
  const timeframe = String(formData.get("timeframe") || "H1").trim().slice(0, 12);
  const notes = String(formData.get("notes") || "").slice(0, 1000);

  if (!(image instanceof File)) {
    return jsonError("Please upload a chart image.", 400);
  }
  if (!ALLOWED_TYPES.has(image.type)) {
    return jsonError("Unsupported image type. Use PNG, JPG, or WebP.", 415);
  }
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
    return jsonError("The image must be between 1 byte and 4 MB.", 413);
  }

  const imageBytes = new Uint8Array(await image.arrayBuffer());
  if (!hasValidImageSignature(image.type, imageBytes)) {
    return jsonError("The uploaded file does not match its declared image type.", 415);
  }
  if (!/^[A-Z0-9_]{3,20}$/.test(symbol)) {
    return jsonError("Use a valid instrument symbol containing 3–20 letters, numbers, or underscores.", 400);
  }
  if (!timeframe) {
    return jsonError("Please choose a timeframe.", 400);
  }

  const scanId = crypto.randomUUID();
  const imagePath = `${user.id}/${scanId}.${EXTENSIONS[image.type]}`;
  const { error: uploadError } = await supabase.storage
    .from("chart-images")
    .upload(imagePath, imageBytes, {
      contentType: image.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Chart image upload failed:", uploadError.message);
    return jsonError("Your chart image could not be saved. Please try again.", 500);
  }

  const removeUploadedImage = async () => {
    const { error } = await supabase.storage.from("chart-images").remove([imagePath]);
    if (error) console.error("Chart image cleanup failed:", error.message);
  };

  const bytes = Buffer.from(imageBytes);
  const base64Image = bytes.toString("base64");
  const model = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

  const prompt = `You are the chart-reading assistant inside Trading Vault. Inspect the attached trading-platform screenshot carefully.

Context supplied by the trader:
- Instrument: ${symbol}
- Timeframe: ${timeframe}
- Additional context: ${notes || "None"}

First output exactly one machine-readable summary block describing the CURRENT actionable state, not a hypothetical future scenario:
TV_SETUP_SUMMARY_START
Decision: BUY | SELL | NO TRADE
OrderType: MARKET | PENDING | NONE
EntryType: exact | range | conditional_close | none
Entry: numeric price (exact or conditional_close only)
EntryLow: numeric price (range only)
EntryHigh: numeric price (range only)
StopLoss: numeric price
TakeProfit1: numeric price
TakeProfit2: numeric price or leave blank
TakeProfit3: numeric price or leave blank
Invalidation: numeric price or leave blank
Reason: one or two concise sentences
TV_SETUP_SUMMARY_END

Summary rules:
- Choose NO TRADE and OrderType NONE unless the screenshot supports a complete, currently actionable setup with a clear entry or trigger, stop loss and at least one target. Do not turn a conditional future scenario into an immediate MARKET order.
- MARKET is allowed only when visible current price is already at the proposed entry decision area and the setup is actionable now. Use PENDING for a future pullback or candle-close confirmation.
- For a range entry, supply EntryLow and EntryHigh and leave Entry blank. For exact or conditional_close, supply Entry and leave EntryLow/EntryHigh blank.
- For BUY, the stop must be below the full entry and TakeProfit1 above it. For SELL, the stop must be above the full entry and TakeProfit1 below it. Otherwise choose NO TRADE.
- Never invent prices to fill missing fields. Optional targets and invalidation may be blank.
- Do not provide a numerical confidence percentage. Trading Vault will show confidence as not calibrated until a validated scoring method exists.
- Reason must briefly explain why the setup is or is not actionable now.

After the summary block, provide a SHORT supporting chart read using these seven headings:
1. Visible chart facts
2. Structure and bias
3. Key support/resistance
4. Momentum and indicators
5. Bullish/bearish conditions
6. Trade-plan context
7. Uncertainties

Strict length limit: aim for 700–1,000 words maximum across the entire response, including the summary block. Keep each section to at most two concise bullets or two short sentences. Do not repeat the summary's entry, stop and targets in the narrative. Do not pad the response. The machine-readable summary block is the priority; finish it and the uncertainty section before adding optional detail.

Important rules:
- Do not invent current price, candles, indicators, levels, volume, symbol or timeframe. If a value is not clearly legible, say so.
- Distinguish observations from interpretations. State when the screenshot is cropped, blurry, or missing context.
- Do not present a setup as a certainty or tell the user to enter a trade. If there is no clear setup, say “No clear setup”.
- Do not calculate position size; the Trading Vault Risk Calculator handles that separately.
- Prefer conditional scenarios and explicit invalidation over confident predictions.
- Clearly label chart facts as "Visible observation", structural readings as "Interpretation", and any suggested price zone as "AI-proposed level"; never imply a proposed level is directly visible unless its exact price is legible.
- State whether the latest candle appears forming or closed; if the screenshot cannot establish this, say unknown.
- For every fully specified bullish or bearish scenario, append its own audit block, including alternative momentum plans when all three prices are explicit.
- For one exact entry, use EntryType: exact and Entry. For an entry zone, use EntryType: range and both EntryLow and EntryHigh; never collapse a zone to one price. For a close-confirmation trigger, use EntryType: conditional_close and Entry for the trigger price, while explaining the candle-close condition in the narrative.
- Example entry-zone block (replace values with actual proposed levels):
TV_PLAN_AUDIT_START
Scenario: Bearish
EntryType: range
EntryLow: 1.12300
EntryHigh: 1.12350
Stop: 1.12400
Target: 1.12200
TV_PLAN_AUDIT_END
Use Scenario: Bullish for bullish plans. Use a separate block for every fully specified scenario. Never invent missing values; omit a block if any required value is unavailable.
- Keep the response concise and complete. Prefer omitting optional commentary over exceeding the response limit.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${image.type};base64,${base64Image}` },
              },
            ],
          },
        ],
        temperature: 0.2,
        max_completion_tokens: 2800,
        reasoning_effort: "low",
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const providerMessage = errorBody?.error?.message;
      await removeUploadedImage();

      if (response.status === 401 || response.status === 403) {
        return jsonError("Groq rejected the API key. Check GROQ_API_KEY in your server environment.", 502);
      }
      if (response.status === 429) {
        return jsonError("The free model limit has been reached for now. Wait a little and try again.", 429);
      }
      console.error("Groq vision request failed:", response.status, providerMessage || "Unknown provider error");
      return jsonError("The vision model could not complete the analysis. Please try again shortly.", 502);
    }

    const payload = await response.json();
    const choice = payload?.choices?.[0];
    const analysis = choice?.message?.content;
    const finishReason = choice?.finish_reason;
    if (typeof analysis !== "string" || !analysis.trim()) {
      await removeUploadedImage();
      return jsonError("The model returned an empty analysis. Please try another screenshot.", 502);
    }

    const cleanAnalysis = analysis.trim();
    // Only a normal provider stop is considered complete. A token-limit stop
    // must remain visibly incomplete in both the API response and scan history.
    const scanStatus = finishReason === "stop" ? "completed" : "incomplete";
    const completionWarning =
      scanStatus === "incomplete"
        ? finishReason === "length"
          ? "The model reached its output limit before finishing. This scan is incomplete; do not treat it as a complete trade plan."
          : "The model did not confirm a normal completion. Review this partial analysis and do not treat it as a complete trade plan."
        : null;
    // Partial model output is not reliable enough for trade-plan validation. Only audit normally completed scans.
    const planAudits = scanStatus === "completed" ? auditTradePlans(cleanAnalysis, symbol) : [];
    const setupSummary = parseScannerSummary(cleanAnalysis);
    // The existing database constraint permits pending/processing/completed/failed,
    // but not "incomplete". Preserve the detailed completion state in analysis JSON
    // and map non-normal provider finishes to the supported "failed" row status.
    const persistedStatus = scanStatus === "completed" ? "completed" : "failed";
    const { error: insertError } = await supabase.from("chart_scans").insert({
      id: scanId,
      user_id: user.id,
      symbol,
      timeframe,
      image_path: imagePath,
      status: persistedStatus,
      analysis: {
        text: cleanAnalysis,
        notes,
        warning: completionWarning,
        completionStatus: scanStatus,
        providerFinishReason: finishReason ?? null,
        planAudits,
        setupSummary,
      },
      model_name: model,
    });

    if (insertError) {
      console.error("Chart scan database save failed:", insertError.message);
      await removeUploadedImage();
      return jsonError("The analysis completed, but Trading Vault could not save this scan. Please try again.", 500);
    }

    return NextResponse.json({ analysis: cleanAnalysis, model, scanId, status: scanStatus, warning: completionWarning, planAudits, setupSummary });
  } catch (error) {
    await removeUploadedImage();
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonError("The chart analysis timed out. Try a smaller or clearer screenshot.", 504);
    }
    console.error("Chart Scanner request error:", error);
    return jsonError("Could not complete and save the chart analysis. Check your connection and try again.", 502);
  }
}
