import { getInstrument } from "./instruments";
import { isCandleStructurallyValid, validateCandles } from "./quality";
import { TwelveDataProvider } from "./providers/twelve-data";
import type { InstrumentId, MarketDataSnapshot, MarketDataTimeframe } from "./types";

const twelveData = new TwelveDataProvider();

/**
 * On-demand retrieval only. The provider response is retained in rawCandles.
 * The public candles collection fails closed: if series-level validation has
 * blocking errors, no observations are exposed as analytically eligible.
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
    timeframe,
  });
  const individuallyValid = result.candles.filter(isCandleStructurallyValid);
  const hasBlockingSeriesErrors = validation.errors.length > 0 ||
    validation.status === "STALE" ||
    validation.status === "CONFLICTED" ||
    validation.status === "UNAVAILABLE";
  const eligibleCandles = hasBlockingSeriesErrors
    ? []
    : individuallyValid.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return {
    schemaVersion: "1.0.0",
    validatorVersion: "1.0.0",
    snapshotVersion: `1.0.0:${result.retrievedAt}:twelve_data:${instrumentId}:${timeframe}`,
    instrument: instrumentId,
    timeframe,
    provider: "twelve_data",
    retrievedAt: result.retrievedAt,
    source: {
      symbol: result.symbol,
      endpoint: "/time_series",
      attribution: "Twelve Data",
      sourceTimezone: "UTC",
      entitlementStatus: "UNVERIFIED",
      licenceStatus: "UNVERIFIED",
    },
    candles: eligibleCandles,
    rawCandles: result.candles,
    correctionHistory: [],
    validation,
    limitations: [
      "Provider entitlement and licensing are UNVERIFIED for this account and intended multi-user use.",
      "Freshness thresholds are not calibrated; data cannot be marked READY until approved thresholds are supplied.",
      "Raw provider observations are retained separately; candles are empty when blocking series-level validation errors exist.",
      "Provisional candle state is estimated from the requested UTC interval boundary; provider closure semantics must be independently verified before production use.",
      "Correction events can be represented and replayed in memory, but no observation or correction history is persisted; snapshot versioning is in-memory metadata only.",
      "This package does not run background polling or automatically switch providers.",
      "No bid/ask execution quote is inferred from OHLC candle data.",
      "No Scanner or Brain production integration is enabled by this package.",
    ],
  };
}
