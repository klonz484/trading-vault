import type {
  InstrumentDefinition,
  MarketDataTimeframe,
  NormalizedCandle,
} from "../types";
import { MarketDataProviderError } from "../types";
import { TWELVE_DATA_INTERVALS } from "../instruments";

const BASE_URL = "https://api.twelvedata.com";

type TwelveDataTimeSeriesResponse = {
  meta?: { symbol?: string; interval?: string; currency_base?: string; currency_quote?: string };
  values?: Array<{
    datetime?: string;
    open?: string;
    high?: string;
    low?: string;
    close?: string;
    volume?: string;
  }>;
  status?: string;
  code?: number;
  message?: string;
};

const TIMEFRAME_SECONDS: Record<MarketDataTimeframe, number> = {
  M1: 60, M5: 300, M15: 900, M30: 1800,
  H1: 3600, H4: 14_400, D1: 86_400, W1: 604_800,
};

function parseNumber(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return Number.NaN;
  return Number(value);
}

/**
 * The request explicitly asks Twelve Data for UTC. Offset-free timestamps are
 * therefore interpreted as UTC by contract, never using the server locale.
 * The exact source string is retained separately on every candle.
 */
export function parseTwelveDataTimestamp(sourceTimestamp: string): string {
  const value = sourceTimestamp.trim();
  if (!value) throw new Error("empty timestamp");

  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  let parsed: Date;

  if (hasExplicitZone) {
    parsed = new Date(value);
  } else {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value);
    if (!dateOnly && !match) throw new Error("timestamp does not match the documented UTC format");
    const year = dateOnly?.[1] ?? match?.[1] ?? "";
    const month = dateOnly?.[2] ?? match?.[2] ?? "";
    const day = dateOnly?.[3] ?? match?.[3] ?? "";
    const hour = dateOnly ? "0" : match?.[4] ?? "0";
    const minute = dateOnly ? "0" : match?.[5] ?? "0";
    const second = dateOnly ? "0" : match?.[6] ?? "0";
    const fraction = dateOnly ? "0" : match?.[7] ?? "0";
    const milliseconds = Number(fraction.padEnd(3, "0"));
    parsed = new Date(Date.UTC(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(minute), Number(second), milliseconds,
    ));
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day) ||
      parsed.getUTCHours() !== Number(hour) ||
      parsed.getUTCMinutes() !== Number(minute) ||
      parsed.getUTCSeconds() !== Number(second)
    ) throw new Error("timestamp contains an invalid calendar date");
  }

  if (!Number.isFinite(parsed.getTime())) throw new Error("timestamp is not parseable");
  return parsed.toISOString();
}

export class TwelveDataProvider {
  private readonly apiKey = process.env.TWELVE_DATA_API_KEY;

  async getTimeSeries(
    instrument: InstrumentDefinition,
    timeframe: MarketDataTimeframe,
    outputsize = 100,
  ): Promise<{ candles: NormalizedCandle[]; retrievedAt: string; symbol: string }> {
    if (!this.apiKey) {
      throw new MarketDataProviderError(
        "Twelve Data is not configured. Add TWELVE_DATA_API_KEY to the server environment.",
        "twelve_data", "MISSING_CREDENTIAL", false,
      );
    }

    const interval = TWELVE_DATA_INTERVALS[timeframe];
    const url = new URL("/time_series", BASE_URL);
    url.searchParams.set("symbol", instrument.twelveDataSymbol);
    url.searchParams.set("interval", interval);
    const safeOutputsize = Number.isFinite(outputsize)
      ? Math.min(Math.max(Math.trunc(outputsize), 1), 500)
      : 100;
    url.searchParams.set("outputsize", String(safeOutputsize));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("apikey", this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const timedOut = (error as { name?: string })?.name === "TimeoutError";
      throw new MarketDataProviderError(
        timedOut ? "Twelve Data request timed out." : "Twelve Data could not be reached.",
        "twelve_data", timedOut ? "TIMEOUT" : "UPSTREAM_ERROR", true,
      );
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new MarketDataProviderError(
        "Twelve Data rate limit reached. Respect the provider retry window.",
        "twelve_data", "RATE_LIMITED", true,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new MarketDataProviderError(
        "Twelve Data rejected the account credential or entitlement.",
        "twelve_data", "ENTITLEMENT", false,
      );
    }
    if (response.status === 400) {
      throw new MarketDataProviderError(
        "Twelve Data rejected the requested symbol or interval.",
        "twelve_data", "INVALID_REQUEST", false,
      );
    }
    if (!response.ok) {
      throw new MarketDataProviderError(
        `Twelve Data returned HTTP ${response.status}.`,
        "twelve_data", "UPSTREAM_ERROR", response.status >= 500,
      );
    }

    let payload: TwelveDataTimeSeriesResponse;
    try {
      payload = await response.json() as TwelveDataTimeSeriesResponse;
    } catch {
      throw new MarketDataProviderError(
        "Twelve Data returned malformed JSON.",
        "twelve_data", "INVALID_RESPONSE", false,
      );
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new MarketDataProviderError(
        "Twelve Data returned a malformed response payload.",
        "twelve_data", "INVALID_RESPONSE", false,
      );
    }

    if (!Array.isArray(payload.values)) {
      const code = payload.code;
      const isEntitlement = code === 401 || code === 403 ||
        /permission|subscription|entitlement|plan/i.test(payload.message ?? "");
      throw new MarketDataProviderError(
        isEntitlement
          ? "Twelve Data account entitlement does not permit this request."
          : "Twelve Data returned an unexpected or unsuccessful response.",
        "twelve_data", isEntitlement ? "ENTITLEMENT" : "INVALID_RESPONSE", false,
      );
    }

    if (payload.meta !== undefined && (
      payload.meta === null ||
      typeof payload.meta !== "object" ||
      Array.isArray(payload.meta)
    )) {
      throw new MarketDataProviderError(
        "Twelve Data returned malformed response metadata.",
        "twelve_data", "INVALID_RESPONSE", false,
      );
    }
    if (payload.values.some((item) =>
      !item || typeof item !== "object" || Array.isArray(item)
    )) {
      throw new MarketDataProviderError(
        "Twelve Data returned malformed candle records.",
        "twelve_data", "INVALID_RESPONSE", false,
      );
    }

    const responseSymbol = typeof payload.meta?.symbol === "string"
      ? payload.meta.symbol
      : undefined;
    const responseInterval = typeof payload.meta?.interval === "string"
      ? payload.meta.interval
      : undefined;
    if (responseSymbol && responseSymbol.toUpperCase() !== instrument.twelveDataSymbol.toUpperCase()) {
      throw new MarketDataProviderError(
        "Twelve Data response symbol did not match the requested instrument.",
        "twelve_data", "INVALID_RESPONSE", false,
      );
    }
    if (responseInterval && responseInterval !== interval) {
      throw new MarketDataProviderError(
        "Twelve Data response interval did not match the requested timeframe.",
        "twelve_data", "INVALID_RESPONSE", false,
      );
    }

    const retrievedAt = new Date().toISOString();
    const retrievedAtMs = Date.parse(retrievedAt);
    const candles = payload.values.map((item): NormalizedCandle => {
      const sourceTimestamp = typeof item.datetime === "string" ? item.datetime : "";
      let timestamp = sourceTimestamp;
      try {
        timestamp = parseTwelveDataTimestamp(sourceTimestamp);
      } catch {
        // Preserve the unparseable source value; validation will quarantine it.
      }
      const timestampMs = Date.parse(timestamp);
      const provisional =
        !Number.isFinite(timestampMs) ||
        timestampMs + TIMEFRAME_SECONDS[timeframe] * 1000 > retrievedAtMs;

      const explicitTimezone = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.exec(sourceTimestamp)?.[0];
      const sourceTimezone = explicitTimezone ?? "UTC (requested)";

      return {
        instrument: instrument.id,
        timeframe,
        timestamp,
        open: parseNumber(item.open),
        high: parseNumber(item.high),
        low: parseNumber(item.low),
        close: parseNumber(item.close),
        volume: item.volume === undefined ? null : parseNumber(item.volume),
        provider: "twelve_data",
        retrievedAt,
        sourceTimestamp,
        sourceTimezone,
        provisional,
      };
    });

    // Do not sort here: preserve provider order so validation can detect it.
    return { candles, retrievedAt, symbol: payload.meta?.symbol ?? instrument.twelveDataSymbol };
  }
}
