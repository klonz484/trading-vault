import type { InstrumentDefinition } from "../types";
import { MarketDataProviderError } from "../types";

const BASE_URL = "https://www.alphavantage.co/query";

type AlphaVantageResponse = Record<string, unknown> & {
  Note?: string;
  Information?: string;
  "Error Message"?: string;
};

function requireKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    throw new MarketDataProviderError(
      "Alpha Vantage is not configured. Add ALPHA_VANTAGE_API_KEY to the server environment.",
      "alpha_vantage", "MISSING_CREDENTIAL", false,
    );
  }
  return key;
}

async function request(params: Record<string, string>): Promise<AlphaVantageResponse> {
  const url = new URL(BASE_URL);
  for (const [key, value] of Object.entries({ ...params, apikey: requireKey() })) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const timedOut = (error as { name?: string })?.name === "TimeoutError";
    throw new MarketDataProviderError(
      timedOut ? "Alpha Vantage request timed out." : "Alpha Vantage could not be reached.",
      "alpha_vantage", timedOut ? "TIMEOUT" : "UPSTREAM_ERROR", true,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MarketDataProviderError(
      "Alpha Vantage rejected the account credential or entitlement.",
      "alpha_vantage", "ENTITLEMENT", false,
    );
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new MarketDataProviderError(
      "Alpha Vantage rate limit reached. Respect the provider retry window.",
      "alpha_vantage", "RATE_LIMITED", false,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  if (!response.ok) {
    throw new MarketDataProviderError(
      `Alpha Vantage returned HTTP ${response.status}.`,
      "alpha_vantage", "UPSTREAM_ERROR", response.status >= 500,
    );
  }

  let payload: AlphaVantageResponse;
  try {
    payload = await response.json() as AlphaVantageResponse;
  } catch {
    throw new MarketDataProviderError(
      "Alpha Vantage returned malformed JSON.",
      "alpha_vantage", "INVALID_RESPONSE", false,
    );
  }

  if (payload.Note) {
    throw new MarketDataProviderError(
      "Alpha Vantage reported a usage or quota limit. Automatic retry is disabled.",
      "alpha_vantage", "RATE_LIMITED", false,
    );
  }
  if (payload.Information) {
    const entitlementNotice = /premium|subscription|entitlement|plan|not available/i.test(payload.Information);
    throw new MarketDataProviderError(
      entitlementNotice
        ? "Alpha Vantage account entitlement does not permit this endpoint."
        : "Alpha Vantage returned an informational usage restriction; automatic retry is disabled.",
      "alpha_vantage",
      entitlementNotice ? "ENTITLEMENT" : "RATE_LIMITED",
      false,
    );
  }
  if (payload["Error Message"]) {
    throw new MarketDataProviderError(
      "Alpha Vantage rejected the requested reference-data parameters.",
      "alpha_vantage", "INVALID_REQUEST", false,
    );
  }
  return payload;
}

/**
 * Reference-rate helper only. This is not an intraday candle fallback and
 * must not be treated as an executable bid/ask quote without broker checks.
 */
export async function getAlphaVantageFxReference(
  instrument: InstrumentDefinition,
): Promise<{
  provider: "alpha_vantage";
  instrument: string;
  exchangeRate: number;
  bid: number | null;
  ask: number | null;
  sourceTimestamp: string;
  sourceTimezone: "PROVIDER_TIMEZONE_UNSPECIFIED";
  retrievedAt: string;
}> {
  if (!instrument.alphaVantagePair) {
    throw new MarketDataProviderError(
      "Alpha Vantage fiat FX reference rates do not cover this instrument mapping.",
      "alpha_vantage", "UNSUPPORTED_CAPABILITY", false,
    );
  }

  const [fromCurrency, toCurrency] = instrument.alphaVantagePair;
  const payload = await request({
    function: "CURRENCY_EXCHANGE_RATE",
    from_currency: fromCurrency,
    to_currency: toCurrency,
  });

  const record = payload["Realtime Currency Exchange Rate"] as Record<string, string> | undefined;
  const exchangeRate = Number(record?.["5. Exchange Rate"]);
  if (!record || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new MarketDataProviderError(
      "Alpha Vantage reference-rate response was missing a positive finite exchange rate.",
      "alpha_vantage", "INVALID_RESPONSE", false,
    );
  }

  const bidValue = Number(record["8. Bid Price"]);
  const askValue = Number(record["9. Ask Price"]);
  const bid = Number.isFinite(bidValue) && bidValue > 0 ? bidValue : null;
  const ask = Number.isFinite(askValue) && askValue > 0 ? askValue : null;
  if (bid !== null && ask !== null && bid > ask) {
    throw new MarketDataProviderError(
      "Alpha Vantage returned a bid price above its ask price.",
      "alpha_vantage", "INVALID_RESPONSE", false,
    );
  }

  return {
    provider: "alpha_vantage",
    instrument: instrument.id,
    exchangeRate,
    bid,
    ask,
    sourceTimestamp: record["6. Last Refreshed"] ?? "",
    sourceTimezone: "PROVIDER_TIMEZONE_UNSPECIFIED",
    retrievedAt: new Date().toISOString(),
  };
}
