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

export interface NormalizedCandle {
  instrument: InstrumentId;
  timeframe: MarketDataTimeframe;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  provider: ProviderId;
  retrievedAt: string;
  sourceTimestamp: string;
  provisional: boolean;
}

export interface CandleValidation {
  status: DataReadiness;
  checkedAt: string;
  candleCount: number;
  invalidCandles: number;
  duplicateTimestamps: string[];
  warnings: string[];
  errors: string[];
  freshnessSeconds: number | null;
  freshnessThresholdSeconds: number | null;
  confidenceScore: null;
  confidenceNote: string;
}

export interface MarketDataSnapshot {
  instrument: InstrumentId;
  timeframe: MarketDataTimeframe;
  provider: ProviderId;
  retrievedAt: string;
  source: {
    symbol: string;
    endpoint: string;
    attribution: string;
  };
  candles: NormalizedCandle[];
  validation: CandleValidation;
  limitations: string[];
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
      | "UNSUPPORTED_CAPABILITY",
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MarketDataProviderError";
  }
}
