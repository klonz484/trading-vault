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
      "alpha_vantage",
      "MISSING_CREDENTIAL",
      false,
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
  } catch {
    throw new MarketDataProviderError(
      "Alpha Vantage could not be reached.",
      "alpha_vantage",
      "UPSTREAM_ERROR",
      true,
    );
  }

  if (!response.ok) {
    throw new MarketDataProviderError(
      `Alpha Vantage returned HTTP ${response.status}.`,
      "alpha_vantage",
      "UPSTREAM_ERROR",
      response.status >= 500,
    );
  }

  const payload = (await response.json()) as AlphaVantageResponse;
  if (payload.Note || payload.Information) {
    throw new MarketDataProviderError(
      "Alpha Vantage returned a quota, entitlement or usage notice. No fallback is assumed.",
      "alpha_vantage",
      "RATE_LIMITED",
      true,
    );
  }
  if (payload["Error Message"]) {
    throw new MarketDataProviderError(
      "Alpha Vantage rejected the requested reference data.",
      "alpha_vantage",
      "INVALID_RESPONSE",
      false,
    );
  }
  return payload;
}

/**
 * This is a reference-rate helper only. It is not an intraday candle fallback
 * and must not be treated as an executable bid/ask quote without broker checks.
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
  retrievedAt: string;
}> {
  if (!instrument.alphaVantagePair) {
    throw new MarketDataProviderError(
      "Alpha Vantage fiat FX reference rates do not cover this instrument mapping.",
      "alpha_vantage",
      "UNSUPPORTED_CAPABILITY",
      false,
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
  if (!record || !Number.isFinite(exchangeRate)) {
    throw new MarketDataProviderError(
      "Alpha Vantage reference-rate response was missing a valid exchange rate.",
      "alpha_vantage",
      "INVALID_RESPONSE",
      false,
    );
  }

  const bidValue = Number(record["8. Bid Price"]);
  const askValue = Number(record["9. Ask Price"]);

  return {
    provider: "alpha_vantage",
    instrument: instrument.id,
    exchangeRate,
    bid: Number.isFinite(bidValue) ? bidValue : null,
    ask: Number.isFinite(askValue) ? askValue : null,
    sourceTimestamp: record["6. Last Refreshed"] ?? "",
    retrievedAt: new Date().toISOString(),
  };
}
