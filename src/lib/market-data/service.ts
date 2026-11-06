import { getInstrument } from "./instruments";
import { validateCandles } from "./quality";
import { TwelveDataProvider } from "./providers/twelve-data";
import type { InstrumentId, MarketDataSnapshot, MarketDataTimeframe } from "./types";

const twelveData = new TwelveDataProvider();

/**
 * On-demand retrieval only. No background polling, automatic fallback,
 * persistence, or trade-ready status is enabled by this foundation package.
 */
export async function getTwelveDataSnapshot(
  instrumentId: InstrumentId,
  timeframe: MarketDataTimeframe,
  options: { outputsize?: number; maxAgeSeconds?: number } = {},
): Promise<MarketDataSnapshot> {
  const instrument = getInstrument(instrumentId);
  if (!instrument) throw new Error(`Unsupported instrument: ${instrumentId}`);

  const result = await twelveData.getTimeSeries(
    instrument,
    timeframe,
    options.outputsize ?? 100,
  );

  const validation = validateCandles(result.candles, {
    maxAgeSeconds: options.maxAgeSeconds,
  });

  return {
    instrument: instrumentId,
    timeframe,
    provider: "twelve_data",
    retrievedAt: result.retrievedAt,
    source: {
      symbol: result.symbol,
      endpoint: "/time_series",
      attribution: "Twelve Data",
    },
    candles: result.candles,
    validation,
    limitations: [
      "Provider entitlement and licensing must be verified for this account and intended multi-user use.",
      "Freshness thresholds are not calibrated; data cannot be marked READY until approved thresholds are supplied.",
      "This package does not persist observations to Supabase.",
      "This package does not run background polling or automatically switch providers.",
      "No bid/ask execution quote is inferred from OHLC candle data.",
      "Forming-candle state is not inferred; the provider candle is treated as a source observation, not a confirmed market-structure event.",
    ],
  };
}
