import type { InstrumentId, MarketDataTimeframe } from "./types";

export type MT5BrokerId = "RCG_MARKETS" | "VAULT_MARKETS";
export type MT5BatchStatus = "ACCEPTABLE" | "REJECTED";

export interface MT5CandleObservation {
  instrument: InstrumentId;
  brokerSymbol: string;
  timeframe: MarketDataTimeframe;
  sourceTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  realVolume: number | null;
  spreadPoints: number | null;
  provisional: boolean;
}

export interface MT5TickObservation {
  instrument: InstrumentId;
  brokerSymbol: string;
  sourceTimeMs: number;
  bid: number;
  ask: number;
  last: number | null;
  volume: number | null;
  volumeReal: number | null;
  flags: number;
}

export interface MT5IngestBatch {
  schemaVersion: "1.0.0";
  batchId: string;
  brokerId: MT5BrokerId;
  terminalInstanceId: string;
  sentAt: string;
  candles: MT5CandleObservation[];
  ticks: MT5TickObservation[];
}

export interface MT5BatchValidation {
  status: MT5BatchStatus;
  errors: string[];
  acceptedCandleCount: number;
  acceptedTickCount: number;
  duplicateKeys: string[];
  warnings: string[];
}

const INSTRUMENTS = new Set<InstrumentId>([
  "EURUSD", "XAUUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
]);
const TIMEFRAMES = new Set<MarketDataTimeframe>(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}
function nullableNonNegative(value: unknown): boolean {
  return value === null || (finite(value) && value >= 0);
}

/**
 * Pure schema/quality boundary for batches from a read-only MT5 collector.
 * Authentication, replay protection, durable acknowledgement and persistence
 * belong to the API/server layer and are deliberately not simulated here.
 */
export function validateMT5IngestBatch(value: unknown): MT5BatchValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateKeys: string[] = [];

  if (!record(value)) {
    return {
      status: "REJECTED",
      errors: ["The MT5 batch must be a JSON object."],
      acceptedCandleCount: 0,
      acceptedTickCount: 0,
      duplicateKeys,
      warnings,
    };
  }

  if (value.schemaVersion !== "1.0.0") errors.push("Unsupported MT5 batch schema version.");
  if (!nonEmpty(value.batchId) || value.batchId.length > 128) errors.push("A non-empty batch identifier of at most 128 characters is required.");
  if (value.brokerId !== "RCG_MARKETS" && value.brokerId !== "VAULT_MARKETS") errors.push("Broker identity must be RCG_MARKETS or VAULT_MARKETS.");
  if (!nonEmpty(value.terminalInstanceId) || value.terminalInstanceId.length > 128) errors.push("A bounded terminal instance identifier is required.");
  if (!nonEmpty(value.sentAt) || !Number.isFinite(Date.parse(value.sentAt))) errors.push("Batch sentAt must be a valid ISO timestamp.");
  if (!Array.isArray(value.candles) || !Array.isArray(value.ticks)) errors.push("Candles and ticks must both be arrays.");

  const candles = Array.isArray(value.candles) ? value.candles : [];
  const ticks = Array.isArray(value.ticks) ? value.ticks : [];
  if (candles.length + ticks.length === 0) errors.push("An empty MT5 batch is not accepted.");
  if (candles.length > 5000 || ticks.length > 10000) errors.push("Batch exceeds the configured observation count limit.");

  const keys = new Set<string>();
  let validCandles = 0;
  let validTicks = 0;

  candles.forEach((item, index) => {
    if (!record(item)) {
      errors.push(`Candle ${index} must be an object.`);
      return;
    }
    const validInstrument = INSTRUMENTS.has(item.instrument as InstrumentId);
    if (!validInstrument) errors.push(`Candle ${index} has an unsupported instrument.`);
    if (!nonEmpty(item.brokerSymbol) || item.brokerSymbol.length > 64) errors.push(`Candle ${index} has an invalid broker symbol.`);
    if (!TIMEFRAMES.has(item.timeframe as MarketDataTimeframe)) errors.push(`Candle ${index} has an unsupported timeframe.`);
    if (!nonEmpty(item.sourceTime) || !Number.isFinite(Date.parse(item.sourceTime))) errors.push(`Candle ${index} has an invalid source timestamp.`);
    const prices = [item.open, item.high, item.low, item.close];
    if (
      prices.some((price) => !positive(price)) ||
      (finite(item.high) && finite(item.open) && item.high < item.open) ||
      (finite(item.high) && finite(item.close) && item.high < item.close) ||
      (finite(item.low) && finite(item.open) && item.low > item.open) ||
      (finite(item.low) && finite(item.close) && item.low > item.close) ||
      (finite(item.high) && finite(item.low) && item.high < item.low)
    ) errors.push(`Candle ${index} contains invalid OHLC values.`);
    if (!finite(item.tickVolume) || item.tickVolume < 0) errors.push(`Candle ${index} has invalid tick volume.`);
    if (!nullableNonNegative(item.realVolume) || !nullableNonNegative(item.spreadPoints)) errors.push(`Candle ${index} has invalid volume or spread metadata.`);
    if (typeof item.provisional !== "boolean") errors.push(`Candle ${index} must explicitly identify provisional/closed state.`);
    if (validInstrument && nonEmpty(item.brokerSymbol) && TIMEFRAMES.has(item.timeframe as MarketDataTimeframe) && nonEmpty(item.sourceTime)) {
      const key = `C:${item.instrument}:${item.timeframe}:${item.sourceTime}`;
      if (keys.has(key)) duplicateKeys.push(key);
      keys.add(key);
    }
    if (
      validInstrument && nonEmpty(item.brokerSymbol) &&
      TIMEFRAMES.has(item.timeframe as MarketDataTimeframe) &&
      nonEmpty(item.sourceTime) && Number.isFinite(Date.parse(item.sourceTime)) &&
      prices.every(positive) && finite(item.tickVolume) && item.tickVolume >= 0 &&
      nullableNonNegative(item.realVolume) && nullableNonNegative(item.spreadPoints) &&
      typeof item.provisional === "boolean"
    ) validCandles += 1;
  });

  ticks.forEach((item, index) => {
    if (!record(item)) {
      errors.push(`Tick ${index} must be an object.`);
      return;
    }
    if (!INSTRUMENTS.has(item.instrument as InstrumentId)) errors.push(`Tick ${index} has an unsupported instrument.`);
    if (!nonEmpty(item.brokerSymbol) || item.brokerSymbol.length > 64) errors.push(`Tick ${index} has an invalid broker symbol.`);
    if (!finite(item.sourceTimeMs) || !Number.isSafeInteger(item.sourceTimeMs) || item.sourceTimeMs <= 0) errors.push(`Tick ${index} requires a positive integer millisecond timestamp.`);
    if (!positive(item.bid) || !positive(item.ask) || (finite(item.bid) && finite(item.ask) && item.ask < item.bid)) errors.push(`Tick ${index} has invalid bid/ask prices.`);
    if (!nullableNonNegative(item.last) || !nullableNonNegative(item.volume) || !nullableNonNegative(item.volumeReal)) errors.push(`Tick ${index} has invalid optional last/volume values.`);
    if (!Number.isSafeInteger(item.flags) || (item.flags as number) < 0) errors.push(`Tick ${index} has invalid MT5 tick flags.`);
    if (INSTRUMENTS.has(item.instrument as InstrumentId) && nonEmpty(item.brokerSymbol) && finite(item.sourceTimeMs)) {
      const key = `T:${item.instrument}:${item.sourceTimeMs}:${item.bid}:${item.ask}:${item.flags}`;
      if (keys.has(key)) duplicateKeys.push(key);
      keys.add(key);
    }
    if (
      INSTRUMENTS.has(item.instrument as InstrumentId) && nonEmpty(item.brokerSymbol) &&
      finite(item.sourceTimeMs) && Number.isSafeInteger(item.sourceTimeMs) && item.sourceTimeMs > 0 &&
      positive(item.bid) && positive(item.ask) && item.ask >= item.bid &&
      nullableNonNegative(item.last) && nullableNonNegative(item.volume) &&
      nullableNonNegative(item.volumeReal) && Number.isSafeInteger(item.flags) && (item.flags as number) >= 0
    ) validTicks += 1;
  });

  if (duplicateKeys.length > 0) errors.push("Duplicate observations were found within the batch.");
  if (candles.some((item) => record(item) && item.provisional === true)) {
    warnings.push("Provisional candles are retained as provisional and must not be used as confirmed structural evidence.");
  }
  if (validCandles !== candles.length || validTicks !== ticks.length) {
    warnings.push("One or more observations failed validation and must not be persisted as eligible market evidence.");
  }

  return {
    status: errors.length === 0 ? "ACCEPTABLE" : "REJECTED",
    errors: [...new Set(errors)],
    acceptedCandleCount: errors.length === 0 ? validCandles : 0,
    acceptedTickCount: errors.length === 0 ? validTicks : 0,
    duplicateKeys,
    warnings,
  };
}
