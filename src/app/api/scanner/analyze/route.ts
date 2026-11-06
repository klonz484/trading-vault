import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type PlanAudit = {
  scenario: string;
  entry: number;
  stop: number;
  target: number;
  riskDistance: number;
  rewardDistance: number;
  riskReward: number;
  pipSize: number | null;
  riskPips: number | null;
  rewardPips: number | null;
  valid: boolean;
  issues: string[];
};

function auditTradePlans(analysis: string, symbol: string): PlanAudit[] {
  const currencyCodes = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "ZAR", "SGD", "HKD", "NOK", "SEK", "DKK", "PLN", "TRY", "MXN", "CNH", "CNY"]);
  const pair = symbol.match(/^([A-Z]{3})([A-Z]{3})$/);
  const isKnownForexPair = Boolean(pair && currencyCodes.has(pair[1]) && currencyCodes.has(pair[2]));
  const pipSize = isKnownForexPair && pair ? (pair[2] === "JPY" ? 0.01 : 0.0001) : null;
  const audits: PlanAudit[] = [];
  const blockPattern = /TV_PLAN_AUDIT_START\s*\n([\s\S]*?)\nTV_PLAN_AUDIT_END/gi;
  for (const match of analysis.matchAll(blockPattern)) {
    const block = match[1];
    const read = (label: string) => {
      const found = block.match(new RegExp("^\\s*" + label + "\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*$", "im"));
      return found ? Number(found[1]) : null;
    };
    const scenario = block.match(/^\s*Scenario\s*:\s*(Bearish|Bullish|Sell|Buy)\s*$/im)?.[1]?.toLowerCase();
    const entry = read("Entry"), stop = read("Stop"), target = read("Target");
    if (!scenario || entry === null || stop === null || target === null ||
        ![entry, stop, target].every(Number.isFinite) || entry <= 0 || stop <= 0 || target <= 0) continue;
    const bearish = scenario === "bearish" || scenario === "sell";
    const riskDistance = Math.abs(entry - stop);
    const rewardDistance = Math.abs(target - entry);
    const riskReward = riskDistance > 0 ? rewardDistance / riskDistance : 0;
    const issues: string[] = [];
    if (riskDistance === 0) issues.push("Stop equals entry, so risk distance is zero.");
    if (rewardDistance === 0) issues.push("Target equals entry, so reward distance is zero.");
    if (bearish && !(stop > entry && target < entry)) issues.push("Bearish plan levels are directionally inconsistent.");
    if (!bearish && !(stop < entry && target > entry)) issues.push("Bullish plan levels are directionally inconsistent.");
    audits.push({
      scenario, entry, stop, target, riskDistance, rewardDistance, riskReward,
      pipSize, riskPips: pipSize ? riskDistance / pipSize : null,
      rewardPips: pipSize ? rewardDistance / pipSize : null,
      valid: issues.length === 0, issues,
    });
  }
  return audits;
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(
      "Chart Scanner is not connected yet. Add GROQ_API_KEY to your server environment and restart the app.",
      503,
    );
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
    return jsonError("The image must be between 1 byte and 10 MB.", 413);
  }
  if (!/^[A-Z0-9_]{3,20}$/.test(symbol)) {
    return jsonError("Use a valid instrument symbol containing 3–20 letters, numbers, or underscores.", 400);
  }
  if (!timeframe) {
    return jsonError("Please choose a timeframe.", 400);
  }

  const scanId = crypto.randomUUID();
  const imagePath = `${user.id}/${scanId}.${EXTENSIONS[image.type]}`;
  const imageBytes = new Uint8Array(await image.arrayBuffer());

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

Return a practical, clearly structured technical chart read with these headings:
1. What is visibly on the chart
2. Market structure and directional bias
3. Key support and resistance (only quote prices that are legible)
4. Momentum / visible indicators and patterns
5. Possible scenarios (bullish and bearish, with confirmation conditions)
6. Trade plan framework (entry area, invalidation/stop idea, targets and approximate R:R ONLY when the chart gives enough readable information)
7. What is uncertain or cannot be read

Important rules:
- Do not invent current price, candles, indicators, levels, volume, symbol or timeframe. If a value is not clearly legible, say so.
- Distinguish observations from interpretations. State when the screenshot is cropped, blurry, or missing context.
- Do not present a setup as a certainty or tell the user to enter a trade. If there is no clear setup, say “No clear setup”.
- Do not calculate position size; the Trading Vault Risk Calculator handles that separately.
- Prefer conditional scenarios and explicit invalidation over confident predictions.
- Clearly label chart facts as "Visible observation", structural readings as "Interpretation", and any suggested price zone as "AI-proposed level"; never imply a proposed level is directly visible unless its exact price is legible.
- State whether the latest candle appears forming or closed; if the screenshot cannot establish this, say unknown.
- If and only if you propose a specific, numeric entry, stop and single target for a bullish/bearish scenario, append a compact audit block using exactly this format. Include one block per fully specified scenario; do not invent missing values:
TV_PLAN_AUDIT_START
Scenario: Bearish
Entry: 1.12345
Stop: 1.12400
Target: 1.12200
TV_PLAN_AUDIT_END
Use Scenario: Bullish for a bullish plan. Replace example prices with the exact prices you proposed. If any value is unavailable, omit that scenario's audit block.
- Keep the response concise but useful for a discretionary trader.`;

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
        max_completion_tokens: 3200,
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
    const planAudits = auditTradePlans(cleanAnalysis, symbol);
    const { error: insertError } = await supabase.from("chart_scans").insert({
      id: scanId,
      user_id: user.id,
      symbol,
      timeframe,
      image_path: imagePath,
      status: scanStatus,
      analysis: { text: cleanAnalysis, notes, warning: completionWarning, planAudits },
      model_name: model,
    });

    if (insertError) {
      console.error("Chart scan database save failed:", insertError.message);
      await removeUploadedImage();
      return jsonError("The analysis completed, but Trading Vault could not save this scan. Please try again.", 500);
    }

    return NextResponse.json({ analysis: cleanAnalysis, model, scanId, status: scanStatus, warning: completionWarning, planAudits });
  } catch (error) {
    await removeUploadedImage();
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonError("The chart analysis timed out. Try a smaller or clearer screenshot.", 504);
    }
    console.error("Chart Scanner request error:", error);
    return jsonError("Could not complete and save the chart analysis. Check your connection and try again.", 502);
  }
}
