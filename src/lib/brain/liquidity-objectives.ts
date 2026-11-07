/**
 * Explainable liquidity objectives from confirmed structure and equal-level pools.
 * Targets are contextual reference levels, not forecasts or trade instructions.
 */
export const LIQUIDITY_OBJECTIVES_VERSION = "0.1.0" as const;
export type ObjectiveTrend = "BULLISH" | "BEARISH" | "RANGE" | "UNDETERMINED";
export type ObjectiveInput = {
  instrument: string;
  timeframe: string;
  currentPrice: number;
  priceTolerance: number;
  structure: {
    status: "READY" | "INSUFFICIENT_DATA" | "INVALID_DATA";
    instrument: string;
    timeframe: string;
    trend: ObjectiveTrend;
    swings: Array<{ index: number; price: number; kind: "HIGH" | "LOW" }>;
    liquidityPools: Array<{ kind: "EQUAL_HIGHS" | "EQUAL_LOWS"; price: number; touches: number[]; tolerance: number }>;
  };
};
export type LiquidityObjective = {
  side: "ABOVE_PRICE" | "BELOW_PRICE";
  price: number;
  distance: number;
  sources: Array<"SWING_HIGH" | "SWING_LOW" | "EQUAL_HIGHS" | "EQUAL_LOWS">;
  evidenceCount: number;
};
export type LiquidityObjectivesResult = {
  engineVersion: typeof LIQUIDITY_OBJECTIVES_VERSION;
  status: "READY" | "INCOMPLETE" | "INVALID";
  instrument: string;
  timeframe: string;
  currentPrice: number;
  structureTrend: ObjectiveTrend;
  objectiveAlignment: "BULLISH_ALIGNED" | "BEARISH_ALIGNED" | "TWO_SIDED" | "UNDETERMINED";
  bullishObjectives: LiquidityObjective[];
  bearishObjectives: LiquidityObjective[];
  nearestBullishObjective: LiquidityObjective | null;
  nearestBearishObjective: LiquidityObjective | null;
  warnings: string[];
  tradeSignalGenerated: false;
};
const finite = (n: number) => Number.isFinite(n);
type RawLevel = { price: number; source: LiquidityObjective["sources"][number] };
function clusterLevels(levels: RawLevel[], currentPrice: number, tolerance: number): LiquidityObjective[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const groups: RawLevel[][] = [];
  for (const level of sorted) {
    const group = groups.find(g => Math.abs(g[0].price - level.price) <= tolerance);
    if (group) group.push(level); else groups.push([level]);
  }
  return groups.map(group => {
    const prices = group.map(x => x.price).sort((a, b) => a - b);
    const price = prices[Math.floor(prices.length / 2)];
    const side = price > currentPrice ? "ABOVE_PRICE" as const : "BELOW_PRICE" as const;
    const sources = [...new Set(group.map(x => x.source))];
    return { side, price, distance: Math.abs(price - currentPrice), sources, evidenceCount: group.length };
  }).sort((a, b) => a.distance - b.distance);
}
export function calculateLiquidityObjectives(input: ObjectiveInput): LiquidityObjectivesResult {
  const warnings: string[] = [];
  if (!input.instrument?.trim() || !input.timeframe?.trim()) warnings.push("Instrument and timeframe are required.");
  if (!finite(input.currentPrice) || input.currentPrice <= 0) warnings.push("currentPrice must be a positive finite value.");
  if (!finite(input.priceTolerance) || input.priceTolerance <= 0) warnings.push("An explicit positive priceTolerance is required.");
  if (input.structure.instrument !== input.instrument || input.structure.timeframe !== input.timeframe) warnings.push("Structure instrument/timeframe must match the objective request.");
  if (!["READY", "INSUFFICIENT_DATA", "INVALID_DATA"].includes(input.structure.status)) warnings.push("Unsupported structure status.");
  if (!["BULLISH", "BEARISH", "RANGE", "UNDETERMINED"].includes(input.structure.trend)) warnings.push("Unsupported structure trend.");
  for (const swing of input.structure.swings) {
    if (!finite(swing.price) || swing.price <= 0 || !Number.isInteger(swing.index) || swing.index < 0 || !["HIGH", "LOW"].includes(swing.kind)) warnings.push("Structure contains an invalid swing point.");
  }
  for (const pool of input.structure.liquidityPools) {
    if (!finite(pool.price) || pool.price <= 0 || !finite(pool.tolerance) || pool.tolerance <= 0 || !Array.isArray(pool.touches) || pool.touches.length < 2 || !["EQUAL_HIGHS", "EQUAL_LOWS"].includes(pool.kind)) warnings.push("Structure contains an invalid equal-level liquidity pool.");
  }
  const base = {
    engineVersion: LIQUIDITY_OBJECTIVES_VERSION,
    instrument: input.instrument,
    timeframe: input.timeframe,
    currentPrice: input.currentPrice,
    structureTrend: input.structure.trend,
    tradeSignalGenerated: false as const
  };
  if (warnings.length) return { ...base, status: "INVALID", objectiveAlignment: "UNDETERMINED", bullishObjectives: [], bearishObjectives: [], nearestBullishObjective: null, nearestBearishObjective: null, warnings };
  if (input.structure.status !== "READY") return { ...base, status: "INCOMPLETE", objectiveAlignment: "UNDETERMINED", bullishObjectives: [], bearishObjectives: [], nearestBullishObjective: null, nearestBearishObjective: null, warnings: ["Confirmed structure evidence is not ready; liquidity objectives are withheld."] };
  const levels: RawLevel[] = [];
  for (const swing of input.structure.swings) {
    if (swing.kind === "HIGH" && swing.price > input.currentPrice + input.priceTolerance) levels.push({ price: swing.price, source: "SWING_HIGH" });
    if (swing.kind === "LOW" && swing.price < input.currentPrice - input.priceTolerance) levels.push({ price: swing.price, source: "SWING_LOW" });
  }
  for (const pool of input.structure.liquidityPools) {
    if (pool.kind === "EQUAL_HIGHS" && pool.price > input.currentPrice + input.priceTolerance) levels.push({ price: pool.price, source: "EQUAL_HIGHS" });
    if (pool.kind === "EQUAL_LOWS" && pool.price < input.currentPrice - input.priceTolerance) levels.push({ price: pool.price, source: "EQUAL_LOWS" });
  }
  const clustered = clusterLevels(levels, input.currentPrice, input.priceTolerance);
  const bullishObjectives = clustered.filter(x => x.side === "ABOVE_PRICE");
  const bearishObjectives = clustered.filter(x => x.side === "BELOW_PRICE");
  const objectiveAlignment = input.structure.trend === "BULLISH" ? "BULLISH_ALIGNED" : input.structure.trend === "BEARISH" ? "BEARISH_ALIGNED" : input.structure.trend === "RANGE" ? "TWO_SIDED" : "UNDETERMINED";
  return { ...base, status: "READY", objectiveAlignment, bullishObjectives, bearishObjectives, nearestBullishObjective: bullishObjectives[0] ?? null, nearestBearishObjective: bearishObjectives[0] ?? null, warnings: [] };
}
