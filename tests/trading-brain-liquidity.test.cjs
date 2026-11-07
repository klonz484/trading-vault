/* global require */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { assessLiquidity } = require("../src/lib/trading-brain/skills/liquidity.ts");

const candles = [
  { timestamp: "2026-11-06T10:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 1.1020, high: 1.1040, low: 1.1010, close: 1.1030, isClosed: true },
  { timestamp: "2026-11-06T11:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 1.1030, high: 1.1050, low: 1.1000, close: 1.1040, isClosed: true },
  { timestamp: "2026-11-06T12:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 1.1040, high: 1.1060, low: 1.0998, close: 1.1040, isClosed: true },
];

const input = (overrides = {}) => ({
  instrument: "EURUSD",
  timeframe: "H1",
  candles,
  structure: {
    bias: "RANGE_OR_UNCLEAR",
    swings: [
      { kind: "HIGH", price: 1.1050, timestamp: candles[0].timestamp, candleIndex: 0, confirmed: true },
      { kind: "HIGH", price: 1.1052, timestamp: candles[1].timestamp, candleIndex: 1, confirmed: true },
      { kind: "LOW", price: 1.1000, timestamp: candles[0].timestamp, candleIndex: 0, confirmed: true },
      { kind: "LOW", price: 1.1002, timestamp: candles[1].timestamp, candleIndex: 1, confirmed: true },
    ],
    latestBreak: null,
  },
  evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
  sourceReferences: [{
    sourceId: "test-snapshot",
    providerId: "test-provider",
    observedAt: candles[2].timestamp,
    receivedAt: candles[2].timestamp,
    instrument: "EURUSD",
    timeframe: "H1",
  }],
  ...overrides,
});

const policy = {
  equalLevelTolerance: 0.0005,
  minimumTouches: 2,
  sweepBuffer: 0.0002,
  requireClosedCandleForSweepConfirmation: true,
};

test("requires explicit equal-level and sweep thresholds", () => {
  const result = assessLiquidity(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("blocks liquidity analysis when upstream evidence is not READY", () => {
  const result = assessLiquidity(input({
    evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "CONFLICTED" },
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "EVIDENCE_NOT_READY");
});

test("detects candidate equal-high/equal-low pools and closed-candle sweeps", () => {
  const result = assessLiquidity(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.evidenceReadiness, "READY");
  assert.equal(result.assessment.pools.length, 2);
  assert.ok(result.assessment.pools.some((pool) => pool.side === "BUY_SIDE"));
  assert.ok(result.assessment.pools.some((pool) => pool.side === "SELL_SIDE"));
  assert.equal(result.assessment.sweeps.length, 2);
  assert.ok(result.assessment.sweeps.every((sweep) => sweep.confirmation === "CONFIRMED_CLOSED_CANDLE"));
});

test("does not use forming candles to confirm liquidity sweeps", () => {
  const forming = {
    ...candles[2],
    timestamp: "2026-11-06T13:00:00.000Z",
    high: 1.1100,
    low: 1.0950,
    close: 1.1040,
    isClosed: false,
  };
  const result = assessLiquidity(input({ candles: [...candles.slice(0, 2), forming] }), policy);
  assert.ok(result.findings.some((finding) => finding.code === "PROVISIONAL_CANDLE_IGNORED"));
  assert.equal(result.assessment.sweeps.length, 0);
});

test("rejects candle instrument/timeframe mismatches", () => {
  const invalid = [...candles];
  invalid[2] = { ...invalid[2], instrument: "XAUUSD" };
  const result = assessLiquidity(input({ candles: invalid }), policy);
  assert.equal(result.status, "REJECTED");
  assert.ok(result.findings.some((finding) => finding.code === "INSTRUMENT_OR_TIMEFRAME_MISMATCH"));
});
