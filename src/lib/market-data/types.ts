export const MARKET_DATA_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;

export type MarketDataTimeframe = (typeof MARKET_DATA_TIMEFRAMES)[number];
export type InstrumentId =
  | "EURUSD"
  | "XAUUSD"
  | "GBPUSD"
  | "USDJPY"
  | "USDCHF"
  | "USDCAD"
  | "AUDUSD"
  | "NZDUSD";

export type ProviderId = "twelve_data" | "alpha_vantage";
export type DataReadiness =
  | "READY"
  | "DEGRADED"
  | "STALE"
  | "INCOMPLETE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export type EvidenceVerification = "VERIFIED" | "UNVERIFIED" | "RESTRICTED" | "UNAVAILABLE";

export interface InstrumentDefinition {
  id: InstrumentId;
  baseCurrency: string;
  quoteCurrency: string;
  assetClass: "forex" | "metal";
  twelveDataSymbol: string;
  alphaVantagePair?: readonly [string, string];
  initialPriority: boolean;
  providerEntitlementsRequireVerification: true;
}

/** A normalized candle retains the exact source timestamp and its interpretation. */
export interface NormalizedCandle {
  instrument: InstrumentId;
  timeframe: MarketDataTimeframe;
  /** Canonical UTC ISO-8601 instant. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  provider: ProviderId;
  retrievedAt: string;
  /** Exact timestamp text returned by the provider. */
  sourceTimestamp: string;
  /** Timezone used to interpret sourceTimestamp; never inferred from host locale. */
  sourceTimezone: string;
  /** True until the documented candle-close rule confirms completion. */
  provisional: boolean;
}

export interface CandleValidation {
  status: DataReadiness;
  checkedAt: string;
  candleCount: number;
  eligibleCandleCount: number;
  invalidCandles: number;
  duplicateTimestamps: string[];
  outOfOrderTimestamps: string[];
  missingIntervals: string[];
  futureTimestamps: string[];
  warnings: string[];
  errors: string[];
  freshnessSeconds: number | null;
  freshnessThresholdSeconds: number | null;
  confidenceScore: null;
  confidenceNote: string;
}

export interface MarketDataSnapshot {
  schemaVersion: "1.0.0";
  snapshotVersion: string;
  instrument: InstrumentId;
  timeframe: MarketDataTimeframe;
  provider: ProviderId;
  retrievedAt: string;
  source: {
    symbol: string;
    endpoint: string;
    attribution: string;
    sourceTimezone: string;
    entitlementStatus: EvidenceVerification;
    licenceStatus: EvidenceVerification;
  };
  /** Only validated, eligible observations; provisional candles remain explicitly marked. */
  candles: NormalizedCandle[];
  /** Original normalized provider observations, including invalid records for audit. */
  rawCandles: NormalizedCandle[];
  /** Immutable correction events carried with the snapshot; persistence is a separate approved layer. */
  correctionHistory: EvidenceCorrection[];
  validation: CandleValidation;
  limitations: string[];
}

export interface ProviderConflict {
  instrument: InstrumentId;
  timeframe: MarketDataTimeframe;
  timestamp: string;
  providerA: ProviderId;
  providerB: ProviderId;
  closeA: number;
  closeB: number;
  absoluteDifference: number;
  threshold: number;
  status: "CONFLICTED";
}

export interface EvidenceCorrection {
  correctionId: string;
  recordedAt: string;
  reason: string;
  supersedesVersion: string;
  replacementVersion: string;
}

export class MarketDataProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderId,
    public readonly code:
      | "MISSING_CREDENTIAL"
      | "RATE_LIMITED"
      | "UPSTREAM_ERROR"
      | "INVALID_RESPONSE"
      | "UNSUPPORTED_CAPABILITY"
      | "ENTITLEMENT"
      | "INVALID_REQUEST"
      | "TIMEOUT",
    public readonly retryable: boolean,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "MarketDataProviderError";
  }
}
