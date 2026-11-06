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

function parseNumber(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return Number.NaN;
  return Number(value);
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
        "twelve_data",
        "MISSING_CREDENTIAL",
        false,
      );
    }

    const interval = TWELVE_DATA_INTERVALS[timeframe];
    const url = new URL("/time_series", BASE_URL);
    url.searchParams.set("symbol", instrument.twelveDataSymbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", String(Math.min(Math.max(outputsize, 1), 500)));
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
    } catch {
      throw new MarketDataProviderError(
        "Twelve Data could not be reached. Retry after checking connectivity.",
        "twelve_data",
        "UPSTREAM_ERROR",
        true,
      );
    }

    if (response.status === 429) {
      throw new MarketDataProviderError(
        "Twelve Data rate limit reached. Back off and preserve remaining quota.",
        "twelve_data",
        "RATE_LIMITED",
        true,
      );
    }

    if (!response.ok) {
      throw new MarketDataProviderError(
        `Twelve Data returned HTTP ${response.status}.`,
        "twelve_data",
        "UPSTREAM_ERROR",
        response.status >= 500,
      );
    }

    const payload = (await response.json()) as TwelveDataTimeSeriesResponse;
    if (!Array.isArray(payload.values)) {
      const message = payload.message || "Twelve Data returned an unexpected response.";
      throw new MarketDataProviderError(
        message,
        "twelve_data",
        "INVALID_RESPONSE",
        false,
      );
    }

    const retrievedAt = new Date().toISOString();
    const candles = payload.values.map((item) => {
      const sourceTimestamp = item.datetime ?? "";
      const parsedTime = new Date(sourceTimestamp);
      const timestamp = Number.isNaN(parsedTime.getTime())
        ? sourceTimestamp
        : parsedTime.toISOString();

      return {
        instrument: instrument.id,
        timeframe,
        timestamp,
        open: parseNumber(item.open),
        high: parseNumber(item.high),
        low: parseNumber(item.low),
        close: parseNumber(item.close),
        volume: item.volume === undefined ? null : parseNumber(item.volume),
        provider: "twelve_data" as const,
        retrievedAt,
        sourceTimestamp,
        provisional: false,
      };
    }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    return { candles, retrievedAt, symbol: payload.meta?.symbol ?? instrument.twelveDataSymbol };
  }
}
