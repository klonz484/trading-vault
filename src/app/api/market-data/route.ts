import { connection, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getInstrument, isMarketDataTimeframe, getTwelveDataSnapshot } from "@/lib/market-data";
import { canDisplayMarketPrices } from "@/lib/market-data/readiness";
import { MarketDataProviderError } from "@/lib/market-data/types";

export const maxDuration = 20;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Authenticated, owner-only, on-demand market-data boundary.
 * This endpoint never polls in the background and never returns provider keys.
 * Prices remain withheld until licence, entitlement and calibrated data-quality
 * gates are explicitly satisfied.
 */
export async function GET(request: Request) {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return jsonError("Please sign in to view market data.", 401);

  const ownerUserId = process.env.TRADING_VAULT_OWNER_USER_ID;
  if (!ownerUserId) return jsonError("Market data is unavailable because owner access is not configured.", 503);
  if (user.id !== ownerUserId) return jsonError("This Trading Vault workspace is restricted to its owner.", 403);

  const url = new URL(request.url);
  const instrumentId = (url.searchParams.get("instrument") || "EURUSD").toUpperCase();
  const timeframe = (url.searchParams.get("timeframe") || "M15").toUpperCase();

  if (!getInstrument(instrumentId)) return jsonError("Unsupported market instrument.", 400);
  if (!isMarketDataTimeframe(timeframe)) return jsonError("Unsupported market timeframe.", 400);

  if (!process.env.TWELVE_DATA_API_KEY) {
    return NextResponse.json({
      status: "NOT_CONFIGURED",
      pricesAvailable: false,
      instrument: instrumentId,
      timeframe,
      message: "The server-side Twelve Data credential is not configured.",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  // Shared atomic owner limiter prevents repeated on-demand provider requests.
  const { data: withinRateLimit, error: rateLimitError } = await supabase.rpc(
    "consume_scanner_rate_limit",
    { p_window_seconds: 60, p_max_requests: 5 },
  );
  if (rateLimitError) {
    console.error("Market-data rate-limit check failed:", rateLimitError.message);
    return jsonError("Market data is temporarily unavailable because the request limit could not be checked.", 503);
  }
  if (withinRateLimit !== true) return jsonError("The market-data request limit has been reached. Please wait one minute.", 429);

  const configuredFreshness = Number(process.env.TRADING_VAULT_MARKET_DATA_MAX_AGE_SECONDS);
  const maxAgeSeconds = Number.isInteger(configuredFreshness) && configuredFreshness > 0
    ? configuredFreshness
    : undefined;

  try {
    const snapshot = await getTwelveDataSnapshot(instrumentId as Parameters<typeof getTwelveDataSnapshot>[0], timeframe, {
      outputsize: 100,
      maxAgeSeconds,
    });

    // These flags must only be enabled after the owner verifies the actual
    // provider plan, intended use, redistribution rights and instrument access.
    const entitlementStatus = process.env.TRADING_VAULT_MARKET_DATA_ENTITLEMENT_VERIFIED === "true"
      ? "VERIFIED" as const : "UNVERIFIED" as const;
    const licenceStatus = process.env.TRADING_VAULT_MARKET_DATA_LICENSE_VERIFIED === "true"
      ? "VERIFIED" as const : "UNVERIFIED" as const;

    const pricesAvailable = canDisplayMarketPrices({
      entitlementStatus,
      licenceStatus,
      validation: snapshot.validation,
    });

    return NextResponse.json({
      status: pricesAvailable ? "READY" : snapshot.validation.status,
      pricesAvailable,
      instrument: snapshot.instrument,
      timeframe: snapshot.timeframe,
      provider: snapshot.provider,
      retrievedAt: snapshot.retrievedAt,
      source: {
        ...snapshot.source,
        entitlementStatus,
        licenceStatus,
      },
      validation: snapshot.validation,
      candles: pricesAvailable ? snapshot.candles : [],
      limitations: [
        ...snapshot.limitations,
        ...(!maxAgeSeconds ? ["A calibrated freshness threshold is not configured."] : []),
        ...(entitlementStatus !== "VERIFIED" ? ["Provider account entitlement has not been verified."] : []),
        ...(licenceStatus !== "VERIFIED" ? ["Provider licence and permitted display/use have not been verified."] : []),
        ...(!pricesAvailable ? ["Price values are withheld until every release gate is satisfied."] : []),
      ],
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MarketDataProviderError) {
      const status = error.code === "RATE_LIMITED" ? 429
        : error.code === "MISSING_CREDENTIAL" ? 503
        : error.code === "ENTITLEMENT" ? 403
        : error.code === "TIMEOUT" ? 504 : 502;
      return jsonError(error.message, status);
    }
    console.error("Market-data request failed:", error);
    return jsonError("The market-data provider could not complete this request.", 502);
  }
}
