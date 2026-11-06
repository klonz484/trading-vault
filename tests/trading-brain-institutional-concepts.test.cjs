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

const { assessInstitutionalConcepts } = require("../src/lib/trading-brain/skills/institutional-concepts.ts");

const baseCandles = [
  { timestamp: "2026-11-06T10:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 100.0, high: 101.0, low: 99.0, close: 100.5, isClosed: true },
  { timestamp: "2026-11-06T11:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 100.5, high: 104.0, low: 100.0, close: 103.0, isClosed: true },
  { timestamp: "2026-11-06T12:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 103.0, high: 104.0, low: 102.0, close: 102.5, isClosed: true },
  { timestamp: "2026-11-06T13:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 102.5, high: 106.0, low: 102.0, close: 105.0, isClosed: true },
  { timestamp: "2026-11-06T14:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 105.0, high: 107.0, low: 104.0, close: 106.5, isClosed: true },
  { timestamp: "2026-11-06T15:00:00.000Z", instrument: "EURUSD", timeframe: "H1", open: 106.5, high: 107.0, low: 103.0, close: 105.5, isClosed: true },
];

const input = (overrides = {}) => ({
  instrument: "EURUSD",
  timeframe: "H1",
  candles: baseCandles,
  structure: {
    bias: "BULLISH",
    swings: [],
    latestBreak: {
      direction: "BULLISH",
      level: 105.0,
      candleClose: 106.5,
      candleTimestamp: baseCandles[4].timestamp,
      context: "CONTINUATION_CANDIDATE",
      confirmation: "CONFIRMED_CLOSED_CANDLE",
    },
  },
  evidenceGate: { status: "COMPLETE", evidenceReadiness: "READY" },
  sourceReferences: [{
    sourceId: "test-snapshot",
    providerId: "test-provider",
    observedAt: baseCandles[5].timestamp,
    receivedAt: baseCandles[5].timestamp,
    instrument: "EURUSD",
    timeframe: "H1",
  }],
  ...overrides,
});

const policy = {
  minimumFvgSize: 0.5,
  orderBlockLookbackBars: 3,
  zoneInvalidationBuffer: 0.1,
  requireClosedCandles: true,
};

test("requires explicit institutional concept thresholds", () => {
  const result = assessInstitutionalConcepts(input());
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "POLICY_MISSING");
});

test("blocks analysis when evidence quality is not READY", () => {
  const result = assessInstitutionalConcepts(input({
    evidenceGate: { status: "INCOMPLETE", evidenceReadiness: "STALE" },
  }), policy);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings[0].code, "EVIDENCE_NOT_READY");
});

test("detects a three-closed-candle bullish FVG and an order-block candidate", () => {
  const result = assessInstitutionalConcepts(input(), policy);
  assert.equal(result.status, "COMPLETE");
  assert.ok(result.assessment.fairValueGaps.some((gap) =>
    gap.direction === "BULLISH" &&
    gap.zone.low === 101 &&
    gap.zone.high === 102 &&
    gap.confirmation === "THREE_CLOSED_CANDLES"
  ));
  assert.equal(result.assessment.orderBlocks.length, 1);
  assert.equal(result.assessment.orderBlocks[0].sourceCandleAt, baseCandles[2].timestamp);
  assert.equal(result.assessment.orderBlocks[0].status, "MITIGATED");
});

test("identifies a breaker candidate only after closed-candle order-block invalidation", () => {
  const invalidatingCandle = {
    ...baseCandles[5],
    high: 101.0,
    low: 99.0,
    close: 100.0,
  };
  const result = assessInstitutionalConcepts(input({
    candles: [...baseCandles.slice(0, 5), invalidatingCandle],
  }), policy);
  assert.equal(result.assessment.orderBlocks[0].status, "INVALIDATED");
  assert.equal(result.assessment.breakerBlocks.length, 1);
  assert.equal(result.assessment.breakerBlocks[0].direction, "BEARISH");
  assert.equal(result.assessment.breakerBlocks[0].confirmation, "CLOSED_CANDLE_INVALIDATION");
});

test("forming candles cannot create FVGs or invalidate order blocks", () => {
  const forming = {
    ...baseCandles[5],
    timestamp: "2026-11-06T16:00:00.000Z",
    high: 101.0,
    low: 99.0,
    close: 100.0,
    isClosed: false,
  };
  const result = assessInstitutionalConcepts(input({
    candles: [...baseCandles.slice(0, 5), forming],
  }), policy);
  assert.ok(result.findings.some((finding) => finding.code === "PROVISIONAL_CANDLES_IGNORED"));
  assert.equal(result.assessment.orderBlocks[0].status, "UNMITIGATED");
  assert.equal(result.assessment.breakerBlocks.length, 0);
});

test("does not create an order block without a valid confirmed structure break", () => {
  const result = assessInstitutionalConcepts(input({
    structure: { bias: "RANGE_OR_UNCLEAR", swings: [], latestBreak: null },
  }), policy);
  assert.equal(result.assessment.orderBlocks.length, 0);
  assert.ok(result.findings.some((finding) => finding.code === "NO_STRUCTURE_BREAK"));
});
