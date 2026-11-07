/**
 * Fair-value-gap and order-block evidence primitives.
 * Zones are descriptive candidates only; no institutional intent is inferred.
 */
export const ZONE_EVIDENCE_VERSION = "0.1.0" as const;
export type ZoneCandle = { timeUtc: string; open: number; high: number; low: number; close: number; closed: true };
export type ZoneDirection = "BULLISH" | "BEARISH";
export type ZoneStructureEvent = { type: "BOS" | "CHOCH" | "MSS"; direction: ZoneDirection; candleIndex: number };
export type ZoneDisplacement = { direction: ZoneDirection; candleIndex: number };
export type ZoneInput = {
  instrument: string;
  timeframe: string;
  candles: ZoneCandle[];
  structureEvents: ZoneStructureEvent[];
  displacement: ZoneDisplacement[];
  orderBlockLookback: number;
};
export type ZoneState = "OPEN" | "TOUCHED" | "FILLED" | "INVALIDATED";
export type Zone = {
  direction: ZoneDirection;
  low: number;
  high: number;
  createdAtIndex: number;
  createdAtUtc: string;
  status: ZoneState;
  firstMitigationIndex: number | null;
  lastStatusChangeIndex: number | null;
  definition: string;
};
export type ZoneResult = {
  engineVersion: typeof ZONE_EVIDENCE_VERSION;
  status: "READY" | "INSUFFICIENT_DATA" | "INVALID_DATA";
  instrument: string;
  timeframe: string;
  fairValueGaps: Zone[];
  orderBlocks: Zone[];
  warnings: string[];
  tradeSignalGenerated: false;
};
const finite = (n: number) => Number.isFinite(n);
function validate(input: ZoneInput): string[] {
  const errors: string[] = [];
  if (!input.instrument?.trim() || !input.timeframe?.trim()) errors.push("Instrument and timeframe are required.");
  if (!Number.isInteger(input.orderBlockLookback) || input.orderBlockLookback < 1 || input.orderBlockLookback > 100) errors.push("orderBlockLookback must be an integer from 1 to 100.");
  let previous = -Infinity;
  for (let i = 0; i < input.candles.length; i++) {
    const c = input.candles[i], time = Date.parse(c.timeUtc);
    if (c.closed !== true) errors.push(`Candle ${i} is not confirmed closed.`);
    if (!Number.isFinite(time) || time <= previous) errors.push(`Candle ${i} timestamp is invalid or not strictly increasing.`);
    previous = time;
    if (![c.open, c.high, c.low, c.close].every(finite) || c.high < c.low || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) errors.push(`Candle ${i} has invalid OHLC values.`);
  }
  for (const event of input.structureEvents) {
    if (!Number.isInteger(event.candleIndex) || event.candleIndex < 0 || event.candleIndex >= input.candles.length) errors.push("A structure event has an out-of-range candleIndex.");
  }
  for (const event of input.displacement) {
    if (!Number.isInteger(event.candleIndex) || event.candleIndex < 0 || event.candleIndex >= input.candles.length) errors.push("A displacement observation has an out-of-range candleIndex.");
  }
  return errors;
}
function applyFvgMitigation(zone: Zone, candles: ZoneCandle[]): Zone {
  let status: ZoneState = "OPEN", firstMitigationIndex: number | null = null, lastStatusChangeIndex: number | null = null;
  for (let i = zone.createdAtIndex + 1; i < candles.length && status !== "INVALIDATED"; i++) {
    const c = candles[i];
    let next: ZoneState = status;
    if (zone.direction === "BULLISH") {
      if (c.close < zone.low) next = "INVALIDATED";
      else if (c.low <= zone.low) next = "FILLED";
      else if (c.low <= zone.high && status === "OPEN") next = "TOUCHED";
    } else {
      if (c.close > zone.high) next = "INVALIDATED";
      else if (c.high >= zone.high) next = "FILLED";
      else if (c.high >= zone.low && status === "OPEN") next = "TOUCHED";
    }
    if (next !== status) {
      if (firstMitigationIndex === null && next !== "INVALIDATED") firstMitigationIndex = i;
      lastStatusChangeIndex = i;
      status = next;
    }
  }
  return { ...zone, status, firstMitigationIndex, lastStatusChangeIndex };
}
function applyObMitigation(zone: Zone, candles: ZoneCandle[]): Zone {
  let status: ZoneState = "OPEN", firstMitigationIndex: number | null = null, lastStatusChangeIndex: number | null = null;
  for (let i = zone.createdAtIndex + 1; i < candles.length && status !== "INVALIDATED"; i++) {
    const c = candles[i];
    let next = status;
    if (zone.direction === "BULLISH") {
      if (c.close < zone.low) next = "INVALIDATED";
      else if (c.low <= zone.low) next = "FILLED";
      else if (c.low <= zone.high && status === "OPEN") next = "TOUCHED";
    } else {
      if (c.close > zone.high) next = "INVALIDATED";
      else if (c.high >= zone.high) next = "FILLED";
      else if (c.high >= zone.low && status === "OPEN") next = "TOUCHED";
    }
    if (next !== status) {
      if (firstMitigationIndex === null && next !== "INVALIDATED") firstMitigationIndex = i;
      lastStatusChangeIndex = i;
      status = next;
    }
  }
  return { ...zone, status, firstMitigationIndex, lastStatusChangeIndex };
}
export function analyzeZoneEvidence(input: ZoneInput): ZoneResult {
  const errors = validate(input);
  const base = { engineVersion: ZONE_EVIDENCE_VERSION, instrument: input.instrument, timeframe: input.timeframe, tradeSignalGenerated: false as const };
  if (errors.length) return { ...base, status: "INVALID_DATA", fairValueGaps: [], orderBlocks: [], warnings: errors };
  if (input.candles.length < 3) return { ...base, status: "INSUFFICIENT_DATA", fairValueGaps: [], orderBlocks: [], warnings: ["At least three closed candles are required to evaluate three-candle fair-value gaps."] };
  const fvg: Zone[] = [];
  for (let i = 2; i < input.candles.length; i++) {
    const first = input.candles[i - 2], third = input.candles[i];
    if (third.low > first.high) {
      fvg.push(applyFvgMitigation({ direction: "BULLISH", low: first.high, high: third.low, createdAtIndex: i, createdAtUtc: third.timeUtc, status: "OPEN", firstMitigationIndex: null, lastStatusChangeIndex: null, definition: "Three-candle bullish imbalance: third-candle low is above first-candle high." }, input.candles));
    } else if (third.high < first.low) {
      fvg.push(applyFvgMitigation({ direction: "BEARISH", low: third.high, high: first.low, createdAtIndex: i, createdAtUtc: third.timeUtc, status: "OPEN", firstMitigationIndex: null, lastStatusChangeIndex: null, definition: "Three-candle bearish imbalance: third-candle high is below first-candle low." }, input.candles));
    }
  }
  const orderBlocks: Zone[] = [];
  const displacementByIndex = new Map(input.displacement.map(d => [d.candleIndex, d.direction]));
  for (const event of input.structureEvents) {
    const direction = displacementByIndex.get(event.candleIndex);
    if (!direction || direction !== event.direction) continue;
    const start = Math.max(0, event.candleIndex - input.orderBlockLookback);
    let origin = -1;
    for (let i = event.candleIndex - 1; i >= start; i--) {
      const c = input.candles[i];
      const opposing = direction === "BULLISH" ? c.close < c.open : c.close > c.open;
      if (opposing) { origin = i; break; }
    }
    if (origin < 0) continue;
    const candle = input.candles[origin];
    const duplicate = orderBlocks.some(z => z.direction === direction && z.createdAtIndex === origin);
    if (duplicate) continue;
    orderBlocks.push(applyObMitigation({
      direction, low: candle.low, high: candle.high, createdAtIndex: origin, createdAtUtc: candle.timeUtc,
      status: "OPEN", firstMitigationIndex: null, lastStatusChangeIndex: null,
      definition: `Last opposing candle before a same-direction closed-candle displacement and BOS/CHoCH/MSS at index ${event.candleIndex}; candidate only.`
    }, input.candles));
  }
  return { ...base, status: "READY", fairValueGaps: fvg, orderBlocks, warnings: [] };
}
