import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(
      "Chart Scanner is not connected yet. Add GROQ_API_KEY to your local .env.local file and restart the app.",
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
  const symbol = String(formData.get("symbol") || "Not provided").slice(0, 30);
  const timeframe = String(formData.get("timeframe") || "Not provided").slice(0, 20);
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

  const bytes = Buffer.from(await image.arrayBuffer());
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
        max_completion_tokens: 1800,
        reasoning_effort: "low",
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const providerMessage = errorBody?.error?.message;
      if (response.status === 401 || response.status === 403) {
        return jsonError("Groq rejected the API key. Check GROQ_API_KEY in .env.local.", 502);
      }
      if (response.status === 429) {
        return jsonError("The free model limit has been reached for now. Wait a little and try again.", 429);
      }
      console.error("Groq vision request failed:", response.status, providerMessage || "Unknown provider error");
      return jsonError("The vision model could not complete the analysis. Please try again shortly.", 502);
    }

    const payload = await response.json();
    const analysis = payload?.choices?.[0]?.message?.content;
    if (typeof analysis !== "string" || !analysis.trim()) {
      return jsonError("The model returned an empty analysis. Please try another screenshot.", 502);
    }

    return NextResponse.json({ analysis: analysis.trim(), model });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonError("The chart analysis timed out. Try a smaller or clearer screenshot.", 504);
    }
    console.error("Chart Scanner request error:", error);
    return jsonError("Could not reach the vision model. Check your connection and try again.", 502);
  }
}
